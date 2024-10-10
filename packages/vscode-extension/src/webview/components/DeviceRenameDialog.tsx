import "./DeviceRenameDialog.css";
import { useEffect, useState, useRef } from "react";
import { DeviceInfo } from "../../common/DeviceManager";
import { useDevices } from "../providers/DevicesProvider";
import Button from "./shared/Button";
import { useModal } from "../providers/ModalProvider";
import { formatCustomName, MAX_CUSTOM_NAME_LENGTH } from "../views/CreateDeviceView";
import Label from "../components/shared/Label";
import { useProject } from "../providers/ProjectProvider";

function DeviceRenameDialog({
  deviceInfo,
  onClose,
}: {
  deviceInfo: DeviceInfo;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCustomNameValid, setIsCustomNameValid] = useState(true);
  const { deviceManager } = useDevices();
  const { project } = useProject();

  const { showHeader } = useModal();
  useEffect(() => {
    showHeader(false);
    return () => {
      showHeader(true);
    };
  });

  const handleCustomNameChange = () => {
    inputRef.current!.value = formatCustomName(inputRef.current!.value);
    const customNameLenght = inputRef.current!.value.length;
    setIsCustomNameValid(0 < customNameLenght && customNameLenght <= MAX_CUSTOM_NAME_LENGTH);
  };

  return (
    <div>
      <div className="device-rename-title">Rename device</div>
      <div className="device-rename-wrapper">
        <Label>
          <span>New Name</span>
        </Label>
        <input
          ref={inputRef}
          className="custom-name-input"
          style={isCustomNameValid ? {} : { border: "1px solid var(--red-light-100)" }}
          type="string"
          defaultValue={deviceInfo.customName ? deviceInfo.customName : deviceInfo.name}
          onChange={handleCustomNameChange}
        />
        {!isCustomNameValid && (
          <div className="submit-rejection-message">
            Make sure that the custom name is between 1 and {MAX_CUSTOM_NAME_LENGTH} characters
            long.
          </div>
        )}
      </div>

      <div className="device-rename-button-group">
        <Button type="secondary" className="device-rename-button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="device-rename-button"
          type="ternary"
          disabled={!isCustomNameValid}
          onClick={async () => {
            try {
              await deviceManager.renameDevice(deviceInfo, inputRef.current!.value);
            } finally {
              deviceInfo.customName = inputRef.current!.value;
              project.updateSelectedDevice(deviceInfo);
              onClose();
            }
          }}>
          Rename
        </Button>
      </div>
    </div>
  );
}

export default DeviceRenameDialog;
