import {
  debug,
  DebugSessionCustomEvent,
  Disposable,
  DebugSession as VscDebugSession,
} from "vscode";
import { getAppRootFolder } from "../utilities/extensionContext";
import { Metro } from "../project/metro";

export type DebugSessionDelegate = {
  onConsoleLog(event: DebugSessionCustomEvent): void;
  onDebuggerPaused(event: DebugSessionCustomEvent): void;
  onDebuggerResumed(event: DebugSessionCustomEvent): void;
};

export class DebugSession implements Disposable {
  private vscSession: VscDebugSession | undefined;
  private debugEventsListener: Disposable;

  constructor(private metro: Metro, private delegate: DebugSessionDelegate) {
    this.debugEventsListener = debug.onDidReceiveDebugSessionCustomEvent((event) => {
      switch (event.event) {
        case "RNIDE_consoleLog":
          this.delegate.onConsoleLog(event);
          break;
        case "RNIDE_paused":
          this.delegate.onDebuggerPaused(event);
          break;
        case "RNIDE_continued":
          this.delegate.onDebuggerResumed(event);
          break;
        default:
          // ignore other events
          break;
      }
    });
  }

  public dispose() {
    this.session && debug.stopDebugging(this.session);
    this.debugEventsListener.dispose();
  }

  public async start() {
    const cdpTargetInfo = await this.metro.getCDPTargetInfo();
    if (!cdpTargetInfo) {
      return false;
    }

    const debugStarted = await debug.startDebugging(
      undefined,
      {
        type: "com.swmansion.react-native-ide",
        name: "React Native IDE Debugger",
        request: "attach",
        websocketAddress: cdpTargetInfo.reactNativeDebuggerWsURL,
        absoluteProjectPath: getAppRootFolder(),
        projectPathAlias: cdpTargetInfo.usesNewDebugger ? "/[metro-project]" : undefined,
      },
      {
        suppressDebugStatusbar: true,
        suppressDebugView: true,
        suppressDebugToolbar: true,
        suppressSaveBeforeStart: true,
      }
    );

    if (debugStarted) {
      this.vscSession = debug.activeDebugSession!;

      if (cdpTargetInfo.usesNewDebugger && cdpTargetInfo.reanimatedDebuggerWsURL) {
        const reanimatedDebuggerStarted = await debug.startDebugging(
          undefined,
          {
            type: "com.swmansion.react-native-ide",
            name: "React Native IDE Debugger (reanimated)",
            request: "attach",
            websocketAddress: cdpTargetInfo.reanimatedDebuggerWsURL,
            absoluteProjectPath: getAppRootFolder(),
            // projectPathAlias: cdpTargetInfo.usesNewDebugger ? "/[metro-project]" : undefined,
          },
          {
            parentSession: this.vscSession,
            suppressDebugStatusbar: true,
            suppressDebugView: true,
            suppressDebugToolbar: true,
            suppressSaveBeforeStart: true,
          }
        );
      }

      return true;
    }
    return false;
  }

  public resumeDebugger() {
    this.session.customRequest("continue");
  }

  public stepOverDebugger() {
    this.session.customRequest("next");
  }

  private get session() {
    if (!this.vscSession) {
      throw new Error("Debugger not started");
    }
    return this.vscSession;
  }
}
