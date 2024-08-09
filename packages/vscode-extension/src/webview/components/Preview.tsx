import { useState, useRef, useEffect, MouseEvent, forwardRef, RefObject } from "react";
import clamp from "lodash/clamp";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { keyboardEventToHID } from "../utilities/keyMapping";
import "./Preview.css";
import { useProject } from "../providers/ProjectProvider";
import {
  AndroidSupportedDevices,
  DeviceProperties,
  iOSSupportedDevices,
} from "../utilities/consts";
import PreviewLoader from "./PreviewLoader";
import { useBuildErrorAlert, useBundleErrorAlert } from "../hooks/useBuildErrorAlert";
import Debugger from "./Debugger";
import { useNativeRebuildAlert } from "../hooks/useNativeRebuildAlert";
import { InspectData, InspectDataStackItem, ZoomLevelType } from "../../common/Project";
import { InspectDataMenu } from "./InspectDataMenu";
import { Resizable } from "re-resizable";
import { useResizableProps } from "../hooks/useResizableProps";
import ZoomControls from "./ZoomControls";
import { throttle } from "../../utilities/throttle";
import { useUtils } from "../providers/UtilsProvider";
import { useWorkspaceConfig } from "../providers/WorkspaceConfigProvider";

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number;
  }
}

function cssPropertiesForDevice(device: DeviceProperties, frameDisabled: boolean) {
  return {
    "--phone-screen-height": `${
      frameDisabled ? 100 : (device.screenHeight / device.frameHeight) * 100
    }%`,
    "--phone-screen-width": `${
      frameDisabled ? 100 : (device.screenWidth / device.frameWidth) * 100
    }%`,
    "--phone-aspect-ratio": `${
      frameDisabled
        ? device.screenWidth / device.screenHeight
        : device.frameWidth / device.frameHeight
    }`,
    "--phone-top": `${frameDisabled ? 0 : (device.offsetY / device.frameHeight) * 100}%`,
    "--phone-left": `${frameDisabled ? 0 : (device.offsetX / device.frameWidth) * 100}%`,
    "--phone-mask-image": `url(${device.maskImage})`,
  } as const;
}

const NO_IMAGE_DATA = "data:,";

const MjpegImg = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  (props, ref) => {
    const { src, ...rest } = props;

    // The below effect implements the main logic of this component. The primary
    // reason we can't just use img tag with src directly, is that with mjpeg streams
    // the img, after being removed from the hierarchy, will keep the connection open.
    // As a consequence, after several reloads, we will end up maintaining multiple
    // open streams which causes the UI to lag.
    // To avoid this, we manually control src attribute of the img tag and reset it
    // when the src by changing first to an empty string. We also set empty src when
    // the component is unmounted.
    useEffect(() => {
      const img = (ref as RefObject<HTMLImageElement>).current;
      if (!img) {
        return;
      }
      img.src = NO_IMAGE_DATA;
      img.src = src || NO_IMAGE_DATA;
      return () => {
        img.src = NO_IMAGE_DATA;
      };
    }, [ref, src]);

    // The sole purpose of the below effect is to periodically call `decode` on the image
    // in order to detect when the stream connection is dropped. There seem to be no better
    // way to handle it apart from this. When `decode` fails, we reset the image source to
    // trigger a new connection.
    useEffect(() => {
      let timer: NodeJS.Timeout;

      let cancelled = false;
      async function checkIfImageLoaded() {
        const img = (ref as RefObject<HTMLImageElement>).current;
        if (img?.src) {
          try {
            // waits until image is ready to be displayed
            await img.decode();
          } catch {
            // Stream connection was dropped
            if (!cancelled) {
              const src = img.src;
              img.src = NO_IMAGE_DATA;
              img.src = src;
            }
          }
        }
        if (!cancelled) {
          timer = setTimeout(checkIfImageLoaded, 2_000);
        }
      }
      checkIfImageLoaded();

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [ref]);

    return <img ref={ref} {...rest} />;
  }
);

type DeviceFrameProps = {
  device: DeviceProperties | undefined;
  isFrameDisabled: boolean;
};

