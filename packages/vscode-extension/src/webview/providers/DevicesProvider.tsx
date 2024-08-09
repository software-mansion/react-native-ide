import {
  PropsWithChildren,
  useContext,
  createContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { makeProxy } from "../utilities/rpc";
import {
  AndroidSystemImageInfo,
  DeviceInfo,
  DeviceManagerInterface,
  IOSRuntimeInfo,
} from "../../common/DeviceManager";
import { Platform } from "../providers/UtilsProvider";

const DeviceManager = makeProxy<DeviceManagerInterface>("DeviceManager");

interface DevicesContextProps {
  devices: DeviceInfo[];
  finishedInitialLoad: boolean;
  androidImages: AndroidSystemImageInfo[];
  iOSRuntimes: IOSRuntimeInfo[];
  deviceManager: DeviceManagerInterface;
  reload: () => void;
}

const DevicesContext = createContext<DevicesContextProps>({
  devices: [],
  finishedInitialLoad: false,
  androidImages: [],
  iOSRuntimes: [],
  deviceManager: DeviceManager,
  reload: () => {},
});

export default function DevicesProvider({ children }: PropsWithChildren) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [androidImages, setAndroidImages] = useState<AndroidSystemImageInfo[]>([]);
  const [iOSRuntimes, setIOSRuntimes] = useState<IOSRuntimeInfo[]>([]);
  const [finishedInitialLoad, setFinishedInitialLoad] = useState(false);

  const reload = useCallback(async () => {
    try {
      await Promise.all([
        DeviceManager.listAllDevices().then(setDevices),
        DeviceManager.listInstalledAndroidImages().then(setAndroidImages),
        ...Platform.select({
          macos: [DeviceManager.listInstalledIOSRuntimes().then(setIOSRuntimes)],
          windows: [],
        }),
      ]);
    } finally {
      setFinishedInitialLoad(true);
    }
  }, [setDevices, setAndroidImages, setIOSRuntimes, setFinishedInitialLoad]);

  useEffect(() => {
    DeviceManager.addListener("devicesChanged", setDevices);
    reload();
    return () => {
      DeviceManager.removeListener("devicesChanged", setDevices);
    };
  }, []);

  return (
    <DevicesContext.Provider
      value={{
        devices,
        finishedInitialLoad,
        androidImages,
        iOSRuntimes,
        reload,
        deviceManager: DeviceManager,
      }}>
      {children}
    </DevicesContext.Provider>
  );
}

export function useDevices() {
  const context = useContext(DevicesContext);

  if (context === undefined) {
    throw new Error("useDevices must be used within a DevicesProvider");
  }
  return context;
}
