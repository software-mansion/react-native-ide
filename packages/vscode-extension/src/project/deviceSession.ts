import { Disposable, debug, DebugSession } from "vscode";
import { Metro } from "./metro";
import { Devtools } from "./devtools";
import { DeviceBase } from "../devices/DeviceBase";
import { Logger } from "../Logger";
import { BuildResult, DisposableBuild } from "../builders/BuildManager";
import { DeviceSettings, StartupMessage } from "../common/Project";
import { Platform } from "../common/DeviceManager";
import { AndroidEmulatorDevice } from "../devices/AndroidEmulatorDevice";
import { getLaunchConfiguration } from "../utilities/launchConfiguration";

const WAIT_FOR_DEBUGGER_TIMEOUT = 15000; // 15 seconds

type ProgressCallback = (startupMessage: string) => void;
type PreviewReadyCallback = (previewURL: string) => void;

export class DeviceSession implements Disposable {
  private inspectCallID = 7621;
  private debugSession: DebugSession | undefined;

  constructor(
    private readonly device: DeviceBase,
    private readonly devtools: Devtools,
    private readonly metro: Metro,
    private readonly disposableBuild: DisposableBuild<BuildResult>
  ) {}

  public dispose() {
    this.debugSession && debug.stopDebugging(this.debugSession);
    this.disposableBuild?.dispose();
    this.device?.dispose();
  }

  get isActive() {
    return this.devtools.hasConnectedClient;
  }

  async start(
    deviceSettings: DeviceSettings,
    previewReadyCallback: PreviewReadyCallback,
    progressCallback: ProgressCallback
  ) {
    const shouldWaitForAppLaunch = getLaunchConfiguration().preview?.waitForAppLaunch !== false;
    const waitForAppReady = shouldWaitForAppLaunch
      ? new Promise<void>((res) => {
          const listener = (event: string, payload: any) => {
            if (event === "RNIDE_appReady") {
              this.devtools?.removeListener(listener);
              res();
            }
          };
          this.devtools?.addListener(listener);
        })
      : Promise.resolve();

    progressCallback(StartupMessage.BootingDevice);
    await this.device.bootDevice();
    await this.device.changeSettings(deviceSettings);
    progressCallback(StartupMessage.Building);
    const build = await this.disposableBuild.build;
    progressCallback(StartupMessage.Installing);
    await this.device.installApp(build, false);
    progressCallback(StartupMessage.Launching);
    await this.device.launchApp(build, this.metro.port, this.devtools.port);

    const waitForPreview = this.device.startPreview().then(() => {
      previewReadyCallback(this.device.previewURL!);
    });
    Logger.debug("Will wait for app ready and for preview");
    progressCallback(StartupMessage.WaitingForAppToLoad);
    await Promise.all([waitForAppReady, waitForPreview]);
    Logger.debug("App and preview ready, moving on...");

    progressCallback(StartupMessage.AttachingDebugger);
    await this.startDebugger();
  }

  public async startDebugger() {
    const websocketAddress = await this.metro.getDebuggerURL(WAIT_FOR_DEBUGGER_TIMEOUT);
    if (websocketAddress) {
      const debugStarted = await debug.startDebugging(
        undefined,
        {
          type: "com.swmansion.react-native-ide",
          name: "React Native IDE Debugger",
          request: "attach",
          websocketAddress,
        },
        {
          suppressDebugStatusbar: true,
          suppressDebugView: true,
          suppressDebugToolbar: true,
          suppressSaveBeforeStart: true,
        }
      );
      if (debugStarted) {
        this.debugSession = debug.activeDebugSession;
        Logger.debug("Conencted to debbuger, moving on...");
      }
    } else {
      Logger.error("Couldn't connect to debugger");
    }
  }

  public get previewURL(): string | undefined {
    return this.device.previewURL;
  }

  public resumeDebugger() {
    this.debugSession?.customRequest("continue");
  }

  public stepOverDebugger() {
    this.debugSession?.customRequest("next");
  }

  public sendTouch(xRatio: number, yRatio: number, type: "Up" | "Move" | "Down") {
    this.device.sendTouch(xRatio, yRatio, type);
  }

  public sendKey(keyCode: number, direction: "Up" | "Down") {
    this.device.sendKey(keyCode, direction);
  }

  public sendPaste(text: string) {
    this.device.sendPaste(text);
  }

  public inspectElementAt(
    xRatio: number,
    yRatio: number,
    requestStack: boolean,
    callback: (inspectData: any) => void
  ) {
    const id = this.inspectCallID++;
    const listener = (event: string, payload: any) => {
      if (event === "RNIDE_inspectData" && payload.id === id) {
        this.devtools?.removeListener(listener);
        callback(payload);
      }
    };
    this.devtools?.addListener(listener);
    this.devtools.send("RNIDE_inspect", { x: xRatio, y: yRatio, id, requestStack });
  }

  public openNavigation(id: string) {
    this.devtools.send("RNIDE_openNavigation", { id });
  }

  public async openDevMenu() {
    // on iOS, we can load native module and dispatch dev menu show method. On
    // Android, this native module isn't available and we need to fallback to
    // adb to send "menu key" (code 82) to trigger code path showing the menu.
    //
    // We could probably unify it in the future by running metro in interactive
    // mode and sending keys to stdin.
    if (this.device.platform === Platform.IOS) {
      this.devtools.send("RNIDE_iosDevMenu");
    } else {
      await (this.device as AndroidEmulatorDevice).openDevMenu();
    }
  }

  public startPreview(previewId: string) {
    this.devtools.send("RNIDE_openPreview", { previewId });
  }

  public onActiveFileChange(filename: string, followEnabled: boolean) {
    this.devtools.send("RNIDE_editorFileChanged", { filename, followEnabled });
  }

  public async changeDeviceSettings(settings: DeviceSettings) {
    await this.device.changeSettings(settings);
  }

  public async sendBiometricAuthorization(match: boolean) {
    await this.device.sendBiometricAuthorization(match);
  }
}
