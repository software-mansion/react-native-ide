import fs from "fs";
import path from "path";
import { EventEmitter } from "stream";
import { Disposable } from "vscode";
import semver, { SemVer } from "semver";
import zipObject from "lodash/zipObject";
import { Logger } from "../Logger";
import { EMULATOR_BINARY } from "../devices/AndroidEmulatorDevice";
import { command } from "../utilities/subprocess";
import { extensionContext, getAppRootFolder } from "../utilities/extensionContext";
import { getIosSourceDir } from "../builders/buildIOS";
import { isExpoGoProject } from "../builders/expoGo";
import {
  isNodeModulesInstalled,
  PackageManagerInfo,
  resolvePackageManager,
} from "../utilities/packageManager";
import { getLaunchConfiguration } from "../utilities/launchConfiguration";
import {
  DependenciesStatus,
  Dependency,
  DependencyListener,
  DependencyManagerInterface,
  DependencyStatus,
  InstallationStatus,
  MinSupportedVersion,
} from "../common/DependencyManager";
import { shouldUseExpoCLI } from "../utilities/expoCli";
import { CancelToken } from "../builders/cancelToken";
import { getAndroidSourceDir } from "../builders/buildAndroid";

const STALE_PODS = "stalePods";

export class DependencyManager implements Disposable, DependencyManagerInterface {
  // React Native prepares build scripts based on node_modules, we need to reinstall pods if they change
  private stalePods = extensionContext.workspaceState.get<boolean>(STALE_PODS) ?? false;
  private eventEmitter = new EventEmitter();
  private packageManagerInternal: PackageManagerInfo | undefined;

  public dispose() {
    this.eventEmitter.removeAllListeners();
  }

  public async addListener(listener: DependencyListener) {
    this.eventEmitter.addListener("updatedDependencyInstallationStatus", listener);
  }

  public async removeListener(listener: DependencyListener) {
    this.eventEmitter.removeListener("updatedDependencyInstallationStatus", listener);
  }

  private emitEvent(dependency: Dependency, status: InstallationStatus) {
    this.eventEmitter.emit("updatedDependencyInstallationStatus", dependency, status);
  }

  public async getStatus(dependencies: Dependency[]): Promise<DependenciesStatus> {
    const statuses = await Promise.all(
      dependencies.map(async (dependency): Promise<DependencyStatus> => {
        switch (dependency) {
          case "androidEmulator":
            return { status: await this.androidEmulatorStatus(), isOptional: false };
          case "xcode":
            return { status: await this.xcodeStatus(), isOptional: false };
          case "cocoaPods":
            return { status: await this.cocoapodsStatus(), isOptional: false };
          case "nodejs":
            return { status: await this.nodeStatus(), isOptional: false };
          case "nodeModules":
            return { status: await this.nodeModulesStatus(), isOptional: false };
          case "pods":
            return { status: await this.podsStatus(), isOptional: await isExpoGoProject() };
          case "reactNative": {
            const status = dependencyStatus("react-native", MinSupportedVersion.reactNative);
            return { status, isOptional: false };
          }
          case "android": {
            const status = this.androidDirectoryExits() ? "installed" : "notInstalled";
            return { status, isOptional: await areNativeDirectoriesOptional() };
          }
          case "ios": {
            const status = this.iosDirectoryExits() ? "installed" : "notInstalled";
            return { status, isOptional: await areNativeDirectoriesOptional() };
          }
          case "expo": {
            const status = dependencyStatus("expo", MinSupportedVersion.expo);
            return { status, isOptional: !shouldUseExpoCLI() };
          }
          case "expoRouter": {
            const status = dependencyStatus("expo-router");
            return { status, isOptional: !isUsingExpoRouter() };
          }
          case "storybook": {
            const packageName = "@storybook/react-native";
            const status = dependencyStatus(packageName, MinSupportedVersion.storybook);
            return { status, isOptional: true };
          }
        }
      })
    );

    const diagnostics = zipObject(dependencies, statuses) as DependenciesStatus;
    const dependenciesInstallStatus = zipObject(
      dependencies,
      statuses.map(({ status }) => status)
    );
    Logger.debug(`Dependencies status:\n${JSON.stringify(dependenciesInstallStatus, null, 2)}`);
    return diagnostics;
  }

  androidDirectoryExits() {
    const appRootFolder = getAppRootFolder();
    const androidDirPath = getAndroidSourceDir(appRootFolder);
    if (fs.existsSync(androidDirPath)) {
      return true;
    }
    return false;
  }

  iosDirectoryExits() {
    const appRootFolder = getAppRootFolder();
    const iosDirPath = getIosSourceDir(appRootFolder);
    if (fs.existsSync(iosDirPath)) {
      return true;
    }
    return false;
  }

  public async isInstalled(dependency: Dependency) {
    const status = await this.getStatus([dependency]);
    return status[dependency].status === "installed";
  }

  public async installNodeModules(): Promise<boolean> {
    const manager = await this.getPackageManager();
    if (!manager) {
      return false;
    }

    await this.setStalePodsAsync(true);

    this.emitEvent("nodeModules", "installing");

    // all managers support the `install` command
    await command(`${manager.name} install`, {
      cwd: getAppRootFolder(),
      quietErrorsOnExit: true,
    });

    this.emitEvent("nodeModules", "installed");

    return true;
  }

