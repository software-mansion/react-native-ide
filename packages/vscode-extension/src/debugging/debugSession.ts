import {
  debug,
  DebugSessionCustomEvent,
  Disposable,
  DebugSession as VscDebugSession,
} from "vscode";
import { Logger } from "../Logger";

type DebuggerEvent = "RNIDE_consoleLog" | "RNIDE_paused" | "RNIDE_continued";
type DebuggerEventListener = (event: DebugSessionCustomEvent) => void;

function isKnownEvent(name: string): name is DebuggerEvent {
  return ["RNIDE_consoleLog", "RNIDE_paused", "RNIDE_continued"].includes(name);
}

export class DebuggingSession implements Disposable {
  private session: VscDebugSession | undefined;
  private listeners = new Map<DebuggerEvent, DebuggerEventListener>();
  private debugEventsListener: Disposable | undefined;

  constructor(private debuggerUrl: string) {}

  public dispose() {
    this.session && debug.stopDebugging(this.session);
    this.debugEventsListener?.dispose();
    this.listeners.clear();
  }

  public async start() {
    const debugStarted = await debug.startDebugging(
      undefined,
      {
        type: "com.swmansion.react-native-ide",
        name: "React Native IDE Debugger",
        request: "attach",
        debuggerUrl: this.debuggerUrl,
      },
      {
        suppressDebugStatusbar: true,
        suppressDebugView: true,
        suppressDebugToolbar: true,
        suppressSaveBeforeStart: true,
      }
    );
    if (debugStarted) {
      this.session = debug.activeDebugSession!;
      Logger.debug("Connected to debugger, moving on...");
      return true;
    }
    return false;
  }

  /**
   * Allows only one listener to be registered for each kind of event.
   */
  public listenToEvent(name: DebuggerEvent, listener: (event: DebugSessionCustomEvent) => void) {
    this.listeners.set(name, listener);

    if (!this.debugEventsListener) {
      this.debugEventsListener = debug.onDidReceiveDebugSessionCustomEvent((event) => {
        if (isKnownEvent(event.event)) {
          const registeredListener = this.listeners.get(event.event)!;
          registeredListener(event);
        }
      });
    }
  }

  public resumeDebugger() {
    this.session?.customRequest("continue");
  }

  public stepOverDebugger() {
    this.session?.customRequest("next");
  }
}
