import vscode, { Webview, Disposable, window, commands } from "vscode";
import { DependencyChecker } from "../dependency/DependencyChecker";
import { DependencyInstaller } from "../dependency/DependencyInstaller";
import { DeviceManager } from "../devices/DeviceManager";
import { Project } from "../project/project";
import { Logger } from "../Logger";
import { extensionContext } from "../utilities/extensionContext";
import { WorkspaceConfigController } from "./WorkspaceConfigController";
import { getTelemetryReporter } from "../utilities/telemetry";
import { Notifier } from "../project/notifier";

type CallArgs = {
  callId: string;
  object: string;
  method: string;
  args: unknown[];
};
export type WebviewEvent =
  | {
      command: "openExternalUrl";
      url: string;
    }
  | { command: "startFollowing" }
  | { command: "stopFollowing" }
  | { command: "showDismissableError"; message: string }
  | ({
      command: "call";
    } & CallArgs);

export class WebviewController implements Disposable {
  private readonly dependencyChecker: DependencyChecker;
  private readonly dependencyInstaller: DependencyInstaller;
  private readonly deviceManager: DeviceManager;
  public readonly notifier: Notifier;
  public readonly project: Project;
  public readonly workspaceConfig: WorkspaceConfigController;
  private disposables: Disposable[] = [];
  private idToCallback: Map<string, WeakRef<any>> = new Map();
  private idToCallbackFinalizationRegistry = new FinalizationRegistry((callbackId: string) => {
    this.idToCallback.delete(callbackId);
    this.webview.postMessage({
      command: "cleanupCallback",
      callbackId,
    });
  });

  private followEnabled = false;

  private readonly callableObjects: Map<string, unknown>;

  constructor(private webview: Webview) {
    // Set an event listener to listen for messages passed from the webview context
    this.setWebviewMessageListener(webview);

    // Set the manager to listen and change the persisting storage for the extension.
    this.dependencyChecker = new DependencyChecker(webview);
    this.dependencyChecker.setWebviewMessageListener();

    this.dependencyInstaller = new DependencyInstaller(webview);
    this.dependencyInstaller.setWebviewMessageListener();

    this.setupEditorListeners();

    this.deviceManager = new DeviceManager();
    this.notifier = new Notifier();
    this.project = new Project(this.deviceManager, this.notifier);

    this.workspaceConfig = new WorkspaceConfigController();

    this.disposables.push(
      this.dependencyChecker,
      this.dependencyInstaller,
      this.deviceManager,
      this.project,
      this.workspaceConfig
    );

    this.callableObjects = new Map<string, unknown>([
      ["DeviceManager", this.deviceManager],
      ["DeviceManager", this.deviceManager],
      ["Project", this.project],
      ["WorkspaceConfig", this.workspaceConfig],
    ]);

    commands.executeCommand("setContext", "RNIDE.panelIsOpen", true);
    getTelemetryReporter().sendTelemetryEvent("panelOpened");
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
        const isTouchEvent = message.command === "call" && message.method === "dispatchTouch";
        if (!isTouchEvent) {
          Logger.log("Message from webview", message);
        }

        switch (message.command) {
          case "call":
            this.handleRemoteCall(message);
            return;
          case "openExternalUrl":
            openExternalUrl(message.url);
            return;
          case "stopFollowing":
            this.followEnabled = false;
            return;
          case "startFollowing":
            this.followEnabled = true;
            return;
          case "showDismissableError":
            showDismissableError(message.message);
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
        if (typeof arg === "object" && "__callbackId" in arg) {
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
              error,
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

  private setupEditorListeners() {
    extensionContext.subscriptions.push(
      window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.project.onActiveFileChange(editor.document.fileName, this.followEnabled);
        }
      })
    );
  }
}

// Open the url in the default user's browser.
function openExternalUrl(url: string) {
  vscode.env.openExternal(vscode.Uri.parse(url));
}

function showDismissableError(message: string) {
  window.showErrorMessage(message, "Dismiss");
}