function DeviceFrame({ device, isFrameDisabled }: DeviceFrameProps) {
  if (!device) {
    return null;
  }

  return (
    <img
      src={device.frameImage}
      className="phone-frame"
      style={{
        opacity: isFrameDisabled ? 0 : 1,
      }}
    />
  );
}

type TouchPointMarkerProps = {
  x: number;
  y: number;
  isPressing: boolean;
  sizeFactor?: number;
  color?: string;
  pressedColor?: string;
};

function TouchPointMarker({
  x,
  y,
  isPressing,
  color = "175, 175, 175",
  pressedColor = "135, 135, 135",
  sizeFactor = 1,
}: TouchPointMarkerProps) {
  const adjustedSize = 33 * sizeFactor;
  const finalSize = isPressing ? adjustedSize * 0.8 : adjustedSize;

  return (
    <div
      style={{
        position: "absolute",
        top: `${y * 100}%`,
        left: `${x * 100}%`,
        width: `${finalSize}px`,
        height: `${finalSize}px`,
        backgroundColor: `rgba(${isPressing ? pressedColor : color}, 0.6)`,
        borderRadius: "50%",
        borderColor: `rgba(${isPressing ? pressedColor : color}, 0.5)`,
        borderWidth: "1px",
        borderStyle: "solid",
        transform: "translate(-50%, -50%)",
        boxShadow: isPressing ? "none" : "2px 2px 6px 1px rgba(0, 0, 0, 0.4)",
      }}
    />
  );
}

type InspectStackData = {
  requestLocation: { x: number; y: number };
  stack: InspectDataStackItem[];
};

type Props = {
  isInspecting: boolean;
  setIsInspecting: (isInspecting: boolean) => void;
  zoomLevel: ZoomLevelType;
  onZoomChanged: (zoomLevel: ZoomLevelType) => void;
};

