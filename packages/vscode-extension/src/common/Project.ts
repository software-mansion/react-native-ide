import { DeviceInfo } from "./DeviceManager";

export type DeviceSettings = {
  appearance: "light" | "dark";
  contentSize: "xsmall" | "small" | "normal" | "large" | "xlarge" | "xxlarge" | "xxxlarge";
  location: {
    latitude: number;
    longitude: number;
    isDisabled: boolean;
  };
};

export type ProjectState = {
  status:
    | "starting"
    | "running"
    | "buildError"
    | "runtimeError"
    | "bundleError"
    | "incrementalBundleError"
    | "debuggerPaused"
    | "refreshing";
  startupMessage?: string; // Only used when status is "starting"
  stageProgress?: number;
  previewURL: string | undefined;
  selectedDevice: DeviceInfo | undefined;
  previewZoom: ZoomLevelType | undefined; // Preview specific. Consider extracting to different location if we store more preview state
};

export type ZoomLevelType = number | "Fit";

// important: order of values in this enum matters
export enum StartupMessage {
  InitializingDevice = "Initializing device",
  StartingPackager = "Starting packager",
  BootingDevice = "Booting device",
  Building = "Building",
  Installing = "Installing",
  Launching = "Launching",
  WaitingForAppToLoad = "Waiting for app to load",
  AttachingDebugger = "Attaching debugger",
  Restarting = "Restarting",
}

export const StartupStageWeight = [
  { StartupMessage: StartupMessage.InitializingDevice, weight: 1 },
  { StartupMessage: StartupMessage.StartingPackager, weight: 1 },
  { StartupMessage: StartupMessage.BootingDevice, weight: 2 },
  { StartupMessage: StartupMessage.Building, weight: 7 },
  { StartupMessage: StartupMessage.Installing, weight: 1 },
  { StartupMessage: StartupMessage.Launching, weight: 1 },
  { StartupMessage: StartupMessage.WaitingForAppToLoad, weight: 6 },
  { StartupMessage: StartupMessage.AttachingDebugger, weight: 1 },
];

export type InspectDataStackItem = {
  componentName: string;
  hide: boolean;
  source: {
    fileName: string;
    line0Based: number;
    column0Based: number;
  };
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type InspectData = {
  stack: InspectDataStackItem[] | undefined;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export interface ProjectEventMap {
  log: { type: string };
  projectStateChanged: ProjectState;
  deviceSettingsChanged: DeviceSettings;
  navigationChanged: { displayName: string; id: string };
  needsNativeRebuild: void;
}

export interface ProjectEventListener<T> {
  (event: T): void;
}

export interface ProjectInterface {
  getProjectState(): Promise<ProjectState>;
  goHome(): Promise<void>;
  restart(forceCleanBuild: boolean, forceMetroRestart?: boolean): Promise<void>;
  selectDevice(deviceInfo: DeviceInfo): Promise<void>;
  updatePreviewZoomLevel(zoom: ZoomLevelType): Promise<void>;

  getDeviceSettings(): Promise<DeviceSettings>;
  updateDeviceSettings(deviceSettings: DeviceSettings): Promise<void>;

  reportIssue(): Promise<void>;

  resumeDebugger(): Promise<void>;
  stepOverDebugger(): Promise<void>;
  focusBuildOutput(): Promise<void>;
  focusExtensionLogsOutput(): Promise<void>;
  focusDebugConsole(): Promise<void>;
  openNavigation(navigationItemID: string): Promise<void>;
  openDevMenu(): Promise<void>;
  openFileAt(filePath: string, line0Based: number, column0Based: number): Promise<void>;
  movePanelToNewWindow(): void;

  dispatchTouch(xRatio: number, yRatio: number, type: "Up" | "Move" | "Down"): Promise<void>;
  dispatchKeyPress(keyCode: number, direction: "Up" | "Down"): Promise<void>;
  dispatchPaste(text: string): Promise<void>;
  inspectElementAt(
    xRatio: number,
    yRatio: number,
    requestStack: boolean,
    callback: (inspectData: InspectData) => void
  ): Promise<void>;

  addListener<K extends keyof ProjectEventMap>(
    eventType: K,
    listener: ProjectEventListener<ProjectEventMap[K]>
  ): Promise<void>;
  removeListener<K extends keyof ProjectEventMap>(
    eventType: K,
    listener: ProjectEventListener<ProjectEventMap[K]>
  ): Promise<void>;
}
