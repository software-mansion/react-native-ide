import { Disposable, commands, workspace, window, DebugSessionCustomEvent } from "vscode";
import { Metro, MetroDelegate } from "./metro";
import { Devtools } from "./devtools";
import { AppEvent, DeviceSession, EventDelegate } from "./deviceSession";
import { Logger } from "../Logger";
import { didFingerprintChange } from "../builders/BuildManager";
import { DeviceAlreadyUsedError, DeviceManager } from "../devices/DeviceManager";
import { DeviceInfo } from "../common/DeviceManager";
import {
  AppPermissionType,
  DeviceSettings,
  InspectData,
  Locale,
  ProjectEventListener,
  ProjectEventMap,
  ProjectInterface,
  ProjectState,
  ReloadAction,
  StartupMessage,
  TouchPoint,
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
import { DebugSessionDelegate } from "../debugging/DebugSession";
import { activateDevice, checkToken } from "../utilities/license";

const DEVICE_SETTINGS_KEY = "device_settings_v4";
const LAST_SELECTED_DEVICE_KEY = "last_selected_device";
const PREVIEW_ZOOM_KEY = "preview_zoom";

export class Project
  implements Disposable, MetroDelegate, EventDelegate, DebugSessionDelegate, ProjectInterface
{
  public static currentProject: Project | undefined;

  private metro: Metro;
  private devtools = new Devtools();
  private eventEmitter = new EventEmitter();

  private detectedFingerprintChange: boolean;

  private expoRouterInstalled: boolean;
  private storybookInstalled: boolean;

  private fileWatcher: Disposable;

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
    hasEnrolledBiometrics: false,
    locale: "en_US",
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
      hasEnrolledBiometrics: false,
      locale: "en_US",
    };
    this.devtools = new Devtools();
    this.metro = new Metro(this.devtools, this);
    this.start(false, false);
    this.trySelectingInitialDevice();
    this.deviceManager.addListener("deviceRemoved", this.removeDeviceListener);
    this.detectedFingerprintChange = false;
    this.expoRouterInstalled = false;
    this.storybookInstalled = false;

    this.fileWatcher = watchProjectFiles(() => {
      this.checkIfNativeChanged();
    });
  }

  //#region Build progress
  onBuildProgress = (stageProgress: number): void => {
    this.reportStageProgress(stageProgress, StartupMessage.Building);
  };

  onBuildSuccess = (): void => {
    // reset fingerprint change flag when build finishes successfully
    this.detectedFingerprintChange = false;
  };

  onStateChange = (state: StartupMessage): void => {
    this.updateProjectStateForDevice(this.projectState.selectedDevice!, { startupMessage: state });
  };
  //#endregion

  //#region App events
  onAppEvent = <E extends keyof AppEvent, P = AppEvent[E]>(event: E, payload: P): void => {
    switch (event) {
      case "navigationChanged":
        this.eventEmitter.emit("navigationChanged", payload);
        break;
      case "fastRefreshStarted":
        this.updateProjectState({ status: "refreshing" });
        break;
      case "fastRefreshComplete":
        const ignoredEvents = ["starting", "incrementalBundleError", "runtimeError"];
        if (ignoredEvents.includes(this.projectState.status)) {
          return;
        }
        this.updateProjectState({ status: "running" });
        break;
    }
  };
  //#endregion

  //#region Debugger events
  onConsoleLog(event: DebugSessionCustomEvent) {
    this.eventEmitter.emit("log", event.body);
  }

  onDebuggerPaused(event: DebugSessionCustomEvent) {
    if (event.body?.reason === "exception") {
      // if we know that incremental bundle error happened, we don't want to change the status
      if (this.projectState.status === "incrementalBundleError") {
        return;
      }
      this.updateProjectState({ status: "runtimeError" });
    } else {
      this.updateProjectState({ status: "debuggerPaused" });
    }
    commands.executeCommand("workbench.view.debug");
  }

  onDebuggerResumed() {
    this.updateProjectState({ status: "running" });
  }
  //#endregion

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
      const device = devices.find(({ id }) => id === lastDeviceId) ?? devices.at(0);

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
    this.deviceManager.removeListener("deviceRemoved", this.removeDeviceListener);
    this.fileWatcher.dispose();
  }

  private async reloadMetro() {
    if (await this.deviceSession?.perform("hotReload")) {
      this.updateProjectState({ status: "running" });
    }
  }

  public async goHome(homeUrl: string) {
    if (this.expoRouterInstalled) {
      await this.openNavigation(homeUrl);
    } else {
      await this.reloadMetro();
    }
  }

  //#region Session lifecycle
  public async restart(
    forceCleanBuild: boolean,
    onlyReloadJSWhenPossible: boolean = true,
    restartDevice: boolean = false
  ) {
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
      return await this.selectDevice(deviceInfo, true);
    }

    if (this.detectedFingerprintChange) {
      return await this.selectDevice(deviceInfo, false);
    }

    if (restartDevice) {
      return await this.selectDevice(deviceInfo, false);
    }

    if (onlyReloadJSWhenPossible) {
      return await this.reloadMetro();
    }

    // otherwise we try to restart the device session
    try {
      // we first check if the device session hasn't changed in the meantime
      if (deviceSession === this.deviceSession) {
        await this.deviceSession?.perform("restartProcess");
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

  public async reload(type: ReloadAction): Promise<boolean> {
    this.updateProjectState({ status: "starting" });
    const success = (await this.deviceSession?.perform(type)) ?? false;
    // TODO(jgonet): Don't assume that success is always true
    this.updateProjectState({ status: "running" });
    return success;
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

    Logger.debug("Installing Node Modules");
    const installNodeModules = this.installNodeModules();

    Logger.debug(`Launching devtools`);
    const waitForDevtools = this.devtools.start();

    Logger.debug(`Launching metro`);
    const waitForMetro = this.metro.start(
      forceCleanBuild,
      throttle((stageProgress: number) => {
        this.reportStageProgress(stageProgress, StartupMessage.WaitingForAppToLoad);
      }, 100),
      [installNodeModules]
    );

    Logger.debug("Checking expo router");
    this.expoRouterInstalled = await this.dependencyManager.checkExpoRouterInstalled();
    Logger.debug("Checking storybook");
    this.storybookInstalled = await this.dependencyManager.checkStorybookInstalled();
  }
  //#endregion

  async resetAppPermissions(permissionType: AppPermissionType) {
    const needsRestart = await this.deviceSession?.resetAppPermissions(permissionType);
    if (needsRestart) {
      this.restart(false, false);
    }
  }

  public async dispatchTouches(touches: Array<TouchPoint>, type: "Up" | "Move" | "Down") {
    this.deviceSession?.sendTouches(touches, type);
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
          .getConfiguration("RadonIDE")
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
    this.deviceSession?.focusBuildOutput();
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

  public async isLicenseActivated() {
    return await checkToken();
  }

  public async activateLicense(licenseKey: string, username: string) {
    Logger.debug("Frytki", "jestem tu", licenseKey, username);
    return activateDevice(licenseKey, username);
  }

  public startPreview(appKey: string) {
    this.deviceSession?.startPreview(appKey);
  }

  public async showStorybookStory(componentTitle: string, storyName: string) {
    if (this.storybookInstalled) {
      this.devtools.send("RNIDE_showStorybookStory", { componentTitle, storyName });
    } else {
      window.showErrorMessage("Storybook is not installed.", "Dismiss");
    }
  }

  public onActiveFileChange(filename: string, followEnabled: boolean) {
    this.deviceSession?.onActiveFileChange(filename, followEnabled);
  }

  public async getDeviceSettings() {
    return this.deviceSettings;
  }

  public async updateDeviceSettings(settings: DeviceSettings) {
    this.deviceSettings = settings;
    extensionContext.workspaceState.update(DEVICE_SETTINGS_KEY, settings);
    let needsRestart = await this.deviceSession?.changeDeviceSettings(settings);
    this.eventEmitter.emit("deviceSettingsChanged", this.deviceSettings);

    if (needsRestart) {
      await this.restart(false, false, true);
    }
  }

  public async sendBiometricAuthorization(isMatch: boolean) {
    await this.deviceSession?.sendBiometricAuthorization(isMatch);
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

  //#region Select device
  private async selectDeviceOnly(deviceInfo: DeviceInfo) {
    let device: IosSimulatorDevice | AndroidEmulatorDevice | undefined;
    try {
      device = await this.deviceManager.acquireDevice(deviceInfo);
    } catch (e) {
      if (e instanceof DeviceAlreadyUsedError) {
        window.showErrorMessage(
          "This device is already used by other instance of Radon IDE.\nPlease select another device",
          "Dismiss"
        );
      } else {
        Logger.error(`Couldn't acquire the device ${deviceInfo.platform} – ${deviceInfo.id}`, e);
      }
    }

    if (device) {
      Logger.log("Device selected", deviceInfo.name);
      extensionContext.workspaceState.update(LAST_SELECTED_DEVICE_KEY, deviceInfo.id);
      return device;
    }
    return undefined;
  }

  public async selectDevice(deviceInfo: DeviceInfo, forceCleanBuild = false) {
    const device = await this.selectDeviceOnly(deviceInfo);
    if (!device) {
      return;
    }
    Logger.debug("Selected device is ready");

    this.deviceSession?.dispose();
    this.deviceSession = undefined;

    this.updateProjectState({
      selectedDevice: deviceInfo,
      status: "starting",
      startupMessage: StartupMessage.InitializingDevice,
      previewURL: undefined,
    });

    let newDeviceSession;
    try {
      newDeviceSession = new DeviceSession(
        device,
        this.devtools,
        this.metro,
        this.dependencyManager,
        this,
        this
      );
      this.deviceSession = newDeviceSession;

      const previewURL = await newDeviceSession.start(this.deviceSettings, {
        cleanBuild: forceCleanBuild,
      });
      this.updateProjectStateForDevice(this.projectState.selectedDevice!, {
        previewURL,
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
  //#endregion

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

function watchProjectFiles(onChange: () => void) {
  // VS code glob patterns don't support negation so we can't exclude
  // native build directories like android/build, android/.gradle,
  // android/app/build, or ios/build.
  // VS code by default exclude .git and node_modules directories from
  // watching, configured by `files.watcherExclude` setting.
  //
  // We may revisit this if better performance is needed and create
  // recursive watches ourselves by iterating through workspace directories
  // to workaround this issue.
  const savedFileWatcher = workspace.onDidSaveTextDocument(onChange);

  const watcher = workspace.createFileSystemWatcher("**/*");
  watcher.onDidChange(onChange);
  watcher.onDidCreate(onChange);
  watcher.onDidDelete(onChange);

  return {
    dispose: () => {
      watcher.dispose();
      savedFileWatcher.dispose();
    },
  };
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