function Preview({ isInspecting, setIsInspecting, zoomLevel, onZoomChanged }: Props) {
  interface TouchPoint {
    x: number;
    y: number;
  }

  const wrapperDivRef = useRef<HTMLDivElement>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [isMultiTouching, setIsMultiTouching] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [touchPoint, setTouchPoint] = useState<TouchPoint>({ x: 0.5, y: 0.5 });
  const [anchorPoint, setAnchorPoint] = useState<TouchPoint>({ x: 0.5, y: 0.5 });
  const previewRef = useRef<HTMLImageElement>(null);
  const [showPreviewRequested, setShowPreviewRequested] = useState(false);

  const workspace = useWorkspaceConfig();
  const { projectState, project, deviceSettings } = useProject();
  const { openFileAt } = useUtils();

  const isFrameDisabled = workspace.showDeviceFrame === false;

  const projectStatus = projectState.status;

  const hasBuildError = projectStatus === "buildError";
  const hasIncrementalBundleError = projectStatus === "incrementalBundleError";
  const hasBundleError = projectStatus === "bundleError";

  const debugPaused = projectStatus === "debuggerPaused";
  const debugException = projectStatus === "runtimeError";

  const previewURL = projectState.previewURL;

  const isStarting =
    hasBundleError || hasIncrementalBundleError || debugException
      ? false
      : !projectState || projectState.status === "starting";
  const showDevicePreview =
    projectState?.previewURL && (showPreviewRequested || (!isStarting && !hasBuildError));

  useBuildErrorAlert(hasBuildError);
  useBundleErrorAlert(hasBundleError || hasIncrementalBundleError);

  const openRebuildAlert = useNativeRebuildAlert();

  const [inspectFrame, setInspectFrame] = useState<InspectData["frame"] | null>(null);
  const [inspectStackData, setInspectStackData] = useState<InspectStackData | null>(null);

  function getTouchPosition(event: MouseEvent<HTMLDivElement>) {
    const imgRect = previewRef.current!.getBoundingClientRect();
    const x = (event.clientX - imgRect.left) / imgRect.width;
    const y = (event.clientY - imgRect.top) / imgRect.height;
    const clampedX = clamp(x, 0, 1);
    const clampedY = clamp(y, 0, 1);
    return { x: clampedX, y: clampedY };
  }

  function moveAnchorPoint(event: MouseEvent<HTMLDivElement>) {
    let { x: anchorX, y: anchorY } = anchorPoint;
    const { x: prevPointX, y: prevPointY } = touchPoint;
    const { x: newPointX, y: newPointY } = getTouchPosition(event);

    anchorX += newPointX - prevPointX;
    anchorY += newPointY - prevPointY;
    anchorX = clamp(anchorX, 0, 1);
    anchorY = clamp(anchorY, 0, 1);
    setAnchorPoint({ x: anchorX, y: anchorY });
  }

  function getMirroredTouchPosition(mirrorPoint: TouchPoint) {
    const { x: pointX, y: pointY } = touchPoint;
    const { x: mirrorX, y: mirrorY } = mirrorPoint;
    const mirroredPointX = 2 * mirrorX - pointX;
    const mirroredPointY = 2 * mirrorY - pointY;
    const clampedX = clamp(mirroredPointX, 0, 1);
    const clampedY = clamp(mirroredPointY, 0, 1);
    return { x: clampedX, y: clampedY };
  }

  type MouseMove = "Move" | "Down" | "Up";
  function sendTouch(event: MouseEvent<HTMLDivElement>, type: MouseMove) {
    const { x, y } = getTouchPosition(event);
    console.log("FRYTKI SINGLE", x, y, type);
    project.dispatchTouch(x, y, type);
  }

  function sendMultiTouch(event: MouseEvent<HTMLDivElement>, type: MouseMove) {
    const { x, y } = getTouchPosition(event);
    console.log("FRYTKI SINGLE", x, y, anchorPoint.x, anchorPoint.y, type);
    project.dispatchMultiTouch(x, y, anchorPoint.x, anchorPoint.y, type);
  }

  function onInspectorItemSelected(item: InspectDataStackItem) {
    openFileAt(item.source.fileName, item.source.line0Based, item.source.column0Based);
    setIsInspecting(false);
  }

  function sendInspectUnthrottled(
    event: MouseEvent<HTMLDivElement>,
    type: MouseMove | "Leave" | "RightButtonDown"
  ) {
    if (type === "Leave") {
      return;
    }
    const imgRect = previewRef.current!.getBoundingClientRect();
    const x = (event.clientX - imgRect.left) / imgRect.width;
    const y = (event.clientY - imgRect.top) / imgRect.height;
    const clampedX = clamp(x, 0, 1);
    const clampedY = clamp(y, 0, 1);
    const requestStack = type === "Down" || type === "RightButtonDown";
    const showInspectStackModal = type === "RightButtonDown";
    project.inspectElementAt(clampedX, clampedY, requestStack, (inspectData) => {
      if (requestStack && inspectData?.stack) {
        if (showInspectStackModal) {
          setInspectStackData({
            requestLocation: { x: event.clientX, y: event.clientY },
            stack: inspectData.stack,
          });
        } else {
          // find first item w/o hide flag and open file
          const firstItem = inspectData.stack.find((item) => !item.hide);
          if (firstItem) {
            onInspectorItemSelected(firstItem);
          }
        }
      }
      setInspectFrame(inspectData.frame);
    });
  }

  const sendInspect = throttle(sendInspectUnthrottled, 50);
  function resetInspector() {
    setInspectFrame(null);
    setInspectStackData(null);
  }

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isMultiTouching) {
      isPanning && moveAnchorPoint(e);
      isPressing && sendMultiTouch(e, "Move");
    } else if (isPressing) {
      sendTouch(e, "Move");
    } else if (isInspecting) {
      sendInspect(e, "Move", false);
    }
    setTouchPoint(getTouchPosition(e));
  }

  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    wrapperDivRef.current!.focus();

    if (isInspecting) {
      sendInspect(e, e.button === 2 ? "RightButtonDown" : "Down", true);
    } else if (inspectFrame) {
      // if element is highlighted, we clear it here and ignore first click (don't send it to device)
      resetInspector();
    } else if (e.button === 2) {
      sendInspect(e, "RightButtonDown", true);
    } else if (isMultiTouching) {
      setIsPressing(true);
      sendMultiTouch(e, "Down");
    } else {
      setIsPressing(true);
      sendTouch(e, "Down");
    }
  }

  function onMouseUp(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isPressing) {
      if (isMultiTouching) {
        sendMultiTouch(e, "Up");
      } else {
        sendTouch(e, "Up");
      }
      setIsPressing(false);
    }
  }

  function onMouseLeave(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isPressing) {
      if (isMultiTouching) {
        setIsMultiTouching(false);
        setIsPanning(false);
        sendMultiTouch(e, "Up");
      } else {
        sendTouch(e, "Up");
      }
      setIsPressing(false);
    }

    if (isInspecting) {
      // we force inspect event here to make sure no extra events are throttled
      // and will be dispatched later on
      sendInspect(e, "Leave", true);
    }
  }

  function onContextMenu(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  useEffect(() => {
    function dispatchPaste(e: ClipboardEvent) {
      if (document.activeElement === wrapperDivRef.current) {
        e.preventDefault();

        const text = e.clipboardData?.getData("text");
        if (text) {
          project.dispatchPaste(text);
        }
      }
    }

    addEventListener("paste", dispatchPaste);
    return () => {
      removeEventListener("paste", dispatchPaste);
    };
  }, [project]);

  useEffect(() => {
    function keyEventHandler(e: KeyboardEvent) {
      if (document.activeElement === wrapperDivRef.current) {
        e.preventDefault();
        const isKeydown = e.type === "keydown";

        if (e.code === "AltLeft" || e.code === "AltRight") {
          isKeydown && setAnchorPoint({ x: 0.5, y: 0.5 });
          setIsMultiTouching(isKeydown);
        }
        if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
          setIsPanning(isKeydown);
        }

        const hidCode = keyboardEventToHID(e);
        project.dispatchKeyPress(hidCode, isKeydown ? "Down" : "Up");
      }
    }
    document.addEventListener("keydown", keyEventHandler);
    document.addEventListener("keyup", keyEventHandler);
    return () => {
      document.removeEventListener("keydown", keyEventHandler);
      document.removeEventListener("keyup", keyEventHandler);
    };
  }, [project]);

  useEffect(() => {
    if (projectStatus === "running") {
      project.addListener("needsNativeRebuild", openRebuildAlert);
      return () => {
        project.removeListener("needsNativeRebuild", openRebuildAlert);
      };
    }
  }, [project, openRebuildAlert, projectStatus]);

  const device = iOSSupportedDevices.concat(AndroidSupportedDevices).find((sd) => {
    return sd.name === projectState?.selectedDevice?.name;
  });

  const shouldPreventTouchInteraction =
    debugPaused ||
    debugException ||
    hasBundleError ||
    hasIncrementalBundleError ||
    !showDevicePreview;

  const touchHandlers = shouldPreventTouchInteraction
    ? {}
    : {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onContextMenu,
      };

  const resizableProps = useResizableProps({
    wrapperDivRef,
    zoomLevel,
    setZoomLevel: onZoomChanged,
    device: device!,
  });

  const mirroredTouchPosition = getMirroredTouchPosition(anchorPoint);

  return (
    <>
      <div
        className="phone-wrapper"
        style={cssPropertiesForDevice(device!, isFrameDisabled)}
        tabIndex={0} // allows keyboard events to be captured
        ref={wrapperDivRef}>
        {showDevicePreview && (
          <Resizable {...resizableProps}>
            <div className="phone-content">
              <div className="touch-area" {...touchHandlers}>
                <MjpegImg
                  src={previewURL}
                  ref={previewRef}
                  style={{
                    cursor: isInspecting ? "crosshair" : "default",
                  }}
                  className="phone-screen"
                />

                {isMultiTouching && (
                  <TouchPointMarker
                    x={touchPoint.x}
                    y={touchPoint.y}
                    isPressing={isPressing}
                    color="175, 175, 175"
                    pressedColor="84, 180, 148"
                  />
                )}
                {isMultiTouching && (
                  <TouchPointMarker
                    x={anchorPoint.x}
                    y={anchorPoint.y}
                    isPressing={true}
                    sizeFactor={0.3}
                    color="135, 135, 135"
                    pressedColor="135, 135, 135"
                  />
                )}
                {isMultiTouching && (
                  <TouchPointMarker
                    x={mirroredTouchPosition.x}
                    y={mirroredTouchPosition.y}
                    isPressing={isPressing}
                    color="175, 175, 175"
                    pressedColor="84, 180, 148"
                  />
                )}

                {inspectFrame && (
                  <div className="phone-screen phone-inspect-overlay">
                    <div
                      className="inspect-area"
                      style={{
                        left: `${inspectFrame.x * 100}%`,
                        top: `${inspectFrame.y * 100}%`,
                        width: `${inspectFrame.width * 100}%`,
                        height: `${inspectFrame.height * 100}%`,
                      }}
                    />
                  </div>
                )}
                {projectStatus === "refreshing" && (
                  <div className="phone-screen phone-refreshing-overlay">
                    <VSCodeProgressRing />
                    <div>Refreshing...</div>
                  </div>
                )}
                {debugPaused && (
                  <div className="phone-screen phone-debug-overlay">
                    <Debugger />
                  </div>
                )}
                {debugException && (
                  <div className="phone-screen phone-debug-overlay phone-exception-overlay">
                    <button className="uncaught-button" onClick={() => project.resumeDebugger()}>
                      Uncaught exception&nbsp;
                      <span className="codicon codicon-debug-continue" />
                    </button>
                  </div>
                )}
                {/* TODO: Add different label in case of bundle/incremental bundle error */}
                {hasBundleError && (
                  <div className="phone-screen phone-debug-overlay phone-exception-overlay">
                    <button
                      className="uncaught-button"
                      onClick={() => {
                        project.restart(false);
                      }}>
                      Bundle error&nbsp;
                      <span className="codicon codicon-refresh" />
                    </button>
                  </div>
                )}
                {hasIncrementalBundleError && (
                  <div className="phone-screen phone-debug-overlay phone-exception-overlay">
                    <button className="uncaught-button" onClick={() => project.restart(false)}>
                      Bundle error&nbsp;
                      <span className="codicon codicon-refresh" />
                    </button>
                  </div>
                )}
              </div>
              <DeviceFrame device={device} isFrameDisabled={isFrameDisabled} />
              {inspectStackData && (
                <InspectDataMenu
                  inspectLocation={inspectStackData.requestLocation}
                  inspectStack={inspectStackData.stack}
                  onSelected={onInspectorItemSelected}
                  onHover={(item) => {
                    if (item.frame) {
                      setInspectFrame(item.frame);
                    }
                  }}
                  onCancel={() => resetInspector()}
                />
              )}
            </div>
          </Resizable>
        )}
        {!showDevicePreview && !hasBuildError && (
          <Resizable {...resizableProps}>
            <div className="phone-content">
              <div className="phone-sized phone-content-loading-background" />
              <div className="phone-sized phone-content-loading ">
                <PreviewLoader onRequestShowPreview={() => setShowPreviewRequested(true)} />
              </div>
              <DeviceFrame device={device} isFrameDisabled={isFrameDisabled} />
            </div>
          </Resizable>
        )}
        {hasBuildError && (
          <Resizable {...resizableProps}>
            <div className="phone-content">
              <div className="phone-sized extension-error-screen" />
              <DeviceFrame device={device} isFrameDisabled={isFrameDisabled} />
            </div>
          </Resizable>
        )}
      </div>
      <div className="button-group-left">
        <ZoomControls
          zoomLevel={zoomLevel}
          onZoomChanged={onZoomChanged}
          device={device}
          wrapperDivRef={wrapperDivRef}
        />
      </div>
    </>
  );
}

export default Preview;
