import { Webview, Disposable, commands, Uri } from "vscode";
import { DependencyManager } from "../dependency/DependencyManager";
import { DeviceManager } from "../devices/DeviceManager";
import { Project } from "../project/project";
import { Logger } from "../Logger";
import { WorkspaceConfigController } from "./WorkspaceConfigController";
import { getTelemetryReporter } from "../utilities/telemetry";
import { Utils } from "../utilities/utils";
import { LaunchConfigController } from "./LaunchConfigController";

type CallArgs = {
  callId: string;
  object: string;
  method: string;
  args: unknown[];
};
export type WebviewEvent =
  | {
      command: "call";
    } & CallArgs;

export class WebviewController implements Disposable {
  private readonly dependencyManager: DependencyManager;
  private readonly deviceManager: DeviceManager;
  public readonly project: Project;
  public readonly workspaceConfig: WorkspaceConfigController;
  public readonly launchConfig: LaunchConfigController;
  public readonly utils: Utils;
  private disposables: Disposable[] = [];
  private idToCallback: Map<string, WeakRef<any>> = new Map();
  private idToCallbackFinalizationRegistry = new FinalizationRegistry((callbackId: string) => {
    this.idToCallback.delete(callbackId);
    this.webview.postMessage({
      command: "cleanupCallback",
      callbackId,
    });
  });

  private readonly callableObjects: Map<string, object>;

  constructor(private webview: Webview) {
    // Set an event listener to listen for messages passed from the webview context
    this.setWebviewMessageListener(webview);

    this.dependencyManager = new DependencyManager();

    this.deviceManager = new DeviceManager();
    this.project = new Project(this.deviceManager, this.dependencyManager);

    this.workspaceConfig = new WorkspaceConfigController();
    this.launchConfig = new LaunchConfigController();

    this.utils = new Utils();

    this.disposables.push(
      this.dependencyManager,
      this.project,
      this.workspaceConfig,
      this.launchConfig
    );

    this.callableObjects = new Map([
      ["DeviceManager", this.deviceManager as object],
      ["DependencyManager", this.dependencyManager as object],
      ["Project", this.project as object],
      ["WorkspaceConfig", this.workspaceConfig as object],
      ["LaunchConfig", this.launchConfig as object],
      ["Utils", this.utils as object],
    ]);

    commands.executeCommand("setContext", "RNIDE.panelIsOpen", true);
    getTelemetryReporter().sendTelemetryEvent("panelOpened");
  }

  public asWebviewUri(uri: Uri) {
    return this.webview.asWebviewUri(uri);
  }

  public dispose() {
    commands.executeCommand("setContext", "RNIDE.panelIsOpen", false);

    // Dispose of all disposables (i.e. commands) for the current webview
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      (message: WebviewEvent) => {
        const isTouchEvent = message.command === "call" && message.method === "dispatchTouches";
        if (!isTouchEvent) {
          Logger.log("Message from webview", message);
        }

        switch (message.command) {
          case "call":
            this.handleRemoteCall(message);
            return;
        }
      },
      undefined,
      this.disposables
    );
  }

  private handleRemoteCall(message: CallArgs) {
    const { object, method, args, callId } = message;
    const callableObject = this.callableObjects.get(object);
    if (callableObject && method in callableObject) {
      const argsWithCallbacks = args.map((arg: any) => {
        if (typeof arg === "object" && arg !== null && "__callbackId" in arg) {
          const callbackId = arg.__callbackId;
          let callback = this.idToCallback.get(callbackId)?.deref();
          if (!callback) {
            callback = (...options: any[]) => {
              this.webview.postMessage({
                command: "callback",
                callbackId,
                args: options,
              });
            };
            this.idToCallback.set(callbackId, new WeakRef(callback));
            if (this.idToCallback.size > 200) {
              Logger.warn("Too many callbacks in memory! Something is wrong!");
            }
            this.idToCallbackFinalizationRegistry.register(callback, callbackId);
          }
          return callback;
        } else {
          return arg;
        }
      });
      // @ts-ignore
      const result = callableObject[method](...argsWithCallbacks);
      if (result instanceof Promise) {
        result
          .then((res) => {
            this.webview.postMessage({
              command: "callResult",
              callId,
              result: res,
            });
          })
          .catch((error) => {
            this.webview.postMessage({
              command: "callResult",
              callId,
              error: { name: error.name, message: error.message },
            });
          });
      } else {
        this.webview.postMessage({
          command: "callResult",
          callId,
          result,
        });
      }
    }
  }
}
