import { Webview, Disposable } from "vscode";
import { Logger } from "../Logger";
import { DependencyChecker } from "./DependencyChecker";
import { command } from "../utilities/subprocess";
import { getIosSourceDir } from "../builders/buildIOS";
import { getAppRootFolder } from "../utilities/extensionContext";
import { getDefaultLaunchConfiguration } from "../utilities/launchConfiguration";

export class DependencyInstaller implements Disposable {
  private webview: Webview;
  private dependencyChecker: DependencyChecker;
  private disposables: Disposable[] = [];

  constructor(webview: Webview) {
    this.webview = webview;
    this.dependencyChecker = new DependencyChecker(webview);
  }

  public dispose() {
    // Dispose of all disposables (i.e. commands) for the current webview panel
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  public setWebviewMessageListener() {
    Logger.debug("Setup dependency installer listeners.");
    this.webview.onDidReceiveMessage(
      (message: any) => {
        const webviewCommand = message.command;

        switch (webviewCommand) {
          case "installPods":
            Logger.debug("Received installPods command.");
            this.installPods();
            return;
        }
      },
      undefined,
      this.disposables
    );
  }

  public async installPods() {
    Logger.debug("Installing pods");
    this.webview.postMessage({
      command: "installingPods",
    });
    try {
      await installIOSDependencies(getAppRootFolder(), false);
      Logger.debug("Finished installing pods!");
    } catch (error) {
      Logger.error("Install Pods:", error);
    }
    await this.dependencyChecker.checkPodsInstalled();
  }
}

export function installIOSDependencies(appRootFolder: string, forceCleanBuild: boolean) {
  const iosDirPath = getIosSourceDir(appRootFolder);

  if (!iosDirPath) {
    throw new Error(`ios directory was not found inside the workspace.`);
  }

  // TODO: support forceCleanBuild option and wipe pods prior to installing
  return command("pod install", {
    cwd: iosDirPath,
    env: {
      ...process.env,
      ...getDefaultLaunchConfiguration().env,
      LANG: "en_US.UTF-8",
    },
  });
}
