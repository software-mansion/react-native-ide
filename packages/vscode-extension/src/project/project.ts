import {
  Disposable,
  debug,
  commands,
  workspace,
  FileSystemWatcher,
  window,
  env,
  Uri,
  DebugSessionCustomEvent,
} from "vscode";
import { Metro, MetroDelegate } from "./metro";
import { DeviceSession } from "./deviceSession";
import { Logger } from "../Logger";
import {
  BuildManager,
  BuildResult,
  DisposableBuild,
  didFingerprintChange,
} from "../builders/BuildManager";
import { DeviceAlreadyUsedError, DeviceManager } from "../devices/DeviceManager";
import { DeviceInfo } from "../common/DeviceManager";
import {
  AppPermissionType,
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
import { Notifier } from "./notifier";
import { DeviceBase } from "../devices/DeviceBase";
import { DebugSession } from "vscode";
import { getLaunchConfiguration } from "../utilities/launchConfiguration";
import { DependencyManager } from "../dependency/DependencyManager";
import { throttle } from "../utilities/throttle";

const DEVICE_SETTINGS_KEY = "device_settings_v2";
const LAST_SELECTED_DEVICE_KEY = "last_selected_device";
const PREVIEW_ZOOM_KEY = "preview_zoom";

type ReloadAction =
  | "rebuild"
  | "reboot"
  | "reinstall"
  | "restartProcess"
  | "reloadJs"
  | "hotReload";

export class Project implements Disposable, MetroDelegate, ProjectInterface {
  public static currentProject: Project | undefined;

  // from device session
  private inspectCallID = 7621;
  private debugSession: DebugSession | undefined;
  private device?: DeviceBase;
  private buildResult: BuildResult | undefined;

  private metro: Metro;
  private debugSessionListener!: Disposable;
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

  async initNotifier() {
    this.notifier.listen("RNIDE_appReady", () => {
      Logger.debug("App ready");
    });
    this.notifier.listen("RNIDE_navigationChanged", ({ id, displayName }) => {
      this.notifier.send("navigationChanged", { id, displayName });
    });
    this.notifier.listen("RNIDE_fastRefreshStarted", () => {
      this.updateProjectState({ status: "refreshing" });
    });
    this.notifier.listen("RNIDE_fastRefreshComplete", () => {
      if (this.projectState.status === "starting") return;
      if (this.projectState.status === "incrementalBundleError") return;
      if (this.projectState.status === "runtimeError") return;
      this.updateProjectState({ status: "running" });
    });
    await this.notifier.ready();
  }

  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly dependencyManager: DependencyManager,
    private readonly notifier: Notifier
  ) {
    const start = async () => {
      const handleDebuggerEvents = (event: DebugSessionCustomEvent) => {
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
      };
      const updateProgress = throttle((stageProgress: number) => {
        if (StartupMessage.WaitingForAppToLoad !== this.projectState.startupMessage) {
          return;
        }
        this.updateProjectState({ stageProgress });
      }, 100);

      await this.initNotifier();

      this.debugSessionListener = debug.onDidReceiveDebugSessionCustomEvent(handleDebuggerEvents);
      Logger.debug("Launching metro");

      this.metro.start(false, updateProgress, [this.installNodeModules()]);
      await this.metro.ready();
    };
    Project.currentProject = this;
    this.metro = new Metro(this.notifier, this);
    // TODO(jgonet): simultaneous metro and build
    this.buildManager = new BuildManager(dependencyManager);
    start();
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
    this.metro.dispose();
    this.notifier.dispose();
    this.debugSessionListener.dispose();
    this.deviceManager.removeListener("deviceRemoved", this.removeDeviceListener);
    this.workspaceWatcher.dispose();
    this.fileSaveWatcherDisposable.dispose();
  }

  public async reloadMetro() {
    await this.metro?.reload();
    this.updateProjectState({ status: "running" });
  }

  public async goHome() {
    return this.reloadMetro();
  }

  //#region async reload()

  public async reload(type: ReloadAction): Promise<boolean> {
    const installApp = ({ reinstall }: { reinstall: boolean }) => {
      this.updateProjectStateForDevice(this.projectState.selectedDevice!, {
        startupMessage: StartupMessage.Installing,
      });
      return this.device!.installApp(this.buildResult!, reinstall);
    };

    const startDebugger = async () => {
      const WAIT_FOR_DEBUGGER_TIMEOUT_MS = 15_000;

      const websocketAddress = await this.metro.getDebuggerURL(WAIT_FOR_DEBUGGER_TIMEOUT_MS);
      if (websocketAddress) {
        const debuggingOptions = {
          suppressDebugStatusbar: true,
          suppressDebugView: true,
          suppressDebugToolbar: true,
          suppressSaveBeforeStart: true,
        };
        const debuggingConfiguration = {
          type: "com.swmansion.react-native-ide",
          name: "React Native IDE Debugger",
          request: "attach",
          websocketAddress,
        };
        const debugStarted = await debug.startDebugging(
          undefined,
          debuggingConfiguration,
          debuggingOptions
        );
        if (debugStarted) {
          this.debugSession = debug.activeDebugSession;
          Logger.debug("Conencted to debbuger, moving on...");
        }
      } else {
        Logger.error("Couldn't connect to debugger");
      }
    };

    const launchApp = async (deviceInfo: DeviceInfo) => {
      // TODO(jgonet): remove device session
      this.device!.startPreview().then(() => {
        this.updateProjectStateForDevice(deviceInfo, { previewURL: this.device!.previewURL! });
      });

      if (!this.buildResult) {
        throw new Error("Expecting build to be ready");
      }
      const shouldWaitForAppLaunch = getLaunchConfiguration().preview?.waitForAppLaunch !== false;
      const waitForAppReady = shouldWaitForAppLaunch
        ? new Promise<void>((resolve) => {
            this.notifier.listen("RNIDE_appReady", resolve, { once: true });
          })
        : Promise.resolve();

      this.updateProjectStateForDevice(deviceInfo, {
        startupMessage: StartupMessage.Launching,
      });
      await this.device!.launchApp(this.buildResult, this.metro.port, this.notifier.devtoolsPort);
      Logger.debug("Will wait for app ready and for preview");
      this.updateProjectStateForDevice(deviceInfo, {
        startupMessage: StartupMessage.WaitingForAppToLoad,
      });
      await Promise.all([waitForAppReady, this.device!.startPreview()]);
      Logger.debug("App and preview ready, moving on...");
      this.updateProjectStateForDevice(deviceInfo, {
        startupMessage: StartupMessage.AttachingDebugger,
      });
      await startDebugger();

      Logger.debug("Device session started");
    };

    switch (type) {
      case "rebuild":
        // we save device info and device session at the start such that we can
        // check if they weren't updated in the meantime while we await for restart
        // procedures
        const deviceInfo = this.projectState.selectedDevice!;

        this.updateProjectStateForDevice(deviceInfo, {
          status: "starting",
          startupMessage: StartupMessage.Restarting,
        });

        const startMetro = async () => {
          const handleDebuggerEvents = (event: DebugSessionCustomEvent) => {
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
          };
          const updateProgress = throttle((stageProgress: number) => {
            if (StartupMessage.WaitingForAppToLoad !== this.projectState.startupMessage) {
              return;
            }
            this.updateProjectState({ stageProgress });
          }, 100);

          this.metro.dispose();
          this.metro = new Metro(this.notifier, this);
          this.debugSessionListener.dispose();
          this.debugSessionListener =
            debug.onDidReceiveDebugSessionCustomEvent(handleDebuggerEvents);

          Logger.debug("Launching metro");
          this.metro.start(true, updateProgress, [this.installNodeModules()]);
        };

        const selectDevice = async (deviceInfo: DeviceInfo) => {
          function notifyAboutAcquiringDeviceError(e: unknown) {
            if (e instanceof DeviceAlreadyUsedError) {
              window.showErrorMessage(
                "This device is already used by other instance of React Native IDE.\nPlease select another device",
                "Dismiss"
              );
            } else {
              Logger.error(
                `Couldn't acquire the device ${deviceInfo.platform} – ${deviceInfo.id}`,
                e
              );
            }
          }

          // TODO(jgonet): make this cleaner
          let device: IosSimulatorDevice | AndroidEmulatorDevice | undefined;
          try {
            device = await this.deviceManager.acquireDevice(deviceInfo);
          } catch (e) {
            notifyAboutAcquiringDeviceError(e);
          }

          if (!device) {
            return undefined;
          }

          Logger.log("Device selected", deviceInfo.name);
          extensionContext.workspaceState.update(LAST_SELECTED_DEVICE_KEY, deviceInfo.id);
          Logger.debug("Selected device is ready");

          this.updateProjectState({
            selectedDevice: deviceInfo,
            status: "starting",
            startupMessage: StartupMessage.InitializingDevice,
            previewURL: undefined,
          });

          return device;
        };

        const waitForMetroReady = async () => {
          // wait for metro/devtools to start before we continue
          this.updateProjectStateForDevice(deviceInfo, {
            startupMessage: StartupMessage.StartingPackager,
          });
          await this.notifier.ready();
          await this.metro.ready();
          Logger.debug("Metro & devtools ready");
        };

        const buildApp = (deviceInfo: DeviceInfo) => {
          const updateProgress = throttle((stageProgress: number) => {
            if (StartupMessage.Building !== this.projectState.startupMessage) {
              return;
            }
            this.updateProjectState({ stageProgress });
          }, 100);

          return this.buildManager.startBuild(deviceInfo, {
            forceCleanBuild: true,
            onProgress: updateProgress,
            onSuccess: () => {
              // reset fingerprint change flag when build finishes successfully
              this.detectedFingerprintChange = false;
            },
          });
        };

        const bootDevice = async (
          device: DeviceBase,
          disposableBuild: DisposableBuild<BuildResult>
        ) => {
          this.deviceSession?.dispose();
          this.deviceSession = undefined;

          this.updateProjectStateForDevice(deviceInfo, { status: "running" });
          this.device = device;
          const newDeviceSession = new DeviceSession(
            device,
            this.notifier,
            this.metro,
            disposableBuild
          );
          this.deviceSession = newDeviceSession;

          this.updateProjectStateForDevice(deviceInfo, {
            startupMessage: StartupMessage.BootingDevice,
          });
          await device.bootDevice();
          await device.changeSettings(this.deviceSettings);
        };

        const device = await selectDevice(deviceInfo);
        if (device) {
          await startMetro();
          await waitForMetroReady();

          // TODO(jgonet): Readd try-catch
          const build = buildApp(deviceInfo);
          bootDevice(device, build);
          // TODO(jgonet): Change the order of booting and build
          this.updateProjectStateForDevice(deviceInfo, {
            startupMessage: StartupMessage.Building,
          });
          this.buildResult = await build.build;

          await installApp({ reinstall: false });
          await launchApp(deviceInfo);
          return true;
        }
        return false;
      case "reboot":
        // TODO(jgonet): implement
        return false;
      case "reinstall":
        await installApp({ reinstall: true });
        await launchApp(this.projectState.selectedDevice!);
        return true;
      case "restartProcess":
        await launchApp(this.projectState.selectedDevice!);
        return false;
      case "reloadJs":
        // TODO(jgonet): implement
        return false;
      case "hotReload":
        // TODO(jgonet): Remove, needed only for special handling of RNIDE_appReady event
        if (this.notifier.connectedToApp) {
          await this.metro?.reload();
          this.updateProjectState({ status: "running" });
          return true;
        }
        return false;
    }
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
      this.reload("rebuild");
      return;
    } else if (this.detectedFingerprintChange) {
      await this.selectDevice(deviceInfo, false);
      return;
    }

    // if we have an active devtools session, we try hot reloading
    if (onlyReloadJSWhenPossible && this.notifier.connectedToApp) {
      this.reload("hotReload");
      return;
    }

    // otherwise we try to restart the device session
    // TODO(jgonet): Next up – move this to reload()
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

  async resetAppPermissions(permissionType: AppPermissionType) {
    const needsRestart = await this.deviceSession?.resetAppPermissions(permissionType);
    if (needsRestart) {
      this.restart(false, false);
    }
  }

  public async dispatchTouch(xRatio: number, yRatio: number, type: "Up" | "Move" | "Down") {
    this.deviceSession?.sendTouch(xRatio, yRatio, type);
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

  public async updateDeviceSettings(settings: DeviceSettings) {
    this.deviceSettings = settings;
    extensionContext.workspaceState.update(DEVICE_SETTINGS_KEY, settings);
    await this.deviceSession?.changeDeviceSettings(settings);
    this.eventEmitter.emit("deviceSettingsChanged", this.deviceSettings);
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
      await this.notifier.ready();
      await this.metro.ready();
      const build = this.buildManager.startBuild(deviceInfo, {
        forceCleanBuild,
        onProgress: throttle((stageProgress: number) => {
          this.reportStageProgress(stageProgress, StartupMessage.Building);
        }, 100),
      });

      // reset fingerpring change flag when build finishes successfully
      if (this.detectedFingerprintChange) {
        build.build.then(() => {
          this.detectedFingerprintChange = false;
        });
      }

      Logger.debug("Metro & devtools ready");
      newDeviceSession = new DeviceSession(device, this.notifier, this.metro, build);
      this.deviceSession = newDeviceSession;

      await newDeviceSession.start(this.deviceSettings, {
        onPreviewReady: (previewURL) => {
          this.updateProjectStateForDevice(deviceInfo, { previewURL });
        },
        onProgress: (startupMessage) =>
          this.updateProjectStateForDevice(deviceInfo, { startupMessage }),
      });
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
  private removeDeviceListener = async (_devices: DeviceInfo) => {
    await this.trySelectingInitialDevice();
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
