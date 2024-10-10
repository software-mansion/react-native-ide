import "./DeviceRemovalConfirmation.css";
import { useEffect, useState } from "react";
import { DeviceInfo } from "../../common/DeviceManager";
import { useDevices } from "../providers/DevicesProvider";
import Button from "./shared/Button";
import { useModal } from "../providers/ModalProvider";

function DeviceRemovalConfirmation({
  deviceInfo,
  onClose,
}: {
  deviceInfo: DeviceInfo;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const { deviceManager } = useDevices();

  const { showHeader } = useModal();
  useEffect(() => {
    showHeader(false);
    return () => {
      showHeader(true);
    };
  });

  return (
    <div className="device-removal-wrapper">
      <h2 className="device-removal-title">
        Are you sure you want to remove the <i>{deviceInfo.name}</i> device?
      </h2>
      <p className="device-removal-subtitle">This action cannot be undone.</p>
      <div className="device-removal-button-group">
        <Button
          type="secondary"
          className="device-removal-button"
          disabled={loading}
          onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="device-removal-button"
          type="ternary"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await deviceManager.removeDevice(deviceInfo);
            } finally {
              onClose();
            }
          }}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

export default DeviceRemovalConfirmation;
