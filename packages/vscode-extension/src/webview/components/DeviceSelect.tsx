import React, { PropsWithChildren } from "react";
import * as Select from "@radix-ui/react-select";
import { DeviceInfo, DevicePlatform } from "../../common/DeviceManager";
import "./DeviceSelect.css";
import "./shared/Dropdown.css";
import Tooltip from "./shared/Tooltip";

interface RichSelectItemProps extends Select.SelectItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}

const RichSelectItem = React.forwardRef<HTMLDivElement, PropsWithChildren<RichSelectItemProps>>(
  ({ children, icon, title, subtitle, ...props }, forwardedRef) => {
    function renderSubtitle() {
      if (!subtitle) {
        return null;
      }

      const subtitleComponent = <div className="device-select-rich-item-subtitle">{subtitle}</div>;
      const isLongText = subtitle.length > 20;

      if (isLongText) {
        <Tooltip label={subtitle} side="right" instant>
          {subtitleComponent}
        </Tooltip>;
      }
      return subtitleComponent;
    }

    return (
      <Select.Item className="device-select-rich-item" {...props} ref={forwardedRef}>
        <div className="device-select-rich-item-icon">{icon}</div>
        <div>
          <div className="device-select-rich-item-title">{title}</div>
          {renderSubtitle()}
        </div>
      </Select.Item>
    );
  }
);

const SelectItem = React.forwardRef<HTMLDivElement, PropsWithChildren<Select.SelectItemProps>>(
  ({ children, ...props }, forwardedRef) => (
    <Select.Item className="device-select-item" {...props} ref={forwardedRef}>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
);

interface DeviceSelectProps {
  value: string;
  onValueChange: (newValue: string) => void;
  label: string;
  devices: DeviceInfo[];
  disabled?: boolean;
}

function DeviceSelect({ onValueChange, devices, value, label, disabled }: DeviceSelectProps) {
  const iOSDevices = devices.filter(
    ({ platform, name }) => platform === DevicePlatform.IOS && name.length > 0
  );
  const androidDevices = devices.filter(
    ({ platform, name }) => platform === DevicePlatform.Android && name.length > 0
  );

  function renderIosDevices() {
    return (
      iOSDevices.length > 0 && (
        <Select.Group>
          <Select.Label className="device-select-label">iOS</Select.Label>
          {iOSDevices.map((device) => (
            <RichSelectItem
              value={device.id}
              key={device.id}
              disabled={!device.available}
              icon={<span className="codicon codicon-device-mobile" />}
              title={device.name}
              subtitle={device.systemName}
            />
          ))}
        </Select.Group>
      )
    );
  }
  function renderAndroidDevices() {
    return (
      androidDevices.length > 0 && (
        <Select.Group>
          <Select.Label className="device-select-label">Android</Select.Label>
          {androidDevices.map((device) => (
            <RichSelectItem
              value={device.id}
              key={device.id}
              disabled={!device.available}
              icon={<span className="codicon codicon-device-mobile" />}
              title={device.name}
              subtitle={device.systemName}
            />
          ))}
        </Select.Group>
      )
    );
  }

  return (
    <Select.Root onValueChange={onValueChange} value={value}>
      <Select.Trigger className="device-select-trigger" disabled={disabled}>
        <Select.Value placeholder="No devices found">
          <div className="device-select-value">
            <span className="codicon codicon-device-mobile" />
            {label}
          </div>
        </Select.Value>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content className="device-select-content dropdown-menu-content" position="popper">
          <Select.Viewport className="device-select-viewport">
            {renderIosDevices()}
            {renderAndroidDevices()}
            {devices.length > 0 && <Select.Separator className="device-select-separator" />}
            <SelectItem value="manage">Manage devices...</SelectItem>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default DeviceSelect;
