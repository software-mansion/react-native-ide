import { RefObject, useCallback } from "react";
import IconButton from "./shared/IconButton";
import * as Select from "@radix-ui/react-select";
import "./ZoomControls.css";
import { ZoomLevelType } from "../../common/Project";
import { DeviceProperties } from "../utilities/consts";

const ZOOM_STEP = 0.05;
const ZOOM_SELECT_NUMERIC_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const DEVICE_DEFAULT_SCALE = 1 / 3;

type ZoomControlsProps = {
  zoomLevel: ZoomLevelType;
  onZoomChanged: (zoom: ZoomLevelType) => void;
  onControlsOpenChange?: (isOpen: boolean) => void;
  device?: DeviceProperties;
  wrapperDivRef?: RefObject<HTMLDivElement>;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
};

type ZoomLevelSelectProps = Pick<
  ZoomControlsProps,
  "zoomLevel" | "onZoomChanged" | "onControlsOpenChange"
>;

const ZoomLevelSelect = ({
  zoomLevel,
  onZoomChanged,
  onControlsOpenChange,
}: ZoomLevelSelectProps) => {
  const onValueChange = useCallback(
    (e: string) => {
      if (e == "Fit") {
        onZoomChanged("Fit");
        return;
      }
      onZoomChanged(Number(e));
    },
    [onZoomChanged]
  );

  return (
    <Select.Root
      onOpenChange={onControlsOpenChange}
      onValueChange={onValueChange}
      value={zoomLevel === "Fit" ? "Fit" : zoomLevel.toString()}>
      <Select.Trigger className="zoom-select-trigger" disabled={false}>
        <Select.Value>
          <div className="zoom-select-value">{zoomLevel === "Fit" ? "Fit" : `${zoomLevel}x`}</div>
        </Select.Value>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="zoom-select-content zoom-dropdown-menu-content"
          side="right"
          position="popper">
          <Select.Viewport className="zoom-select-viewport">
            <Select.SelectItem value="Fit" className="zoom-select-item">
              Fit
            </Select.SelectItem>
            <Select.Separator className="zoom-select-item-separator" />
            {ZOOM_SELECT_NUMERIC_VALUES.map((level) => (
              <Select.SelectItem key={level} value={level.toString()} className="zoom-select-item">
                {level}x
              </Select.SelectItem>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};

function ZoomControls({
  zoomLevel,
  onZoomChanged,
  device,
  onControlsOpenChange,
  onHoverIn,
  onHoverOut,
  wrapperDivRef,
}: ZoomControlsProps) {
  function handleZoom(shouldIncrease: boolean) {
    let currentZoomLevel;
    if (zoomLevel === "Fit") {
      currentZoomLevel =
        ((wrapperDivRef!.current!.offsetHeight / device!.frameHeight) * 1) / DEVICE_DEFAULT_SCALE;
    } else {
      currentZoomLevel = zoomLevel;
    }
    // toFixed() is necessary because of floating point rounding errors
    const newZoomLevel = +(currentZoomLevel + (shouldIncrease ? ZOOM_STEP : -ZOOM_STEP)).toFixed(2);

    if (newZoomLevel >= ZOOM_STEP) {
      onZoomChanged(newZoomLevel);
    }
  }

  return (
    <div className="zoom-controls" onMouseEnter={onHoverIn} onMouseLeave={onHoverOut}>
      <IconButton
        className="zoom-out-button"
        tooltip={{
          label: "Zoom out",
          side: "top",
        }}
        onClick={() => handleZoom(false)}>
        <span className="codicon codicon-zoom-out" />
      </IconButton>
      <ZoomLevelSelect
        zoomLevel={zoomLevel}
        onZoomChanged={onZoomChanged}
        onControlsOpenChange={onControlsOpenChange}
      />
      <IconButton
        className="zoom-in-button"
        tooltip={{
          label: "Zoom in",
          side: "top",
        }}
        onClick={() => handleZoom(true)}>
        <span className="codicon codicon-zoom-in" />
      </IconButton>
    </div>
  );
}

export default ZoomControls;