  public async installPods(cancelToken: CancelToken) {
    const appRootFolder = getAppRootFolder();
    const iosDirPath = getIosSourceDir(appRootFolder);

    if (!iosDirPath) {
      this.emitEvent("pods", "notInstalled");
      throw new Error("ios directory was not found inside the workspace.");
    }

    const commandInIosDir = (args: string) => {
      const env = getLaunchConfiguration().env;
      return command(args, {
        cwd: iosDirPath,
        env: { ...env, LANG: "en_US.UTF-8" },
      });
    };

    try {
      await cancelToken.adapt(commandInIosDir("pod install"));
    } catch (e) {
      Logger.error("Pods not installed", e);
      this.emitEvent("pods", "notInstalled");
      return;
    }

    await this.setStalePodsAsync(false);

    this.emitEvent("pods", "installed");
    Logger.debug("Project pods installed");
  }

  private async setStalePodsAsync(stale: boolean) {
    this.stalePods = stale;
    await extensionContext.workspaceState.update(STALE_PODS, stale);
  }

  private async getPackageManager() {
    if (!this.packageManagerInternal) {
      this.packageManagerInternal = await resolvePackageManager();
    }
    return this.packageManagerInternal;
  }

  private async androidEmulatorStatus() {
    if (fs.existsSync(EMULATOR_BINARY)) {
      return "installed";
    }
    return "notInstalled";
  }

  private async xcodeStatus() {
    const isXcodebuildInstalled = await testCommand("xcodebuild -version");
    const isXcrunInstalled = await testCommand("xcrun --version");
    const isSimctlInstalled = await testCommand("xcrun simctl help");

    if (isXcodebuildInstalled && isXcrunInstalled && isSimctlInstalled) {
      return "installed";
    }
    return "notInstalled";
  }

  private async cocoapodsStatus() {
    const installed = await testCommand("pod --version");

    if (installed) {
      return "installed";
    }
    return "notInstalled";
  }

  private async nodeStatus() {
    const installed = await testCommand("node -v");
    if (installed) {
      return "installed";
    }
    return "notInstalled";
  }

  private async nodeModulesStatus() {
    const packageManager = await resolvePackageManager();
    if (!packageManager) {
      return "notInstalled";
    }

    const installed = await isNodeModulesInstalled(packageManager);
    if (installed) {
      return "installed";
    }
    return "notInstalled";
  }

  private async podsStatus() {
    if (await isExpoGoProject()) {
      // Expo Go projects don't need pods
      return "installed";
    }

    if (this.stalePods) {
      return "notInstalled";
    }

    const appRootFolder = getAppRootFolder();
    const iosDirPath = getIosSourceDir(appRootFolder);

    Logger.debug(`Check pods in ${iosDirPath}`);
    if (!iosDirPath) {
      return "notInstalled";
    }

    const podfileLockExists = fs.existsSync(path.join(iosDirPath, "Podfile.lock"));
    const podsDirExists = fs.existsSync(path.join(iosDirPath, "Pods"));

    if (!podfileLockExists || !podsDirExists) {
      return "notInstalled";
    }

    // finally, we perform check between Podfile.lock and Pods/Manifest.lock
    // this is what xcode does in Check Pods build phase and is used to determine
    // if pods are up to date

    // run diff command:
    const { failed } = await command("diff Podfile.lock Pods/Manifest.lock", {
      cwd: iosDirPath,
      reject: false,
      quietErrorsOnExit: true,
    });

    return failed ? "notInstalled" : "installed";
  }
}

async function testCommand(cmd: string) {
  try {
    // We are not checking the stderr here, because some of the CLIs put the warnings there.
    const { failed } = await command(cmd, {
      encoding: "utf8",
      quietErrorsOnExit: true,
      env: { ...process.env, LANG: "en_US.UTF-8" },
    });
    return !failed;
  } catch (_) {
    return false;
  }
}

function requireNoCache(...params: Parameters<typeof require.resolve>) {
  const module = require.resolve(...params);
  delete require.cache[module];
  return require(module);
}

function dependencyStatus(dependency: string, minVersion?: string | semver.SemVer) {
  try {
    const module = requireNoCache(path.join(dependency, "package.json"), {
      paths: [getAppRootFolder()],
    });

    if (!minVersion) {
      return "installed";
    }

    const version = semver.coerce(module.version);
    minVersion = new SemVer(minVersion);

    const isSupported = version ? semver.gte(version, minVersion) : false;
    // if not supported, we treat it as not installed
    if (isSupported) {
      return "installed";
    }
  } catch (_error) {
    // ignore if not installed
  }
  return "notInstalled";
}

export async function checkXcodeExists() {
  const isXcodebuildInstalled = await testCommand("xcodebuild -version");
  const isXcrunInstalled = await testCommand("xcrun --version");
  const isSimctlInstalled = await testCommand("xcrun simctl help");
  return isXcodebuildInstalled && isXcrunInstalled && isSimctlInstalled;
}

function isUsingExpoRouter() {
  // we assume that a expo router based project contain
  // the package "expo-router" in its dependencies or devDependencies
  const appRoot = getAppRootFolder();
  try {
    const packageJson = requireNoCache(path.join(appRoot, "package.json"));
    const allDependencies = [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.devDependencies),
    ];
    return allDependencies.includes("expo-router");
  } catch (e) {
    return false;
  }
}
async function areNativeDirectoriesOptional(): Promise<boolean> {
  const isExpoGo = await isExpoGoProject();
  const launchConfiguration = getLaunchConfiguration();

  return isExpoGo || !!launchConfiguration.eas || !!launchConfiguration.customBuild;
}
