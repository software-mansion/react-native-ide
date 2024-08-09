import "./ManageDevicesView.css";
import { useEffect, useState } from "react";
import IconButton from "../components/shared/IconButton";
import DeviceRemovalConfirmation from "../components/DeviceRemovalConfirmation";
import CreateDeviceView from "./CreateDeviceView";
import { DeviceInfo, DevicePlatform } from "../../common/DeviceManager";
import { useDevices } from "../providers/DevicesProvider";
import Tooltip from "../components/shared/Tooltip";
import Label from "../components/shared/Label";
import Button from "../components/shared/Button";

interface DeviceRowProps {
  deviceInfo: DeviceInfo;
  onDeviceDelete: (device: DeviceInfo) => void;
}

function DeviceRow({ deviceInfo, onDeviceDelete }: DeviceRowProps) {
  return (
    <div className="device-row">
      <div className="device-icon">
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
        <div className="device-title">{deviceInfo.name}</div>
        <div className="device-subtitle">{deviceInfo.systemName}</div>
      </div>
      <IconButton
        tooltip={{
          label: `Remove device with it's ${
            deviceInfo.platform === DevicePlatform.IOS ? "runtime." : "system image."
          }`,
          side: "bottom",
          type: "secondary",
        }}
        onClick={() => onDeviceDelete(deviceInfo)}>
        <span className="codicon codicon-trash delete-icon" />
      </IconButton>
    </div>
  );
}

function ManageDevicesView() {
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | undefined>(undefined);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [createDeviceViewOpen, setCreateDeviceViewOpen] = useState(false);

  const { devices, reload } = useDevices();

  useEffect(() => {
    reload();
  }, []);

  const androidDevices = devices.filter((device) => device.platform === DevicePlatform.Android);
  const iosDevices = devices.filter((device) => device.platform === DevicePlatform.IOS);

  const handleDeviceDelete = (device: DeviceInfo) => {
    setSelectedDevice(device);
    setDeleteConfirmationOpen(true);
  };

  const handleConfirmationClose = () => {
    setDeleteConfirmationOpen(false);
    setSelectedDevice(undefined);
  };

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
              onDeviceDelete={handleDeviceDelete}
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
              onDeviceDelete={handleDeviceDelete}
            />
          ))}
        </>
      )}
      <Button className="create-button" onClick={() => setCreateDeviceViewOpen(true)}>
        <span className="codicon codicon-add" />
        <div className="create-button-text">Create new device</div>
      </Button>
    </div>
  );
}

export default ManageDevicesView;
