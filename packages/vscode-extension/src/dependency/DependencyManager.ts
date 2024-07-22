import { Webview, Disposable } from "vscode";
import { coerce, gte } from "semver";
import { Logger } from "../Logger";
import fs from "fs";
import { EMULATOR_BINARY } from "../devices/AndroidEmulatorDevice";
import { command } from "../utilities/subprocess";
import { getAppRootFolder } from "../utilities/extensionContext";
import path from "path";
import { getIosSourceDir } from "../builders/buildIOS";
import { isExpoGoProject } from "../builders/expoGo";
import {
  isNodeModulesInstalled,
  isPackageManagerAvailable,
  PackageManagerName,
  resolvePackageManager,
} from "../utilities/packageManager";
import { getLaunchConfiguration } from "../utilities/launchConfiguration";
import { CancelToken } from "../builders/BuildManager";

const MIN_REACT_NATIVE_VERSION_SUPPORTED = "0.71.0";
const MIN_EXPO_SDK_VERSION_SUPPORTED = "49.0.0";

export class DependencyManager implements Disposable {
  private disposables: Disposable[] = [];
  // React Native prepares build scripts based on node_modules, we need to reinstall pods if they change
  private stalePods = true;

  constructor(private readonly webview: Webview) {
    this.setWebviewMessageListener();
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

  private setWebviewMessageListener() {
    Logger.debug("Setup dependency checker listeners.");
    this.webview.onDidReceiveMessage(
      (message: any) => {
        const webviewCommand = message.command;
        switch (webviewCommand) {
          case "checkNodejsInstalled":
            Logger.debug("Received checkNodejsInstalled command.");
            this.checkNodejsInstalled();
            return;
          case "checkAndroidEmulatorInstalled":
            Logger.debug("Received checkAndroidEmulatorInstalled command.");
            this.checkAndroidEmulatorInstalled();
            return;
          case "checkXcodeInstalled":
            Logger.debug("Received checkXcodeInstalled command.");
            this.checkXcodeInstalled();
            return;
          case "checkCocoaPodsInstalled":
            Logger.debug("Received checkCocoaPodsInstalled command.");
            this.checkCocoaPodsInstalled();
            return;
          case "checkReactNativeInstalled":
            Logger.debug("Received checkReactNativeInstalled command.");
            this.checkReactNativeInstalled();
            return;
          case "checkExpoInstalled":
            Logger.debug("Received checkExpoInstalled command.");
            this.checkExpoInstalled();
            return;
          case "checkPodsInstalled":
            Logger.debug("Received checkPodsInstalled command.");
            this.checkPodsInstalled();
            return;
          case "checkNodeModulesInstalled":
            Logger.debug("Received checkNodeModulesInstalled command.");
            this.checkNodeModulesInstalled();
            return;
        }
      },
      undefined,
      this.disposables
    );
  }

  /* Node-related */
  public async checkNodejsInstalled() {
    const installed = await checkIfCLIInstalled("node -v");
    const errorMessage =
      "Node.js was not found. Make sure to [install Node.js](https://nodejs.org/en).";
    this.webview.postMessage({
      command: "isNodejsInstalled",
      data: {
        installed,
        info: "Used for running scripts and getting dependencies.",
        error: installed ? undefined : errorMessage,
      },
    });
    Logger.debug("Nodejs installed:", installed);
    return installed;
  }

  public async checkNodeModulesInstalled() {
    const packageManager = await resolvePackageManager();

    if (!isPackageManagerAvailable(packageManager)) {
      Logger.error(`Required package manager: ${packageManager} is not installed`);
      throw new Error(`${packageManager} is not installed`);
    }

    const installed = await isNodeModulesInstalled(packageManager);

    this.webview.postMessage({
      command: "isNodeModulesInstalled",
      data: {
        installed,
        info: "Whether node modules are installed",
        error: undefined,
      },
    });
    Logger.debug("Node Modules installed:", installed);
    return { installed, packageManager };
  }

  public async installNodeModules(manager: PackageManagerName): Promise<void> {
    this.stalePods = true;

    this.webview.postMessage({
      command: "installingNodeModules",
    });

    const workspacePath = getAppRootFolder();
    let installationCommand;

    switch (manager) {
      case "npm":
        installationCommand = "npm install";
        break;
      case "yarn":
        installationCommand = "yarn install";
        break;
      case "pnpm":
        installationCommand = "pnpm install";
        break;
      case "bun":
        installationCommand = "bun install";
        break;
    }

    await command(installationCommand, {
      cwd: workspacePath,
      quiet: true,
    });

    this.webview.postMessage({
      command: "isNodeModulesInstalled",
      data: {
        installed: true,
        info: "Whether node modules are installed",
        error: undefined,
      },
    });
  }

  /* Android-related */
  public async checkAndroidEmulatorInstalled() {
    const installed = await checkAndroidEmulatorExists();
    const errorMessage =
      "Android Emulator was not found. Make sure to [install Android Emulator](https://developer.android.com/studio/run/managing-avds).";
    this.webview.postMessage({
      command: "isAndroidEmulatorInstalled",
      data: {
        installed,
        info: "Used for running Android apps.",
        error: installed ? undefined : errorMessage,
      },
    });
    Logger.debug("Android Emulator installed:", installed);
    return installed;
  }

  /* iOS-related */
  public async checkXcodeInstalled() {
    const isXcodebuildInstalled = await checkIfCLIInstalled("xcodebuild -version");
    const isXcrunInstalled = await checkIfCLIInstalled("xcrun --version");
    const isSimctlInstalled = await checkIfCLIInstalled("xcrun simctl help");
    const installed = isXcodebuildInstalled && isXcrunInstalled && isSimctlInstalled;
    const errorMessage =
      "Xcode was not found. [Install Xcode from the Mac App Store](https://apps.apple.com/us/app/xcode/id497799835?mt=12) and have Xcode Command Line Tools enabled.";
    this.webview.postMessage({
      command: "isXcodeInstalled",
      data: {
        installed,
        info: "Used for building and running iOS apps.",
        error: installed ? undefined : errorMessage,
      },
    });
    Logger.debug("Xcode Command Line Tools installed:", installed);
    return installed;
  }

  public async checkCocoaPodsInstalled() {
    const installed = await checkIfCLIInstalled("pod --version", {
      env: { LANG: "en_US.UTF-8" },
    });
    const errorMessage =
      "CocoaPods was not found. Make sure to [install CocoaPods](https://guides.cocoapods.org/using/getting-started.html).";
    this.webview.postMessage({
      command: "isCocoaPodsInstalled",
      data: {
        installed,
        info: "Used for installing iOS dependencies.",
        error: installed ? undefined : errorMessage,
      },
    });
    Logger.debug("CocoaPods installed:", installed);
    return installed;
  }

  public async checkReactNativeInstalled() {
    const status = checkMinDependencyVersionInstalled(
      "react-native",
      MIN_REACT_NATIVE_VERSION_SUPPORTED
    );

    const error = {
      installed: undefined,
      not_installed: "React Native is not installed.",
      not_supported: `Installed version of React Native does not match the minimum requirement: ${MIN_REACT_NATIVE_VERSION_SUPPORTED}.`,
    }[status];

    const installed = status === "installed";

    this.webview.postMessage({
      command: "isReactNativeInstalled",
      data: {
        installed,
        info: "Whether supported version of React Native is installed.",
        error,
      },
    });
    Logger.debug(`Minimum React Native version installed:`, installed);
    return installed;
  }

  public async checkExpoInstalled() {
    const status = checkMinDependencyVersionInstalled("expo", MIN_EXPO_SDK_VERSION_SUPPORTED);

    const error = {
      installed: undefined,
      not_installed: "Expo is not installed.",
      not_supported: `Installed version of Expo does not match the minimum requirement: ${MIN_EXPO_SDK_VERSION_SUPPORTED}.`,
    }[status];

    const installed = status === "installed";

    this.webview.postMessage({
      command: "isExpoInstalled",
      data: {
        installed,
        info: "Whether supported version of Expo SDK is installed.",
        error,
      },
    });
    Logger.debug(`Minimum Expo version installed:`, installed);
    return installed;
  }

  private async checkIosDependenciesInstalled() {
    if (await isExpoGoProject()) {
      // for Expo Go projects, we never return an error here because Pods are never needed
      return true;
    }

    if (this.stalePods) {
      return false;
    }

    const iosDirPath = getIosSourceDir(getAppRootFolder());

    Logger.debug(`Check pods in ${iosDirPath} ${getAppRootFolder()}`);
    if (!iosDirPath) {
      return false;
    }

    const podfileLockExists = fs.existsSync(path.join(iosDirPath, "Podfile.lock"));
    const podsDirExists = fs.existsSync(path.join(iosDirPath, "Pods"));

    return podfileLockExists && podsDirExists;
  }

  public async checkPodsInstalled() {
    const installed = await this.checkIosDependenciesInstalled();

    this.webview.postMessage({
      command: "isPodsInstalled",
      data: {
        installed,
        info: "Whether iOS dependencies are installed.",
        error: undefined,
      },
    });
    Logger.debug("Project pods installed:", installed);
    return installed;
  }

  public async installPods(
    appRootFolder: string,
    forceCleanBuild: boolean,
    cancelToken: CancelToken
  ) {
    const iosDirPath = getIosSourceDir(appRootFolder);

    if (!iosDirPath) {
      throw new Error(`ios directory was not found inside the workspace.`);
    }

    const commandInIosDir = (args: string) => {
      return command(args, {
        cwd: iosDirPath,
        env: {
          ...getLaunchConfiguration().env,
          LANG: "en_US.UTF-8",
        },
      });
    };

    if (forceCleanBuild) {
      await cancelToken.adapt(commandInIosDir("pod deintegrate"));
    }

    await cancelToken.adapt(commandInIosDir("pod install"));

    this.stalePods = false;

    this.webview.postMessage({
      command: "isPodsInstalled",
      data: {
        installed: true,
        info: "Whether iOS dependencies are installed.",
        error: undefined,
      },
    });
    Logger.debug("Project pods installed");
  }
}

export async function checkIfCLIInstalled(cmd: string, options: Record<string, unknown> = {}) {
  try {
    // We are not checking the stderr here, because some of the CLIs put the warnings there.
    const { stdout } = await command(cmd, { encoding: "utf8", ...options });
    return !!stdout.length;
  } catch (_) {
    return false;
  }
}

function requireNoCache(...params: Parameters<typeof require.resolve>) {
  const module = require.resolve(...params);
  delete require.cache[module];
  return require(module);
}

export function checkMinDependencyVersionInstalled(dependency: string, minVersion: string) {
  const message = `Check ${dependency} module version.`;

  try {
    const module = requireNoCache(path.join(dependency, "package.json"), {
      paths: [getAppRootFolder()],
    });
    const dependencyVersion = coerce(module.version);
    const minDependencyVersion = coerce(minVersion)!;

    Logger.debug(message, `Version found: ${dependencyVersion}. Minimum version: ${minVersion}`);

    const matches = dependencyVersion ? gte(dependencyVersion, minDependencyVersion) : false;
    return matches ? "installed" : "not_supported";
  } catch (error) {
    Logger.debug(message, "Module not found.");
    return "not_installed";
  }
}

export async function checkAndroidEmulatorExists() {
  return fs.existsSync(EMULATOR_BINARY);
}
