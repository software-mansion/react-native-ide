import { Disposable, debug, commands, workspace, FileSystemWatcher, window } from "vscode";
import { Metro, MetroDelegate } from "./metro";
import { Devtools } from "./devtools";
import { DeviceSession } from "./deviceSession";
import { Logger } from "../Logger";
import { BuildManager, didFingerprintChange } from "../builders/BuildManager";
import { DeviceAlreadyUsedError, DeviceManager } from "../devices/DeviceManager";
import { DeviceInfo, DevicePlatform } from "../common/DeviceManager";
import {
  AppPermissionType,
  BiometricEnrolment,
  DeviceSettings,
  InspectData,
  ProjectEventListener,
  ProjectEventMap,
  ProjectInterface,
  ProjectState,
  StartupMessage,
  ZoomLevelType,
} from "../common/Project";
import { EventEmitter } from "stream";
import { extensionContext } from "../utilities/extensionContext";
import stripAnsi from "strip-ansi";
import { minimatch } from "minimatch";
import { IosSimulatorDevice } from "../devices/IosSimulatorDevice";
import { AndroidEmulatorDevice } from "../devices/AndroidEmulatorDevice";
import { DependencyManager } from "../dependency/DependencyManager";
import { throttle } from "../utilities/throttle";
import { Platform } from "../utilities/platform";

const DEVICE_SETTINGS_KEY = "device_settings_v3";
const BIOMETRIC_ENROLLMENT_KEY = "biometric_enrollment";
const LAST_SELECTED_DEVICE_KEY = "last_selected_device";
const PREVIEW_ZOOM_KEY = "preview_zoom";

export class Project implements Disposable, MetroDelegate, ProjectInterface {
  public static currentProject: Project | undefined;

  private metro: Metro;
  private devtools = new Devtools();
  private debugSessionListener: Disposable | undefined;
  private buildManager: BuildManager;
  private eventEmitter = new EventEmitter();

  private detectedFingerprintChange: boolean;
  private workspaceWatcher!: FileSystemWatcher;
  private fileSaveWatcherDisposable!: Disposable;

  private deviceSession: DeviceSession | undefined;

  private projectState: ProjectState = {
    status: "starting",
    previewURL: undefined,
    previewZoom: extensionContext.workspaceState.get(PREVIEW_ZOOM_KEY),
    selectedDevice: undefined,
  };

  private deviceSettings: DeviceSettings = extensionContext.workspaceState.get(
    DEVICE_SETTINGS_KEY
  ) ?? {
    appearance: "dark",
    contentSize: "normal",
    location: {
      latitude: 50.048653,
      longitude: 19.965474,
      isDisabled: true,
    },
  };

