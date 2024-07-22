import { useState, useEffect, useCallback } from "react";
import { vscode } from "../utilities/vscode";
import Preview from "../components/Preview";
import IconButton from "../components/shared/IconButton";
import UrlBar from "../components/UrlBar";
import SettingsDropdown from "../components/SettingsDropdown";
import "./View.css";
import "./PreviewView.css";
import { useModal } from "../providers/ModalProvider";
import ManageDevicesView from "./ManageDevicesView";
import DevicesNotFoundView from "./DevicesNotFoundView";
import DeviceSettingsDropdown from "../components/DeviceSettingsDropdown";
import DeviceSettingsIcon from "../components/icons/DeviceSettingsIcon";
import { useDevices } from "../providers/DevicesProvider";
import { useProject } from "../providers/ProjectProvider";
import DeviceSelect from "../components/DeviceSelect";
import Button from "../components/shared/Button";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { useDiagnosticAlert } from "../hooks/useDiagnosticAlert";
import { ZoomLevelType } from "../../common/Project";
import { useUtils } from "../providers/UtilsProvider";

function PreviewView() {
  const { projectState, project } = useProject();
  const { reportIssue } = useUtils();

  const [isInspecting, setIsInspecting] = useState(false);
  const zoomLevel = projectState.previewZoom ?? "Fit";
  const onZoomChanged = useCallback(
    (zoom: ZoomLevelType) => {
      project.updatePreviewZoomLevel(zoom);
    },
    [project]
  );
  const [isFollowing, setIsFollowing] = useState(false);
  const [logCounter, setLogCounter] = useState(0);

  const { devices, finishedInitialLoad } = useDevices();

  const selectedDevice = projectState?.selectedDevice;
  const devicesNotFound = projectState !== undefined && devices.length === 0;
  const isStarting = projectState.status === "starting";

  const { openModal } = useModal();

  useDiagnosticAlert(selectedDevice?.platform);

  const extensionVersion = document.querySelector<HTMLMetaElement>(
    "meta[name='react-native-ide-version']"
  )?.content;

  useEffect(() => {
    function incrementLogCounter() {
      setLogCounter((c) => c + 1);
    }
    project.addListener("log", incrementLogCounter);

    return () => {
      project.removeListener("log", incrementLogCounter);
    };
  }, []);

  useEffect(() => {
    if (isStarting) {
      setLogCounter(0);
    }
  }, [setLogCounter, isStarting]);

  useEffect(() => {
    const disableInspectorOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsInspecting(false);
      }
    };
    document.addEventListener("keydown", disableInspectorOnEscape, false);

    return () => {
      document.removeEventListener("keydown", disableInspectorOnEscape, false);
    };
  }, []);

  const handleDeviceDropdownChange = async (value: string) => {
    if (value === "manage") {
      openModal("Manage Devices", <ManageDevicesView />);
      return;
    }
    if (selectedDevice?.id !== value) {
      const deviceInfo = devices.find((d) => d.id === value);
      if (deviceInfo) {
        project.selectDevice(deviceInfo);
      }
    }
  };

  if (!finishedInitialLoad) {
    return (
      <div className="panel-view">
        <VSCodeProgressRing />
      </div>
    );
  }

  return (
    <div className="panel-view">
      <div className="button-group-top">
        <UrlBar project={project} disabled={devicesNotFound} />

        <div className="spacer" />

        <Button
          counter={logCounter}
          onClick={() => {
            setLogCounter(0);
            project.focusDebugConsole();
          }}
          tooltip={{
            label: "Open logs panel",
          }}
          disabled={devicesNotFound}>
          <span slot="start" className="codicon codicon-debug-console" />
          Logs
        </Button>
        <SettingsDropdown
          project={project}
          isDeviceRunning={projectState.status === "running"}
          disabled={devicesNotFound}>
          <IconButton tooltip={{ label: "Settings", type: "primary" }}>
            <span className="codicon codicon-settings-gear" />
          </IconButton>
        </SettingsDropdown>
      </div>
      {selectedDevice ? (
        <Preview
          key={selectedDevice.id}
          isInspecting={isInspecting}
          setIsInspecting={setIsInspecting}
          zoomLevel={zoomLevel}
          onZoomChanged={onZoomChanged}
        />
      ) : (
        <div className="missing-device-filler">
          {devicesNotFound ? <DevicesNotFoundView /> : <VSCodeProgressRing />}
        </div>
      )}

      <div className="button-group-bottom">
        <IconButton
          active={isInspecting}
          tooltip={{
            label: "Select an element to inspect it",
          }}
          onClick={() => setIsInspecting(!isInspecting)}
          disabled={devicesNotFound}>
          <span className="codicon codicon-inspect" />
        </IconButton>

        <span className="group-separator" />

        <DeviceSelect
          devices={devices}
          // @ts-ignore TODO: Fix typing
          value={selectedDevice?.id}
          // @ts-ignore TODO: Fix typing
          label={selectedDevice?.name}
          onValueChange={handleDeviceDropdownChange}
          disabled={devicesNotFound}
        />

        <div className="spacer" />
        <Button className="feedback-button" onClick={() => reportIssue()}>
          {extensionVersion || "Beta"}: Report issue
        </Button>
        <DeviceSettingsDropdown disabled={devicesNotFound}>
          <IconButton tooltip={{ label: "Device settings", type: "primary" }}>
            <DeviceSettingsIcon
              color={devicesNotFound ? "var(--swm-disabled-text)" : "var(--swm-default-text)"}
            />
          </IconButton>
        </DeviceSettingsDropdown>
      </div>
    </div>
  );
}

export default PreviewView;
