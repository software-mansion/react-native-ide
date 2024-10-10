import { useEffect, useRef, useState, FocusEventHandler } from "react";
import Select from "../components/shared/Select";
import "./CreateDeviceView.css";
import { useDevices } from "../providers/DevicesProvider";
import Button from "../components/shared/Button";
import Label from "../components/shared/Label";
import {
  DeviceProperties,
  iOSSupportedDevices,
  AndroidSupportedDevices,
} from "../utilities/consts";
import { DevicePlatform } from "../../common/DeviceManager";
import { useDependencies } from "../providers/DependenciesProvider";
import { Platform } from "../providers/UtilsProvider";

interface CreateDeviceViewProps {
  onCreate: () => void;
  onCancel: () => void;
}

function assertPlatform(platform: string): asserts platform is "ios" | "android" {
  if (!(platform === "ios" || platform === "android")) {
    throw new Error("Invalid platform specifier");
  }
}

function useSupportedDevices() {
  const { errors } = useDependencies();

  function buildSelections(item: DeviceProperties, platform: DevicePlatform) {
    let prefix = "";
    if (platform === DevicePlatform.IOS) {
      prefix = "ios:";
    } else {
      prefix = "android:";
    }
    return { value: prefix + item.name, label: item.name };
  }

  return [
    Platform.select({
      macos: errors?.simulator
        ? { label: "iOS – error, check diagnostics", items: [] }
        : {
            label: "iOS",
            items: iOSSupportedDevices.map((device) => buildSelections(device, DevicePlatform.IOS)),
          },
      windows: { label: "", items: [] },
    }),
    errors?.emulator
      ? { label: "Android – error, check diagnostics", items: [] }
      : {
          label: "Android",
          items: AndroidSupportedDevices.map((device) =>
            buildSelections(device, DevicePlatform.Android)
          ),
        },
  ];
}

export const MAX_CUSTOM_NAME_LENGTH = 30;
export function formatCustomName(name: string) {
  const singleSpaced = name.replace(/\s+/g, " ");
  return singleSpaced.replace(/[^a-zA-Z0-9 _-]/g, "");
}

function CreateDeviceView({ onCreate, onCancel }: CreateDeviceViewProps) {
  const [deviceName, setDeviceName] = useState<string | undefined>(undefined);
  const [devicePlatform, setDevicePlatform] = useState<"ios" | "android" | undefined>(undefined);
  const [selectedSystemName, selectSystemName] = useState<string | undefined>(undefined);
  const [isCustomNameValid, setIsCustomNameValid] = useState(true);
  const [loading, setLoading] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const supportedDevices = useSupportedDevices();
  const { iOSRuntimes, androidImages, deviceManager, reload } = useDevices();

  useEffect(() => {
    reload();
  }, []);

  const platformSelected = !!deviceName && !!devicePlatform;
  const createDisabled = loading || !deviceName || !selectedSystemName;

  const systemImagesOptions =
    platformSelected && devicePlatform === "ios"
      ? iOSRuntimes.map((runtime) => ({
          value: runtime.identifier,
          label: runtime.name,
          disabled: !runtime.available,
        }))
      : androidImages.map((systemImage) => ({
          value: systemImage.location,
          label: systemImage.name,
          disabled: !systemImage.available,
        }));

  async function createDevice() {
    if (!selectedSystemName) {
      return;
    }

    setLoading(true);
    try {
      const customName = formatCustomName(inputRef.current!.value).trim();
      if (devicePlatform === "ios" && Platform.OS === "macos") {
        const runtime = iOSRuntimes.find(({ identifier }) => identifier === selectedSystemName);
        if (!runtime) {
          return;
        }
        const iOSDeviceType = runtime.supportedDeviceTypes.find(({ name }) => name === deviceName);
        if (!iOSDeviceType) {
          return;
        }
        await deviceManager.createIOSDevice(iOSDeviceType, runtime, customName);
      } else {
        const systemImage = androidImages.find((image) => image.location === selectedSystemName);
        if (!systemImage || !deviceName) {
          return;
        }
        await deviceManager.createAndroidDevice(deviceName, systemImage, customName);
      }
    } finally {
      onCreate();
    }
  }

  const handleCustomNameChange: FocusEventHandler<HTMLInputElement> = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    inputRef.current!.value = formatCustomName(inputRef.current!.value);
    setIsCustomNameValid(inputRef.current!.value.length <= MAX_CUSTOM_NAME_LENGTH);
  };

  return (
    <div className="edit-device-form">
      <div className="form-row">
        <Label>Device Type</Label>
        <Select
          className="form-field"
          value={`${devicePlatform && deviceName ? `${devicePlatform}:${deviceName}` : ""}`}
          onChange={(newValue: string) => {
            const [newPlatform, name] = newValue.split(":", 2);
            assertPlatform(newPlatform);

            setDeviceName(name);
            setDevicePlatform(newPlatform);
            selectSystemName(undefined);
            inputRef.current!.value = "";
            setIsCustomNameValid(true);
          }}
          items={supportedDevices}
          placeholder="Choose device type..."
        />
      </div>
      <div className="form-row">
        <Label>
          <span>System image</span>
          {systemImagesOptions.length === 0 && <span className="codicon codicon-warning warning" />}
        </Label>
        {systemImagesOptions.length > 0 ? (
          <Select
            disabled={!platformSelected}
            className="form-field"
            value={selectedSystemName ?? ""}
            onChange={(newValue) => {
              selectSystemName(newValue);
              inputRef.current!.value = deviceName ?? "";
            }}
            items={systemImagesOptions}
            placeholder="Select device system image..."
          />
        ) : (
          <div>
            No system images found. You can install them using{" "}
            {devicePlatform === "ios" ? "Xcode" : "Android Studio"}.
          </div>
        )}
      </div>
      <div className="form-row">
        <Label>
          <span>Name</span>
        </Label>
        <input
          ref={inputRef}
          className="custom-name-input"
          style={isCustomNameValid ? {} : { border: "1px solid var(--red-light-100)" }}
          type="string"
          onChange={handleCustomNameChange}
          disabled={!selectedSystemName}
        />
      </div>
      {!isCustomNameValid && (
        <div className="submit-rejection-message">
          Name may not be longer than {MAX_NAME_LENGTH} characters.
        </div>
      )}
      <div className="button-panel">
        <Button onClick={onCancel} type="secondary">
          Cancel
        </Button>
        <Button disabled={createDisabled} onClick={createDevice} type="ternary">
          Create
        </Button>
      </div>
    </div>
  );
}

export default CreateDeviceView;
