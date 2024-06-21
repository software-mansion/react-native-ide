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

const navigationPlugins = [];
export function registerNavigationPlugin(name, plugin) {
  navigationPlugins.push({ name, plugin });
}

let navigationHistory = new Map();

function isPreviewUrl(url) {
  return url.startsWith("preview://");
}

function getCurrentSceneName() {
  const SceneTracker = require("react-native/Libraries/Utilities/SceneTracker");
  return SceneTracker.getActiveScene().name;
}

function isRunningPreview() {
  return isPreviewUrl(getCurrentSceneName());
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

export function PreviewAppWrapper({ children, ...rest }) {
  const rootTag = useContext(RootTagContext);
  const [devtoolsAgent, setDevtoolsAgent] = useState(null);
  const [hasLayout, setHasLayout] = useState(false);
  const mainContainerRef = useRef();

  const handleNavigationChange = useCallback(
    (navigationDescriptor) => {
      navigationHistory.set(navigationDescriptor.id, navigationDescriptor);
      devtoolsAgent &&
        devtoolsAgent._bridge.send("RNIDE_navigationChanged", {
          displayName: navigationDescriptor.name,
          id: navigationDescriptor.id,
        });
    },
    [devtoolsAgent]
  );

  const useNavigationMainHook =
    (navigationPlugins.length && navigationPlugins[0].plugin.mainHook) || emptyNavigationHook;
  const { requestNavigationChange } = useNavigationMainHook({
    onNavigationChange: handleNavigationChange,
  });

  const openPreview = useCallback(
    (previewKey) => {
      AppRegistry.runApplication(previewKey, {
        rootTag,
        initialProps: {},
      });
    },
    [rootTag]
  );

  const closePreview = useCallback(() => {
    if (isRunningPreview()) {
      AppRegistry.runApplication("main", {
        rootTag,
        initialProps: {},
      });
    }
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
      closePreview();
      const url = payload.url;
      Linking.openURL(url);
    },
    [closePreview]
  );

  useAgentListener(
    devtoolsAgent,
    "RNIDE_openNavigation",
    (payload) => {
      if (isPreviewUrl(payload.id)) {
        openPreview(payload.id);
        return;
      }
      closePreview();
      const navigationDescriptor = navigationHistory.get(payload.id);
      navigationDescriptor && requestNavigationChange(navigationDescriptor);
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
        if (isRunningPreview()) {
          // refresh preview component
          openPreview(getCurrentSceneName());
        }
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
      const SceneTracker = require("react-native/Libraries/Utilities/SceneTracker");
      const sceneName = SceneTracker.getActiveScene().name;
      devtoolsAgent._bridge.send("RNIDE_appReady", {
        appKey: sceneName,
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
        if (devtoolsAgent) {
          if (isRunningPreview()) {
            const sceneName = getCurrentSceneName();
            const preview = (global.__RNIDE_previews || new Map()).get(sceneName);
            devtoolsAgent._bridge.send("RNIDE_navigationChanged", {
              displayName: `preview:${preview.name}`, // TODO: make names unique if there are multiple previews of the same component
              id: sceneName,
            });
          }
        }
      }}>
      {children}
    </View>
  );
}
