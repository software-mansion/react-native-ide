import React, { FocusEventHandler, useRef, useState } from "react";
import "./DeviceLocationView.css";
import "../components/shared/SwitchGroup.css";
import * as Switch from "@radix-ui/react-switch";
import CoordinateParser from "coordinate-parser";
import { useProject } from "../providers/ProjectProvider";
import Label from "../components/shared/Label";
import Tooltip from "../components/shared/Tooltip";
import { throttle } from "../../utilities/throttle";

const CoordinateInfo = () => {
  return (
    <div className="supported-formats">
      <h3>Supported formats:</h3>
      <li>40.123, -74.123</li>
      <li>40.123° N 74.123° W</li>
      <li>40° 7´ 22.8" N 74° 7´ 22.8" W</li>
      <li>40° 7.38’, -74° 7.38’</li>
      <li>N40°7’22.8, W74°7’22.8"</li>
      <li>40°7’22.8"N, 74°7’22.8"W</li>
      <li>40 7 22.8, -74 7 22.8</li>
      <li>40.123 -74.123</li>
      <li>40.123°,-74.123°</li>
      <li>144442800, -266842800</li>
      <li>40.123N74.123W</li>
      <li>4007.38N7407.38W</li>
      <li>40°7’22.8"N, 74°7’22.8"W</li>
      <li>400722.8N740722.8W</li>
      <li>N 40 7.38 W 74 7.38</li>
      <li>40:7:23N,74:7:23W</li>
      <li>40:7:22.8N 74:7:22.8W</li>
      <li>40°7’23"N 74°7’23"W</li>
      <li>40°7’23" -74°7’23"</li>
      <li>40d 7’ 23" N 74d 7’ 23" W</li>
      <li>40.123N 74.123W</li>
      <li>40° 7.38, -74° 7.38</li>
    </div>
  );
};

const THROTTLE_LIMIT = 1000;

export function DeviceLocationView() {
  const { project, deviceSettings } = useProject();
  const inputRef = useRef<HTMLInputElement>(null);

  const updateProjectSettingWithThrottle = throttle(project.updateDeviceSettings, THROTTLE_LIMIT);

  const [isCoordinateValid, setIsCoordinateValid] = useState(true);

  const handleCoordinateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newCoordinate = event.target.value;
    let position;
    try {
      position = new CoordinateParser(newCoordinate);
      setIsCoordinateValid(true);
    } catch (e) {
      setIsCoordinateValid(false);
      return;
    }

    updateProjectSettingWithThrottle({
      ...deviceSettings,
      location: {
        ...deviceSettings.location,
        latitude: position.getLatitude(),
        longitude: position.getLongitude(),
      },
    });
  };
  // DD - Decimal Degrees DMS - Degrees Minutes Seconds
  // https://stackoverflow.com/questions/5786025/decimal-degrees-to-degrees-minutes-and-seconds-in-javascript
  const convertDDToDMS = (D: number, lng: boolean) => {
    return {
      dir: D < 0 ? (lng ? "W" : "S") : lng ? "E" : "N",
      deg: 0 | (D < 0 ? (D = -D) : D),
      min: String(0 | (((D += 1e-9) % 1) * 60)).padStart(2, "0"),
      sec: String(Math.floor((0 | (((D * 60) % 1) * 6000)) / 100)).padStart(2, "0"),
    };
  };

  const formatLocation = (lat: number, lon: number): string => {
    const latitude = convertDDToDMS(lat, false);
    const longitude = convertDDToDMS(lon, true);
    return `${latitude.deg}° ${latitude.min}' ${latitude.sec}'' ${latitude.dir}   ${longitude.deg}° ${longitude.min}' ${longitude.sec}'' ${longitude.dir}`;
  };

  const handleCoordinateInputBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    if (!isCoordinateValid) {
      return;
    }
    const newCoordinate = inputRef.current!.value;
    let position;
    try {
      position = new CoordinateParser(newCoordinate);
    } catch (e) {
      setIsCoordinateValid(false);
      return;
    }
    inputRef.current!.value = formatLocation(position.getLatitude(), position.getLongitude());
  };

  const handleEnableLocation = (check: boolean) => {
    const isDisabled = !check;
    project.updateDeviceSettings({
      ...deviceSettings,
      location: {
        ...deviceSettings.location,
        isDisabled,
      },
    });
  };

  return (
    <>
      <Label>Enable Location</Label>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Switch.Root
          className="switch-root"
          id="enable-location"
          onCheckedChange={handleEnableLocation}
          defaultChecked={!deviceSettings.location.isDisabled}>
          <Switch.Thumb className="switch-thumb" />
        </Switch.Root>
      </div>
      <div className="coordinate-label">
        <Label>Coordinate</Label>
        <Tooltip label={CoordinateInfo()} side="right" type="primary">
          <span className="codicon codicon-info"></span>
        </Tooltip>
      </div>
      <label className="latitude">
        <div className="picker">
          <input
            ref={inputRef}
            className="coordinate"
            style={isCoordinateValid ? {} : { border: "1px solid var(--red-light-100)" }}
            type="string"
            defaultValue={formatLocation(
              deviceSettings.location.latitude,
              deviceSettings.location.longitude
            )}
            onChange={handleCoordinateChange}
            onBlur={handleCoordinateInputBlur}
            disabled={deviceSettings.location.isDisabled}
          />
        </div>
      </label>

      {!isCoordinateValid && (
        <div className="submit-rejection-message">Make sure that the coordinates are valid.</div>
      )}
    </>
  );
}
