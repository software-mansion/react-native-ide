const { useContext, useState, useEffect, useRef, useCallback } = require("react");
const {
  LogBox,
  AppRegistry,
  RootTagContext,
  View,
  Dimensions,
  Linking,
  findNodeHandle,
} = require("react-native");
const { PREVIEW_APP_KEY } = require("./preview");

const navigationPlugins = [];
export function registerNavigationPlugin(name, plugin) {
  navigationPlugins.push({ name, plugin });
}

let navigationHistory = new Map();

function getCurrentScene() {
  const SceneTracker = require("react-native/Libraries/Utilities/SceneTracker");
  return SceneTracker.getActiveScene().name;
}

function emptyNavigationHook() {
  return {
    getCurrentNavigationDescriptor: () => undefined,
    requestNavigationChange: () => {},
  };
}

function useAgentListener(agent, eventName, listener, deps = []) {
  useEffect(() => {
    if (agent) {
      agent._bridge.addListener(eventName, listener);
      return () => {
        agent._bridge.removeListener(eventName, listener);
      };
    }
  }, [agent, ...deps]);
}

export function PreviewAppWrapper({ children, initialProps, ..._rest }) {
  const rootTag = useContext(RootTagContext);
  const [devtoolsAgent, setDevtoolsAgent] = useState(null);
  const [hasLayout, setHasLayout] = useState(false);
  const mainContainerRef = useRef();

  const mountCallback = initialProps?.__RNIDE_onMount;
  useEffect(() => {
    mountCallback?.();
  }, [mountCallback]);

  const handleNavigationChange = useCallback(
    (navigationDescriptor) => {
      navigationHistory.set(navigationDescriptor.id, navigationDescriptor);
      devtoolsAgent?._bridge.send("RNIDE_navigationChanged", {
        displayName: navigationDescriptor.name,
        id: navigationDescriptor.id,
      });
    },
    [devtoolsAgent]
  );

  const useNavigationMainHook = navigationPlugins[0]?.plugin.mainHook || emptyNavigationHook;
  const { requestNavigationChange } = useNavigationMainHook({
    onNavigationChange: handleNavigationChange,
  });

  const openPreview = useCallback(
    (previewKey) => {
      AppRegistry.runApplication(PREVIEW_APP_KEY, {
        rootTag,
        initialProps: { previewKey },
      });
      const preview = global.__RNIDE_previews.get(previewKey);
      handleNavigationChange({ id: previewKey, name: `preview:${preview.name}` });
    },
    [rootTag, handleNavigationChange]
  );

  const closePreview = useCallback(() => {
    let closePromiseResolve;
    const closePreviewPromise = new Promise((resolve) => {
      closePromiseResolve = resolve;
    });
    if (getCurrentScene() === PREVIEW_APP_KEY) {
      AppRegistry.runApplication("main", {
        rootTag,
        initialProps: {
          __RNIDE_onMount: closePromiseResolve,
        },
      });
    } else {
      closePromiseResolve();
    }
    return closePreviewPromise;
  }, [rootTag]);

  useAgentListener(
    devtoolsAgent,
    "RNIDE_openPreview",
    (payload) => {
      openPreview(payload.previewId);
    },
    [openPreview]
  );

  useAgentListener(
    devtoolsAgent,
    "RNIDE_openUrl",
    (payload) => {
      closePreview().then(() => {
        const url = payload.url;
        Linking.openURL(url);
      });
    },
    [closePreview]
  );

  useAgentListener(
    devtoolsAgent,
    "RNIDE_openNavigation",
    (payload) => {
      const isPreviewUrl = payload.id.startsWith("preview://");
      if (isPreviewUrl) {
        openPreview(payload.id);
        return;
      }
      const navigationDescriptor = navigationHistory.get(payload.id);
      closePreview().then(() => {
        navigationDescriptor && requestNavigationChange(navigationDescriptor);
      });
    },
    [openPreview, closePreview, requestNavigationChange]
  );

  useAgentListener(
    devtoolsAgent,
    "RNIDE_inspect",
    (payload) => {
      const getInspectorDataForViewAtPoint = require("react-native/Libraries/Inspector/getInspectorDataForViewAtPoint");
      const { width, height } = Dimensions.get("screen");

      getInspectorDataForViewAtPoint(
        mainContainerRef.current,
        payload.x * width,
        payload.y * height,
        (viewData) => {
          const frame = viewData.frame;
          const scaledFrame = {
            x: frame.left / width,
            y: frame.top / height,
            width: frame.width / width,
            height: frame.height / height,
          };
          let stackPromise = Promise.resolve(undefined);
          if (payload.requestStack) {
            stackPromise = Promise.all(
              viewData.hierarchy.reverse().map((item) => {
                const inspectorData = item.getInspectorData((arg) => findNodeHandle(arg));
                const framePromise = new Promise((resolve, reject) => {
                  try {
                    inspectorData.measure((_x, _y, viewWidth, viewHeight, pageX, pageY) => {
                      resolve({
                        x: pageX / width,
                        y: pageY / height,
                        width: viewWidth / width,
                        height: viewHeight / height,
                      });
                    });
                  } catch (e) {
                    reject(e);
                  }
                });

                return framePromise
                  .catch(() => undefined)
                  .then((frame) => {
                    return inspectorData.source
                      ? {
                          componentName: item.name,
                          source: {
                            fileName: inspectorData.source.fileName,
                            line0Based: inspectorData.source.lineNumber - 1,
                            column0Based: inspectorData.source.columnNumber - 1,
                          },
                          frame,
                        }
                      : undefined;
                  });
              })
            ).then((stack) => stack?.filter(Boolean));
          }
          stackPromise.then((stack) => {
            devtoolsAgent._bridge.send("RNIDE_inspectData", {
              id: payload.id,
              frame: scaledFrame,
              stack: stack,
            });
          });
        }
      );
    },
    [mainContainerRef]
  );

  useAgentListener(devtoolsAgent, "RNIDE_iosDevMenu", (_payload) => {
    // this native module is present only on iOS and will crash if called
    // on Android
    const DevMenu = require("react-native/Libraries/NativeModules/specs/NativeDevMenu").default;

    DevMenu.show();
  });

  useEffect(() => {
    if (devtoolsAgent) {
      LogBox.uninstall();
      const LoadingView = require("react-native/Libraries/Utilities/LoadingView");
      LoadingView.showMessage = (message) => {
        devtoolsAgent._bridge.send("RNIDE_fastRefreshStarted");
      };
      LoadingView.hide = () => {
        devtoolsAgent._bridge.send("RNIDE_fastRefreshComplete");
      };
    }
  }, [devtoolsAgent]);

  useEffect(() => {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    hook.off("react-devtools", setDevtoolsAgent);
    if (hook.reactDevtoolsAgent) {
      setDevtoolsAgent(hook.reactDevtoolsAgent);
    } else {
      hook.on("react-devtools", setDevtoolsAgent);
      return () => {
        hook.off("react-devtools", setDevtoolsAgent);
      };
    }
  }, [setDevtoolsAgent]);

  useEffect(() => {
    if (!!devtoolsAgent && hasLayout) {
      const appKey = getCurrentScene();
      devtoolsAgent._bridge.send("RNIDE_appReady", {
        appKey,
        navigationPlugins: navigationPlugins.map((plugin) => plugin.name),
      });
    }
  }, [!!devtoolsAgent && hasLayout]);

  return (
    <View
      ref={mainContainerRef}
      style={{ flex: 1 }}
      onLayout={() => {
        setHasLayout(true);
      }}>
      {children}
    </View>
  );
}
