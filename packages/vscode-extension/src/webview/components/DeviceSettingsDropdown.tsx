import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";

import "./shared/Dropdown.css";
import "./shared/RadioGroup.css";
import "./shared/Slider.css";
import "./DeviceSettingsDropdown.css";
import "./shared/SwitchGroup.css";

import Label from "./shared/Label";
import { useProject } from "../providers/ProjectProvider";
import { AppPermissionType, DeviceSettings } from "../../common/Project";
import { DeviceLocationView } from "../views/DeviceLocationView";
import { useModal } from "../providers/ModalProvider";
import { DevicePlatform } from "../../common/DeviceManager";
import { KeybindingInfo } from "./shared/KeybindingInfo";
import { DeviceLocalizationView } from "../views/DeviceLocalizationView";

const contentSizes = [
  "xsmall",
  "small",
  "normal",
  "large",
  "xlarge",
  "xxlarge",
  "xxxlarge",
] as const;

interface DeviceSettingsDropdownProps {
  children: React.ReactNode;
  disabled?: boolean;
}

const resetOptionsIOS: Array<{ label: string; value: AppPermissionType; icon: string }> = [
  { label: "Reset All Permissions", value: "all", icon: "check-all" },
  { label: "Reset Location", value: "location", icon: "location" },
  { label: "Reset Photos", value: "photos", icon: "file-media" },
  { label: "Reset Contacts", value: "contacts", icon: "organization" },
  { label: "Reset Calendar", value: "calendar", icon: "calendar" },
];

const resetOptionsAndroid: Array<{ label: string; value: AppPermissionType; icon: string }> = [
  { label: "Reset All Permissions", value: "all", icon: "check-all" },
];

function DeviceSettingsDropdown({ children, disabled }: DeviceSettingsDropdownProps) {
  const { project, deviceSettings, projectState } = useProject();
  const { openModal } = useModal();

  const resetOptions =
    projectState.selectedDevice?.platform === "iOS" ? resetOptionsIOS : resetOptionsAndroid;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        {children}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-menu-content device-settings-content">
          <h4 className="device-settings-heading">Device Settings</h4>
          <Label>Device appearance</Label>
          <form>
            <RadioGroup.Root
              className="dropdown-menu-content radio-group-root"
              defaultValue={deviceSettings.appearance}
              onValueChange={(value) => {
                project.updateDeviceSettings({
                  ...deviceSettings,
                  appearance: value as DeviceSettings["appearance"],
                });
              }}>
              <div className="radio-group-center">
                <RadioGroup.Item className="radio-group-item" value="light" id="r1">
                  <RadioGroup.Indicator className="radio-group-indicator" />
                </RadioGroup.Item>
                <label className="radio-group-label" htmlFor="r1">
                  Light
                </label>
              </div>
              <div className="radio-group-center">
                <RadioGroup.Item className="radio-group-item" value="dark" id="r2">
                  <RadioGroup.Indicator className="radio-group-indicator" />
                </RadioGroup.Item>
                <label className="radio-group-label" htmlFor="r2">
                  Dark
                </label>
              </div>
            </RadioGroup.Root>
            <div className="device-settings-margin" />
            <Label>Text size</Label>
            <div className="device-settings-center">
              <span className="device-settings-small-text-indicator" />
              <Slider.Root
                className="slider-root"
                defaultValue={[contentSizes.indexOf(deviceSettings.contentSize)]}
                max={6}
                step={1}
                onValueChange={([value]) => {
                  project.updateDeviceSettings({
                    ...deviceSettings,
                    contentSize: contentSizes[value],
                  });
                }}>
                <Slider.Track className="slider-track">
                  <Slider.Range className="slider-range" />
                </Slider.Track>
                <Slider.Thumb className="slider-thumb" aria-label="Text Size" />
                <div className="slider-track-dent-container">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="slider-track-dent" />
                  ))}
                </div>
              </Slider.Root>
              <span className="device-settings-large-text-indicator" />
            </div>
            <div className="device-settings-margin" />
            {projectState.selectedDevice?.platform === DevicePlatform.IOS && <BiometricsItem />}
            <DropdownMenu.Arrow className="dropdown-menu-arrow" />
          </form>
          <Label>Device location</Label>
          <DropdownMenu.Item
            className="dropdown-menu-item"
            onSelect={() => {
              openModal("Location", <DeviceLocationView />);
            }}>
            <span className="codicon codicon-location" />
            Set Device Location
          </DropdownMenu.Item>
          {projectState.selectedDevice?.platform === DevicePlatform.IOS && <LocalizationItem />}
          <Label>Permissions</Label>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="dropdown-menu-item">
              <span className="codicon codicon-redo" />
              Reset Permissions
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="dropdown-menu-content"
                sideOffset={2}
                alignOffset={-5}>
                {resetOptions.map((option, index) => (
                  <DropdownMenu.Item
                    className="dropdown-menu-item"
                    key={index}
                    onSelect={() => project.resetAppPermissions(option.value)}>
                    <span className={`codicon codicon-${option.icon}`} />
                    {option.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <Label>Screen recording</Label>
          <div className="dropdown-menu-item">
            <span className="icons-container">
              <span className="codicon codicon-triangle-left icons-rewind" />
              <span className="codicon codicon-triangle-left icons-rewind" />
            </span>
            Enable Replays
            <Switch.Root
              className="switch-root small-switch"
              id="enable-replays"
              onCheckedChange={(checked) =>
                project.updateDeviceSettings({ ...deviceSettings, replaysEnabled: checked })
              }
              defaultChecked={deviceSettings.replaysEnabled}
              style={{ marginLeft: "5px" }}>
              <Switch.Thumb className="switch-thumb" />
            </Switch.Root>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const LocalizationItem = () => {
  const { openModal } = useModal();
  return (
    <>
      <Label>Device Localization</Label>
      <DropdownMenu.Item
        className="dropdown-menu-item"
        onSelect={() => {
          openModal("Localization", <DeviceLocalizationView />);
        }}>
        <span className="codicon codicon-globe" />
        Set Device Localization
      </DropdownMenu.Item>
    </>
  );
};

const BiometricsItem = () => {
  const { project, deviceSettings } = useProject();

  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="dropdown-menu-item">
        <span className="codicon codicon-layout" />
        Biometrics
        <span className="codicon codicon-chevron-right right-slot" />
      </DropdownMenu.SubTrigger>

      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className="dropdown-menu-content">
          <DropdownMenu.Item
            className="dropdown-menu-item"
            onSelect={() => {
              project.updateDeviceSettings({
                ...deviceSettings,
                hasEnrolledBiometrics: !deviceSettings.hasEnrolledBiometrics,
              });
            }}>
            <span className="codicon codicon-layout-sidebar-left" />
            Enrolled
            {deviceSettings.hasEnrolledBiometrics && (
              <span className="codicon codicon-check right-slot" />
            )}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="dropdown-menu-item"
            onSelect={() => {
              project.sendBiometricAuthorization(true);
            }}>
            <span className="codicon codicon-layout-sidebar-left" />
            <div className="dropdown-menu-item-content">
              Matching ID
              <KeybindingInfo commandName="RNIDE.performBiometricAuthorization" />
            </div>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="dropdown-menu-item"
            onSelect={() => {
              project.sendBiometricAuthorization(false);
            }}>
            <span className="codicon codicon-layout-sidebar-left" />
            <div className="dropdown-menu-item-content">
              Non-Matching ID
              <KeybindingInfo commandName="RNIDE.performFailedBiometricAuthorization" />
            </div>
          </DropdownMenu.Item>
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
};

export default DeviceSettingsDropdown;
