import "./ManageDevicesView.css";
import { useEffect, useState } from "react";
import IconButton from "../components/shared/IconButton";
import DeviceRenameDialog from "../components/DeviceRenameDialog";
import DeviceRemovalConfirmation from "../components/DeviceRemovalConfirmation";
import CreateDeviceView from "./CreateDeviceView";
import { DeviceInfo, DevicePlatform } from "../../common/DeviceManager";
import { useDevices } from "../providers/DevicesProvider";
import Tooltip from "../components/shared/Tooltip";
import Label from "../components/shared/Label";
import Button from "../components/shared/Button";
import { useProject } from "../providers/ProjectProvider";
import { useModal } from "../providers/ModalProvider";

interface DeviceRowProps {
  deviceInfo: DeviceInfo;
  onDeviceRename: (device: DeviceInfo) => void;
  onDeviceDelete: (device: DeviceInfo) => void;
  isSelected: boolean;
}

function DeviceRow({ deviceInfo, onDeviceRename, onDeviceDelete, isSelected }: DeviceRowProps) {
  const { project } = useProject();

  const handleDeviceChange = async () => {
    if (!isSelected) {
      project.selectDevice(deviceInfo);
    }
  };

  const deviceTitle = deviceInfo.customName ? deviceInfo.customName : deviceInfo.name;
  const deviceSubtitle = deviceInfo.customName
    ? `${deviceInfo.name} - ${deviceInfo.systemName}`
    : deviceInfo.systemName;

  const { closeModal } = useModal();
  return (
    <div className="device-row">
      <div className={isSelected ? "device-icon-selected" : "device-icon"}>
        {!deviceInfo.available ? (
          <Tooltip
            label="This device cannot be used. Perhaps the system image or runtime is missing. Try deleting and creating a new device instead."
            instant
            side="bottom">
            <span className="codicon codicon-warning warning" />
          </Tooltip>
        ) : (
          <span className="codicon codicon-device-mobile" />
        )}
      </div>
      <div className="device-label">
        <div className="device-title">{isSelected ? <b>{deviceTitle}</b> : deviceTitle}</div>
        <div className="device-subtitle">{deviceSubtitle}</div>
      </div>
      <span className="device-button-group">
        {!isSelected ? (
          <IconButton
            tooltip={{
              label: "Select device.",
              side: "bottom",
              type: "secondary",
            }}
            onClick={async (e) => {
              e.stopPropagation();
              await handleDeviceChange();
              closeModal();
            }}>
            <span className="codicon codicon-play" />
          </IconButton>
        ) : (
          <IconButton onClick={() => {}} disabled={true}>
            <span className="codicon codicon-blank" />
          </IconButton>
        )}
        <IconButton
          tooltip={{
            label: "Rename device's name.",
            side: "bottom",
            type: "secondary",
          }}
          onClick={async (e) => {
            e.stopPropagation();
            onDeviceRename(deviceInfo);
          }}>
          <span className="codicon codicon-case-sensitive" />
        </IconButton>
        <IconButton
          tooltip={{
            label: `Remove device with it's ${
              deviceInfo.platform === DevicePlatform.IOS ? "runtime." : "system image."
            }`,
            side: "bottom",
            type: "secondary",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDeviceDelete(deviceInfo);
          }}>
          <span className="codicon codicon-trash delete-icon" />
        </IconButton>
      </span>
    </div>
  );
}

function ManageDevicesView() {
  const { projectState } = useProject();
  const selectedProjectDevice = projectState?.selectedDevice;
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | undefined>(undefined);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [createDeviceViewOpen, setCreateDeviceViewOpen] = useState(false);

  const { devices, reload } = useDevices();

  useEffect(() => {
    reload();
  }, []);

  const iosDevices = devices.filter(
    ({ platform, name }) => platform === DevicePlatform.IOS && name.length > 0
  );
  const androidDevices = devices.filter(
    ({ platform, name }) => platform === DevicePlatform.Android && name.length > 0
  );

  const handleDeviceRename = (device: DeviceInfo) => {
    setSelectedDevice(device);
    setRenameDialogOpen(true);
  };

  const handleDeviceDelete = (device: DeviceInfo) => {
    setSelectedDevice(device);
    setDeleteConfirmationOpen(true);
  };

  const handleConfirmationClose = () => {
    setRenameDialogOpen(false);
    setDeleteConfirmationOpen(false);
    setSelectedDevice(undefined);
  };

  if (renameDialogOpen && selectedDevice) {
    return <DeviceRenameDialog deviceInfo={selectedDevice} onClose={handleConfirmationClose} />;
  }

  if (deleteConfirmationOpen && selectedDevice) {
    return (
      <DeviceRemovalConfirmation deviceInfo={selectedDevice} onClose={handleConfirmationClose} />
    );
  }

  if (createDeviceViewOpen) {
    return (
      <CreateDeviceView
        onCancel={() => setCreateDeviceViewOpen(false)}
        onCreate={() => setCreateDeviceViewOpen(false)}
      />
    );
  }

  return (
    <div className="container">
      {iosDevices.length > 0 && (
        <>
          <Label>iOS Devices</Label>
          {iosDevices.map((deviceInfo) => (
            <DeviceRow
              key={deviceInfo.id}
              deviceInfo={deviceInfo}
              onDeviceRename={handleDeviceRename}
              onDeviceDelete={handleDeviceDelete}
              isSelected={deviceInfo.id === selectedProjectDevice?.id}
            />
          ))}
        </>
      )}
      {androidDevices.length > 0 && (
        <>
          <Label>Android Devices</Label>
          {androidDevices.map((deviceInfo) => (
            <DeviceRow
              key={deviceInfo.id}
              deviceInfo={deviceInfo}
              onDeviceRename={handleDeviceRename}
              onDeviceDelete={handleDeviceDelete}
              isSelected={deviceInfo.id === selectedProjectDevice?.id}
            />
          ))}
        </>
      )}
      <Button autoFocus className="create-button" onClick={() => setCreateDeviceViewOpen(true)}>
        <span className="codicon codicon-add" />
        <div className="create-button-text">Create new device</div>
      </Button>
    </div>
  );
}

export default ManageDevicesView;