  private biometricEnrollment: BiometricEnrolment = extensionContext.workspaceState.get(
    BIOMETRIC_ENROLLMENT_KEY
  ) ?? {
    android: false,
    ios: false,
  };

  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly dependencyManager: DependencyManager
  ) {
    Project.currentProject = this;
    this.deviceSettings = extensionContext.workspaceState.get(DEVICE_SETTINGS_KEY) ?? {
      appearance: "dark",
      contentSize: "normal",
      location: {
        latitude: 50.048653,
        longitude: 19.965474,
        isDisabled: false,
      },
    };
    this.biometricEnrollment = extensionContext.workspaceState.get(BIOMETRIC_ENROLLMENT_KEY) ?? {
      android: false,
      ios: false,
    };
    this.devtools = new Devtools();
    this.metro = new Metro(this.devtools, this);
    this.buildManager = new BuildManager(dependencyManager);
    this.start(false, false);
    this.trySelectingInitialDevice();
    this.deviceManager.addListener("deviceRemoved", this.removeDeviceListener);
    this.detectedFingerprintChange = false;

    this.trackNativeChanges();
  }

  trackNativeChanges() {
    // VS code glob patterns don't support negation so we can't exclude
    // native build directories like android/build, android/.gradle,
    // android/app/build, or ios/build.
    // VS code by default exclude .git and node_modules directories from
    // watching, configured by `files.watcherExclude` setting.
    //
    // We may revisit this if better performance is needed and create
    // recursive watches ourselves by iterating through workspace directories
    // to workaround this issue.
    this.workspaceWatcher = workspace.createFileSystemWatcher("**/*");

    this.workspaceWatcher.onDidChange(() => this.checkIfNativeChanged());
    this.workspaceWatcher.onDidCreate(() => this.checkIfNativeChanged());
    this.workspaceWatcher.onDidDelete(() => this.checkIfNativeChanged());
    this.fileSaveWatcherDisposable = workspace.onDidSaveTextDocument(() => {
      this.checkIfNativeChanged();
    });
  }

  async dispatchPaste(text: string) {
    this.deviceSession?.sendPaste(text);
  }

  onBundleError(): void {
    this.updateProjectState({ status: "bundleError" });
  }

  onIncrementalBundleError(message: string, _errorModulePath: string): void {
    Logger.error(stripAnsi(message));
    // if bundle build failed, we don't want to change the status
    // incrementalBundleError status should be set only when bundleError status is not set
    if (this.projectState.status === "bundleError") {
      return;
    }
    this.updateProjectState({ status: "incrementalBundleError" });
  }

  /**
   * This method tried to select the last selected device from devices list.
   * If the device list is empty, we wait until we can select a device.
   */
  private async trySelectingInitialDevice() {
    const selectInitialDevice = (devices: DeviceInfo[]) => {
      const lastDeviceId = extensionContext.workspaceState.get<string | undefined>(
        LAST_SELECTED_DEVICE_KEY
      );
      let device = devices.find((item) => item.id === lastDeviceId);
      if (!device && devices.length > 0) {
        device = devices[0];
      }
      if (device) {
        this.selectDevice(device);
        return true;
      }
      this.updateProjectState({
        selectedDevice: undefined,
      });
      return false;
    };

    const devices = await this.deviceManager.listAllDevices();
    if (!selectInitialDevice(devices)) {
      const listener = (newDevices: DeviceInfo[]) => {
        if (selectInitialDevice(newDevices)) {
          this.deviceManager.removeListener("devicesChanged", listener);
        }
      };
      this.deviceManager.addListener("devicesChanged", listener);
    }
  }

  async getProjectState(): Promise<ProjectState> {
    return this.projectState;
  }

  async addListener<K extends keyof ProjectEventMap>(
    eventType: K,
    listener: ProjectEventListener<ProjectEventMap[K]>
  ) {
    this.eventEmitter.addListener(eventType, listener);
  }
  async removeListener<K extends keyof ProjectEventMap>(
    eventType: K,
    listener: ProjectEventListener<ProjectEventMap[K]>
  ) {
    this.eventEmitter.removeListener(eventType, listener);
  }

  public dispose() {
    this.deviceSession?.dispose();
    this.metro?.dispose();
    this.devtools?.dispose();
    this.debugSessionListener?.dispose();
    this.deviceManager.removeListener("deviceRemoved", this.removeDeviceListener);
    this.workspaceWatcher.dispose();
    this.fileSaveWatcherDisposable.dispose();
  }

  private reloadingMetro = false;

  public reloadMetro() {
    this.reloadingMetro = true;
    this.metro?.reload();
  }

  public async goHome() {
    this.reloadMetro();
  }

  public async restart(forceCleanBuild: boolean, onlyReloadJSWhenPossible: boolean = true) {
    // we save device info and device session at the start such that we can
    // check if they weren't updated in the meantime while we await for restart
    // procedures
    const deviceInfo = this.projectState.selectedDevice!;
    const deviceSession = this.deviceSession;

    this.updateProjectStateForDevice(deviceInfo, {
      status: "starting",
      startupMessage: StartupMessage.Restarting,
    });

    if (forceCleanBuild) {
      await this.start(true, true);
      await this.selectDevice(deviceInfo, true);
      return;
    } else if (this.detectedFingerprintChange) {
      await this.selectDevice(deviceInfo, false);
      return;
    }

    // if we have an active devtools session, we try hot reloading
    if (onlyReloadJSWhenPossible && this.devtools.hasConnectedClient) {
      this.reloadMetro();
      return;
    }

    // otherwise we try to restart the device session
    try {
      // we first check if the device session hasn't changed in the meantime
      if (deviceSession === this.deviceSession) {
        await this.deviceSession?.restart((startupMessage) =>
          this.updateProjectStateForDevice(deviceInfo, { startupMessage })
        );
        this.updateProjectStateForDevice(deviceInfo, {
          status: "running",
        });
      }
    } catch (e) {
      // finally in case of any errors, we restart the selected device which reboots
      // emulator etc...
      // we first check if the device hasn't been updated in the meantime
      if (deviceInfo === this.projectState.selectedDevice) {
        await this.selectDevice(this.projectState.selectedDevice!, false);
      }
    }
  }

  private async start(restart: boolean, forceCleanBuild: boolean) {
    if (restart) {
      const oldDevtools = this.devtools;
      const oldMetro = this.metro;
      this.devtools = new Devtools();
      this.metro = new Metro(this.devtools, this);
      oldDevtools.dispose();
      oldMetro.dispose();
    }
    this.devtools.addListener((event, payload) => {
      switch (event) {
        case "RNIDE_appReady":
          Logger.debug("App ready");
          if (this.reloadingMetro) {
            this.reloadingMetro = false;
            this.updateProjectState({ status: "running" });
          }
          break;
        case "RNIDE_navigationChanged":
          this.eventEmitter.emit("navigationChanged", {
            displayName: payload.displayName,
            id: payload.id,
          });
          break;
        case "RNIDE_fastRefreshStarted":
          this.updateProjectState({ status: "refreshing" });
          break;
        case "RNIDE_fastRefreshComplete":
          if (this.projectState.status === "starting") return;
          if (this.projectState.status === "incrementalBundleError") return;
          if (this.projectState.status === "runtimeError") return;
          this.updateProjectState({ status: "running" });
          break;
      }
    });

    Logger.debug("Installing Node Modules");
    const installNodeModules = this.installNodeModules();

    Logger.debug(`Launching devtools`);
    const waitForDevtools = this.devtools.start();

    this.debugSessionListener?.dispose();
    this.debugSessionListener = debug.onDidReceiveDebugSessionCustomEvent((event) => {
      switch (event.event) {
        case "RNIDE_consoleLog":
          this.eventEmitter.emit("log", event.body);
          break;
        case "RNIDE_paused":
          if (event.body?.reason === "exception") {
            // if we know that incrmental bundle error happened, we don't want to change the status
            if (this.projectState.status === "incrementalBundleError") return;
            this.updateProjectState({ status: "runtimeError" });
          } else {
            this.updateProjectState({ status: "debuggerPaused" });
          }
          commands.executeCommand("workbench.view.debug");
          break;
        case "RNIDE_continued":
          this.updateProjectState({ status: "running" });
          break;
      }
    });

    Logger.debug(`Launching metro`);
    const waitForMetro = this.metro.start(
      forceCleanBuild,
      throttle((stageProgress: number) => {
        this.reportStageProgress(stageProgress, StartupMessage.WaitingForAppToLoad);
      }, 100),
      [installNodeModules]
    );
  }

  async resetAppPermissions(permissionType: AppPermissionType) {
    const needsRestart = await this.deviceSession?.resetAppPermissions(permissionType);
    if (needsRestart) {
      this.restart(false, false);
    }
  }

  public async dispatchTouch(xRatio: number, yRatio: number, type: "Up" | "Move" | "Down") {
    this.deviceSession?.sendTouch(xRatio, yRatio, type);
  }

  public async dispatchMultiTouch(
    xRatio: number,
    yRatio: number,
    xAnchorRatio: number,
    yAnchorRatio: number,
    type: "Up" | "Move" | "Down"
  ) {
    this.deviceSession?.sendMultiTouch(xRatio, yRatio, xAnchorRatio, yAnchorRatio, type);
  }

  public async dispatchKeyPress(keyCode: number, direction: "Up" | "Down") {
    this.deviceSession?.sendKey(keyCode, direction);
  }

  public async inspectElementAt(
    xRatio: number,
    yRatio: number,
    requestStack: boolean,
    callback: (inspectData: InspectData) => void
  ) {
    this.deviceSession?.inspectElementAt(xRatio, yRatio, requestStack, (inspectData) => {
      let stack = undefined;
      if (requestStack && inspectData?.stack) {
        stack = inspectData.stack;
        const inspectorExcludePattern = workspace
          .getConfiguration("ReactNativeIDE")
          .get("inspectorExcludePattern") as string | undefined;
        const patterns = inspectorExcludePattern?.split(",").map((pattern) => pattern.trim());
        function testInspectorExcludeGlobPattern(filename: string) {
          return patterns?.some((pattern) => minimatch(filename, pattern));
        }
        stack.forEach((item: any) => {
          item.hide = false;
          if (!isAppSourceFile(item.source.fileName)) {
            item.hide = true;
          } else if (testInspectorExcludeGlobPattern(item.source.fileName)) {
            item.hide = true;
          }
        });
      }
      callback({ frame: inspectData.frame, stack });
    });
  }

  public async resumeDebugger() {
    this.deviceSession?.resumeDebugger();
  }

  public async stepOverDebugger() {
    this.deviceSession?.stepOverDebugger();
  }

  public async focusBuildOutput() {
    if (!this.projectState.selectedDevice) {
      return;
    }
    this.buildManager.focusBuildOutput();
  }

  public async focusExtensionLogsOutput() {
    Logger.openOutputPanel();
  }

  public async focusDebugConsole() {
    commands.executeCommand("workbench.panel.repl.view.focus");
  }

  public async openNavigation(navigationItemID: string) {
    this.deviceSession?.openNavigation(navigationItemID);
  }

  public async openDevMenu() {
    await this.deviceSession?.openDevMenu();
  }

  public startPreview(appKey: string) {
    this.deviceSession?.startPreview(appKey);
  }

  public onActiveFileChange(filename: string, followEnabled: boolean) {
    this.deviceSession?.onActiveFileChange(filename, followEnabled);
  }

  public async getDeviceSettings() {
    return this.deviceSettings;
  }

  public async getBiometricEnrollment() {
    return this.biometricEnrollment;
  }

  public async updateDeviceSettings(settings: DeviceSettings) {
    await this.deviceSession?.changeDeviceSettings(settings);
    this.deviceSettings = settings;
    extensionContext.workspaceState.update(DEVICE_SETTINGS_KEY, settings);
    this.eventEmitter.emit("deviceSettingsChanged", this.deviceSettings);
  }

  public async toggleBiometricEnrollment() {
    if (this.projectState.selectedDevice?.platform === DevicePlatform.Android) {
      this.biometricEnrollment = {
        ...this.biometricEnrollment,
        android: !this.biometricEnrollment.android,
      };
      extensionContext.workspaceState.update(BIOMETRIC_ENROLLMENT_KEY, this.biometricEnrollment);
      this.eventEmitter.emit("biometricEnrollmentChanged", this.biometricEnrollment);

      this.deviceSession?.changeBiometricAuthorizationEnrollment(true);
      // here the logic of "do it yourself"
    } else {
      Logger.debug("Frytki", this.biometricEnrollment);
      this.biometricEnrollment = {
        ...this.biometricEnrollment,
        ios: !this.biometricEnrollment.ios,
      };
      extensionContext.workspaceState.update(BIOMETRIC_ENROLLMENT_KEY, this.biometricEnrollment);
      Logger.debug("Frytki", this.biometricEnrollment);
      await this.deviceSession?.changeBiometricAuthorizationEnrollment(
        !this.biometricEnrollment.ios
      );
      this.eventEmitter.emit("biometricEnrollmentChanged", this.biometricEnrollment);
    }
  }

  public async sendBiometricAuthorization(match: number) {
    await this.deviceSession?.sendBiometricAuthorization(match);
  }

  private reportStageProgress(stageProgress: number, stage: string) {
    if (stage !== this.projectState.startupMessage) {
      return;
    }
    this.updateProjectState({ stageProgress });
  }

  private updateProjectState(newState: Partial<ProjectState>) {
    // stageProgress is tied to a startup stage, so when there is a change of status or startupMessage,
    // we always want to reset the progress.
    if (newState.status !== undefined || newState.startupMessage !== undefined) {
      delete this.projectState.stageProgress;
    }
    this.projectState = { ...this.projectState, ...newState };
    this.eventEmitter.emit("projectStateChanged", this.projectState);
  }

  private updateProjectStateForDevice(deviceInfo: DeviceInfo, newState: Partial<ProjectState>) {
    if (deviceInfo === this.projectState.selectedDevice) {
      this.updateProjectState(newState);
    }
  }

  public async updatePreviewZoomLevel(zoom: ZoomLevelType): Promise<void> {
    this.updateProjectState({ previewZoom: zoom });
    extensionContext.workspaceState.update(PREVIEW_ZOOM_KEY, zoom);
  }

  private async installNodeModules(): Promise<void> {
    const nodeModulesStatus = await this.dependencyManager.checkNodeModulesInstalled();

    if (!nodeModulesStatus.installed) {
      await this.dependencyManager.installNodeModules(nodeModulesStatus.packageManager);
    }
    Logger.debug("Node Modules installed");
  }

  public async selectDevice(deviceInfo: DeviceInfo, forceCleanBuild = false) {
    let device: IosSimulatorDevice | AndroidEmulatorDevice | undefined;
    try {
      device = await this.deviceManager.acquireDevice(deviceInfo);
    } catch (e) {
      if (e instanceof DeviceAlreadyUsedError) {
        window.showErrorMessage(
          "This device is already used by other instance of React Native IDE.\nPlease select another device",
          "Dismiss"
        );
      } else {
        Logger.error(`Couldn't acquire the device ${deviceInfo.platform} – ${deviceInfo.id}`, e);
      }
    }

    if (!device) {
      return;
    }

    Logger.log("Device selected", deviceInfo.name);
    extensionContext.workspaceState.update(LAST_SELECTED_DEVICE_KEY, deviceInfo.id);

    this.reloadingMetro = false;
    const prevSession = this.deviceSession;
    this.deviceSession = undefined;
    prevSession?.dispose();

    this.updateProjectState({
      selectedDevice: deviceInfo,
      status: "starting",
      startupMessage: StartupMessage.InitializingDevice,
      previewURL: undefined,
    });

    let newDeviceSession;

    try {
      Logger.debug("Selected device is ready");
      this.updateProjectStateForDevice(deviceInfo, {
        startupMessage: StartupMessage.StartingPackager,
      });
      // wait for metro/devtools to start before we continue
      await Promise.all([this.metro.ready(), this.devtools.ready()]);
      const build = this.buildManager.startBuild(
        deviceInfo,
        forceCleanBuild,
        throttle((stageProgress: number) => {
          this.reportStageProgress(stageProgress, StartupMessage.Building);
        }, 100)
      );

      // reset fingerpring change flag when build finishes successfully
      if (this.detectedFingerprintChange) {
        build.build.then(() => {
          this.detectedFingerprintChange = false;
        });
      }

      Logger.debug("Metro & devtools ready");
      newDeviceSession = new DeviceSession(device, this.devtools, this.metro, build);
      this.deviceSession = newDeviceSession;

      await newDeviceSession.start(
        this.deviceSettings,
        (previewURL) => {
          this.updateProjectStateForDevice(deviceInfo, { previewURL });
        },
        (startupMessage) => this.updateProjectStateForDevice(deviceInfo, { startupMessage })
      );
      Logger.debug("Device session started");

      this.updateProjectStateForDevice(deviceInfo, {
        status: "running",
      });
    } catch (e) {
      Logger.error("Couldn't start device session", e);

      const isSelected = this.projectState.selectedDevice === deviceInfo;
      const isNewSession = this.deviceSession === newDeviceSession;
      if (isSelected && isNewSession) {
        this.updateProjectState({ status: "buildError" });
      }
    }
  }

  // used in callbacks, needs to be an arrow function
  private removeDeviceListener = async (device: DeviceInfo) => {
    if (this.projectState.selectedDevice?.id === device.id) {
      this.updateProjectState({ status: "starting" });
      await this.trySelectingInitialDevice();
    }
  };

  private checkIfNativeChanged = throttle(async () => {
    if (!this.detectedFingerprintChange && this.projectState.selectedDevice) {
      if (await didFingerprintChange(this.projectState.selectedDevice.platform)) {
        this.detectedFingerprintChange = true;
        this.eventEmitter.emit("needsNativeRebuild");
      }
    }
  }, 300);
}

export function isAppSourceFile(filePath: string) {
  const relativeToWorkspace = workspace.asRelativePath(filePath, false);

  if (relativeToWorkspace === filePath) {
    // when path is outside of any workspace folder, workspace.asRelativePath returns the original path
    return false;
  }

  // if the relative path contain node_modules, we assume it's not user's app source file:
  return !relativeToWorkspace.includes("node_modules");
}
