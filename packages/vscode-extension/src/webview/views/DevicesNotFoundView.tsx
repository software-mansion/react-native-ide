import "./DevicesNotFoundView.css";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { useCallback, useState } from "react";
import SmartphoneIcon from "../components/icons/SmartphoneIcon";
import Button from "../components/shared/Button";
import { useModal } from "../providers/ModalProvider";
import CreateDeviceView from "./CreateDeviceView";
import { useDevices } from "../providers/DevicesProvider";
import { AndroidSupportedDevices, iOSSupportedDevices } from "../utilities/consts";
import { IOSDeviceTypeInfo, IOSRuntimeInfo } from "../../common/DeviceManager";
import { useDependencies } from "../providers/DependenciesProvider";
import { Platform, useUtils } from "../providers/UtilsProvider";

const firstIosDeviceName = iOSSupportedDevices[0].name;
const firstAndroidDeviceName = AndroidSupportedDevices[0].name;

function getMax<T>(array: T[], predicate: (element: T, currentMax: T) => boolean): T | undefined {
  if (array.length === 0) {
    return undefined;
  }

  let max = array[0];
  for (const element of array) {
    if (predicate(element, max)) {
      max = element;
    }
  }
  return max;
}

function useLoadingState() {
  const [state, setState] = useState(false);
  const withLoading = useCallback(
    async (fn: () => Promise<void>) => {
      setState(true);
      try {
        await fn();
      } finally {
        setState(false);
      }
    },
    [setState]
  );

  return [state, withLoading] as const;
}

function firstRuntimeSupportedDevice(supportedDeviceTypes: IOSDeviceTypeInfo[]) {
  return supportedDeviceTypes.find(({ name }) => name === firstIosDeviceName);
}

function findNewestIosRuntime(runtimes: IOSRuntimeInfo[]) {
  function isNewest(runtime: IOSRuntimeInfo, currentNewestRuntime: IOSRuntimeInfo) {
    const newer = runtime.version > currentNewestRuntime.version;
    if (!newer) {
      return false;
    }
    const isSupported = firstRuntimeSupportedDevice(runtime.supportedDeviceTypes) !== undefined;
    return isSupported;
  }

  return getMax(runtimes, isNewest);
}

function DevicesNotFoundView() {
  const { openModal, closeModal } = useModal();
  const { iOSRuntimes, androidImages, deviceManager } = useDevices();
  const [isIOSCreating, withIosCreating] = useLoadingState();
  const [isAndroidCreating, withAndroidCreating] = useLoadingState();
  const { errors } = useDependencies();
  const utils = useUtils();

  function openCreateNewDeviceModal() {
    openModal(
      "Create new device",
      <CreateDeviceView onCancel={closeModal} onCreate={closeModal} />
    );
  }

  async function createAndroidDevice() {
    if (errors?.emulator) {
      utils.showDismissableError(errors?.emulator.message);
      return;
    }

    await withAndroidCreating(async () => {
      const newestImage = getMax(
        androidImages,
        (image, currentNewestImage) => image.apiLevel > currentNewestImage.apiLevel
      );
      if (newestImage === undefined) {
        openCreateNewDeviceModal();
        return;
      }

      await deviceManager.createAndroidDevice(firstAndroidDeviceName, newestImage);
    });
  }

  async function createIOSDevice() {
    if (errors?.simulator) {
      utils.showDismissableError(errors.simulator.message);
      return;
    }

    await withIosCreating(async () => {
      const newestRuntime = findNewestIosRuntime(iOSRuntimes);
      if (newestRuntime === undefined) {
        openCreateNewDeviceModal();
        return;
      }
      const iOSDeviceType = firstRuntimeSupportedDevice(newestRuntime.supportedDeviceTypes);
      await deviceManager.createIOSDevice(iOSDeviceType!, newestRuntime);
    });
  }
  return (
    <div className="devices-not-found-container">
      <div className="devices-not-found-icon">
        <SmartphoneIcon color="var(--swm-devices-not-found-icon)" />
      </div>
      <h1 className="devices-not-found-title">No devices found</h1>
      <p className="devices-not-found-subtitle">
        You can add a new device using the quick action below.
      </p>
      <div className="devices-not-found-button-group">
        {Platform.OS === "macos" && (
          <Button
            type="ternary"
            className="devices-not-found-quick-action"
            onClick={createIOSDevice}>
            {isIOSCreating && <VSCodeProgressRing className="devices-not-found-button-spinner" />}
            Add iPhone
          </Button>
        )}

        <Button
          type="ternary"
          className="devices-not-found-quick-action"
          onClick={createAndroidDevice}>
          {isAndroidCreating && <VSCodeProgressRing className="devices-not-found-button-spinner" />}
          Add Android
        </Button>
      </div>
      <>
        <p>or</p>
        <Button onClick={openCreateNewDeviceModal}>
          <span className="codicon codicon-add" />
          Create new device
        </Button>
      </>
    </div>
  );
}
export default DevicesNotFoundView;
