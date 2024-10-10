import path from "path";
import fs from "fs";
import { ExecaError } from "execa";
import { getAppCachesDir, getOldAppCachesDir } from "../utilities/common";
import { DeviceBase } from "./DeviceBase";
import { Preview } from "./preview";
import { Logger } from "../Logger";
import { exec } from "../utilities/subprocess";
import { getAvailableIosRuntimes } from "../utilities/iosRuntimes";
import { IOSDeviceInfo, IOSRuntimeInfo, DevicePlatform, DeviceInfo } from "../common/DeviceManager";
import { BuildResult } from "../builders/BuildManager";
import { AppPermissionType, DeviceSettings, Locale } from "../common/Project";
import { EXPO_GO_BUNDLE_ID, fetchExpoLaunchDeeplink } from "../builders/expoGo";
import { IOSBuildResult } from "../builders/buildIOS";

interface SimulatorInfo {
  availability?: string;
  state?: string;
  isAvailable?: boolean;
  name: string;
  udid: string;
  version?: string;
  availabilityError?: string;
  type?: "simulator" | "device" | "catalyst";
  booted?: boolean;
  lastBootedAt?: string;
  deviceTypeIdentifier: string;
  dataPath?: string;
}

interface SimulatorData {
  devices: { [runtimeID: string]: SimulatorInfo[] };
}

type PrivacyServiceName =
  | "all"
  | "calendar"
  | "contacts-limited"
  | "contacts"
  | "location"
  | "location-always"
  | "photos-add"
  | "photos"
  | "media-library"
  | "microphone"
  | "motion"
  | "reminders"
  | "siri";

export class IosSimulatorDevice extends DeviceBase {
  constructor(private readonly deviceUDID: string, private readonly _deviceInfo: DeviceInfo) {
    super();
  }

  public get platform(): DevicePlatform {
    return DevicePlatform.IOS;
  }

  public get deviceInfo() {
    return this._deviceInfo;
  }

  get lockFilePath(): string {
    const deviceSetLocation = getDeviceSetLocation(this.deviceUDID);
    const pidFile = path.join(deviceSetLocation, this.deviceUDID, "lock.pid");
    return pidFile;
  }

  public dispose() {
    super.dispose();
    return exec("xcrun", [
      "simctl",
      "--set",
      getOrCreateDeviceSet(this.deviceUDID),
      "shutdown",
      this.deviceUDID,
    ]);
  }

  async bootDevice(settings: DeviceSettings) {
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);

    if (await this.shouldUpdateLocale(settings.locale)) {
      await this.changeLocale(settings.locale);
    }

    try {
      await exec("xcrun", ["simctl", "--set", deviceSetLocation, "boot", this.deviceUDID], {
        allowNonZeroExit: true,
      });
    } catch (e) {
      const isAlreadyBooted = (e as ExecaError).stderr?.includes("current state: Booted");
      if (isAlreadyBooted) {
        Logger.debug("Device already booted");
      } else {
        throw e;
      }
    }

    await this.changeSettings(settings);
  }

  private async shouldUpdateLocale(locale: Locale): Promise<boolean> {
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);
    const deviceLocale = await exec("/usr/libexec/PlistBuddy", [
      "-c",
      `print :AppleLocale`,
      path.join(
        deviceSetLocation,
        this.deviceUDID,
        "data",
        "Library",
        "Preferences",
        ".GlobalPreferences.plist"
      ),
    ]);
    if (deviceLocale.stdout === locale) {
      return false;
    }
    return true;
  }

  async changeSettings(settings: DeviceSettings): Promise<boolean> {
    let shouldRestart = false;
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);

    if (await this.shouldUpdateLocale(settings.locale)) {
      shouldRestart = true;
      this.changeLocale(settings.locale);
    }

    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "ui",
      this.deviceUDID,
      "appearance",
      settings.appearance,
    ]);
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "ui",
      this.deviceUDID,
      "content_size",
      convertToSimctlSize(settings.contentSize),
    ]);
    if (settings.location.isDisabled) {
      await exec("xcrun", [
        "simctl",
        "--set",
        deviceSetLocation,
        "location",
        this.deviceUDID,
        "clear",
      ]);
    } else {
      await exec("xcrun", [
        "simctl",
        "--set",
        deviceSetLocation,
        "location",
        this.deviceUDID,
        "set",
        `${settings.location.latitude.toString()},${settings.location.longitude.toString()}`,
      ]);
    }
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "spawn",
      this.deviceUDID,
      "notifyutil",
      "-s",
      "com.apple.BiometricKit.enrollmentChanged",
      settings.hasEnrolledBiometrics ? "1" : "0",
    ]);
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "spawn",
      this.deviceUDID,
      "notifyutil",
      "-p",
      "com.apple.BiometricKit.enrollmentChanged",
    ]);

    return shouldRestart;
  }

  async sendBiometricAuthorization(isMatch: boolean) {
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "spawn",
      this.deviceUDID,
      "notifyutil",
      "-p",
      isMatch
        ? "com.apple.BiometricKit_Sim.fingerTouch.match"
        : "com.apple.BiometricKit_Sim.fingerTouch.nomatch",
    ]);
  }

  private async changeLocale(newLocale: Locale): Promise<boolean> {
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);
    const languageCode = newLocale.match(/([^_-]*)/)![1];
    await exec("/usr/libexec/PlistBuddy", [
      "-c",
      `set :AppleLanguages:0 ${languageCode}`,
      "-c",
      `set :AppleLocale ${newLocale}`,
      path.join(
        deviceSetLocation,
        this.deviceUDID,
        "data",
        "Library",
        "Preferences",
        ".GlobalPreferences.plist"
      ),
    ]);
    return true;
  }

  async configureMetroPort(bundleID: string, metroPort: number) {
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);
    const { stdout: appDataLocation } = await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "get_app_container",
      this.deviceUDID,
      bundleID,
      "data",
    ]);
    const userDefaultsLocation = path.join(
      appDataLocation,
      "Library",
      "Preferences",
      `${bundleID}.plist`
    );
    Logger.debug(`Defaults location ${userDefaultsLocation}`);
    try {
      await exec(
        "/usr/libexec/PlistBuddy",
        [
          "-c",
          "Delete :RCT_jsLocation",
          "-c",
          `Add :RCT_jsLocation string localhost:${metroPort}`,
          userDefaultsLocation,
        ],
        { allowNonZeroExit: true }
      );
    } catch (e) {
      // Delete command fails if the key doesn't exists, but later commands run regardless,
      // despite that process exits with non-zero code. We can ignore this error.
    }
  }

  async launchWithBuild(build: IOSBuildResult) {
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "launch",
      "--terminate-running-process",
      this.deviceUDID,
      build.bundleID,
    ]);
  }

  async launchWithExpoDeeplink(bundleID: string, expoDeeplink: string) {
    // For Expo dev-client and Expo Go setup, we use deeplink to launch the app. For this approach to work we do the following:
    // 1. Add the deeplink to the scheme approval list
    // 2. Terminate the app if it's running
    // 3. Open the deeplink
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);

    // Add the deeplink to the scheme approval list:
    const schema = new URL(expoDeeplink).protocol.slice(0, -1);
    await exec("/usr/libexec/PlistBuddy", [
      "-c",
      "Clear dict",
      "-c",
      `Add :com.apple.CoreSimulator.CoreSimulatorBridge-->${schema} string ${bundleID}`,
      path.join(
        deviceSetLocation,
        this.deviceUDID,
        "data",
        "Library",
        "Preferences",
        "com.apple.launchservices.schemeapproval.plist"
      ),
    ]);

    // Terminate the app if it's running:
    try {
      await exec(
        "xcrun",
        ["simctl", "--set", deviceSetLocation, "terminate", this.deviceUDID, bundleID],
        { allowNonZeroExit: true }
      );
    } catch (e) {
      // terminate will exit with non-zero code when the app wasn't running. we ignore this error
    }

    // Use openurl to open the deeplink:
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "openurl",
      this.deviceUDID,
      expoDeeplink,
      // TODO: disableOnboarding param causes error while launching
      // + "&disableOnboarding=1", // disable onboarding dialog via deeplink query param
    ]);
  }

  async launchApp(build: IOSBuildResult, metroPort: number, devtoolsPort: number) {
    if (build.platform !== DevicePlatform.IOS) {
      throw new Error("Invalid platform");
    }
    const deepLinkChoice = build.bundleID === EXPO_GO_BUNDLE_ID ? "expo-go" : "expo-dev-client";
    const expoDeeplink = await fetchExpoLaunchDeeplink(metroPort, "ios", deepLinkChoice);
    if (expoDeeplink) {
      this.launchWithExpoDeeplink(build.bundleID, expoDeeplink);
    } else {
      await this.configureMetroPort(build.bundleID, metroPort);
      await this.launchWithBuild(build);
    }
  }

  async installApp(build: BuildResult, forceReinstall: boolean) {
    if (build.platform !== DevicePlatform.IOS) {
      throw new Error("Invalid platform");
    }
    const deviceSetLocation = getOrCreateDeviceSet(this.deviceUDID);
    if (forceReinstall) {
      try {
        await exec(
          "xcrun",
          ["simctl", "--set", deviceSetLocation, "uninstall", this.deviceUDID, build.bundleID],
          { allowNonZeroExit: true }
        );
      } catch (e) {
        Logger.error("Error while uninstalling will be ignored", e);
      }
    }
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "install",
      this.deviceUDID,
      build.appPath,
    ]);
  }

  async resetAppPermissions(appPermission: AppPermissionType, build: BuildResult) {
    if (build.platform !== DevicePlatform.IOS) {
      throw new Error("Invalid platform");
    }
    const privacyServiceName: PrivacyServiceName = appPermission;
    await exec("xcrun", [
      "simctl",
      "--set",
      getOrCreateDeviceSet(this.deviceUDID),
      "privacy",
      this.deviceUDID,
      "reset",
      privacyServiceName,
      build.bundleID,
    ]);
    return false;
  }

  makePreview(): Preview {
    return new Preview([
      "ios",
      "--id",
      this.deviceUDID,
      "--device-set",
      getOrCreateDeviceSet(this.deviceUDID),
    ]);
  }
}

export async function getNewestAvailableIosRuntime() {
  const runtimesData = await getAvailableIosRuntimes();

  // sort available runtimes by version
  runtimesData.sort((a, b) => (a.version.localeCompare(b.version) ? -1 : 1));

  // pick the newest runtime
  return runtimesData[0];
}

export async function removeIosRuntimes(runtimeIDs: string[]) {
  const removalPromises = runtimeIDs.map((runtimeID) => {
    return exec("xcrun", ["simctl", "runtime", "delete", runtimeID], {});
  });
  return Promise.all(removalPromises);
}

export async function renameIosSimulator(udid: string | undefined, newCustomName: string) {
  if (!udid) {
    return;
  }

  const deviceSetLocation = getOrCreateDeviceSet(udid);
  const configPath = path.join(deviceSetLocation, udid, "config.ini");

  try {
    const oldConfig = await fs.promises.readFile(configPath, "utf-8");

    const config = oldConfig
      .split("\n")
      .map((line) => {
        if (line.startsWith("customName=")) {
          return `customName=${newCustomName}`;
        }
        return line;
      })
      .join("\n");

    await fs.promises.writeFile(configPath, config, "utf-8");
  } catch (e) {
    throw new Error(`Failed to rename device`);
  }
}

export async function removeIosSimulator(udid: string | undefined, location: SimulatorDeviceSet) {
  if (!udid) {
    return;
  }

  let deviceSetArgs: string[] = [];
  if (location === SimulatorDeviceSet.RN_IDE) {
    const setDirectory = getOrCreateDeviceSet(udid);
    deviceSetArgs = ["--set", setDirectory];
  }

  return exec("xcrun", ["simctl", ...deviceSetArgs, "delete", udid]);
}

async function listSimulatorsForLocation(location?: string) {
  let deviceSetArgs: string[] = [];
  if (location) {
    deviceSetArgs = ["--set", location];
  }
  try {
    const { stdout } = await exec(
      "xcrun",
      ["simctl", ...deviceSetArgs, "list", "devices", "--json"],
      { allowNonZeroExit: true }
    );
    const parsedData: SimulatorData = JSON.parse(stdout);

    const { devices: devicesPerRuntime } = parsedData;

    return Object.entries(devicesPerRuntime);
  } catch (e) {
    // ignore errors because some locations might not exist
  }
  return [];
}

async function findCustomName(filePath?: string): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }

  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .find((line) => line.startsWith("customName="))
      ?.split("=")[1]
      ?.trim();
  } catch (e) {
    return undefined;
  }
}

export async function listSimulators(
  location: SimulatorDeviceSet = SimulatorDeviceSet.RN_IDE
): Promise<IOSDeviceInfo[]> {
  let devicesPerRuntime;
  if (location === SimulatorDeviceSet.RN_IDE) {
    const deviceSetLocation = getOrCreateDeviceSet();

    devicesPerRuntime = await listSimulatorsForLocation(deviceSetLocation);

    const oldDeviceSetLocation = getOldDeviceSetLocation();
    const oldDevicesPerRuntime = await listSimulatorsForLocation(oldDeviceSetLocation);

    devicesPerRuntime = devicesPerRuntime.concat(oldDevicesPerRuntime);
  } else {
    devicesPerRuntime = await listSimulatorsForLocation();
  }

  const runtimes = await getAvailableIosRuntimes();

  const simulators = await Promise.all(
    devicesPerRuntime.map(async ([runtimeID, devices]) => {
      const runtime = runtimes.find((item) => item.identifier === runtimeID);

      const deviceInfos = await Promise.all(
        devices.map(async (device) => {
          const deviceDirectory = device.dataPath?.split(path.sep).slice(0, -1).join(path.sep);
          const configFilePath = deviceDirectory ? path.join(deviceDirectory, "config.ini") : "";
          const customName = await findCustomName(configFilePath);

          return {
            id: `ios-${device.udid}`,
            platform: DevicePlatform.IOS as const,
            UDID: device.udid,
            name: device.name,
            systemName: runtime?.name ?? "Unknown",
            customName: customName,
            available: device.isAvailable ?? false,
            deviceIdentifier: device.deviceTypeIdentifier,
            runtimeInfo: runtime!,
          };
        })
      );
      return deviceInfos;
    })
  );
  return simulators.flat();
}

export enum SimulatorDeviceSet {
  Default,
  RN_IDE,
}

export async function createSimulator(
  deviceName: string,
  deviceIdentifier: string,
  runtime: IOSRuntimeInfo,
  deviceSet: SimulatorDeviceSet,
  customName?: string
) {
  Logger.debug(`Create simulator ${deviceIdentifier} with runtime ${runtime.identifier}`);

  let locationArgs: string[] = [];
  if (deviceSet === SimulatorDeviceSet.RN_IDE) {
    const deviceSetLocation = getOrCreateDeviceSet();
    locationArgs = ["--set", deviceSetLocation];
  }

  // create new simulator with selected runtime
  const { stdout: UDID } = await exec("xcrun", [
    "simctl",
    ...locationArgs,
    "create",
    deviceName,
    deviceIdentifier,
    runtime.identifier,
  ]);

  const configPath = path.join(locationArgs[1], UDID, "config.ini");
  const configData = [["customName", customName]];
  const configContent = configData.map(([key, value]) => `${key}=${value}`).join("\n");
  await fs.promises.writeFile(configPath, configContent, "utf-8");

  return {
    id: `ios-${UDID}`,
    platform: DevicePlatform.IOS,
    UDID,
    name: deviceName,
    systemName: runtime.name,
    customName: customName,
    available: true, // assuming if create command went through, it's available
    deviceIdentifier: deviceIdentifier,
    runtimeInfo: runtime,
  } as IOSDeviceInfo;
}

function getDeviceSetLocation(deviceUDID?: string) {
  const appCachesDir = getAppCachesDir();
  const deviceSetLocation = path.join(appCachesDir, "Devices", "iOS");
  if (!deviceUDID) {
    return deviceSetLocation;
  }
  const oldDeviceSetLocation = getOldDeviceSetLocation();
  if (!fs.existsSync(oldDeviceSetLocation)) {
    return deviceSetLocation;
  }
  const devices = fs.readdirSync(oldDeviceSetLocation);
  if (devices.includes(deviceUDID)) {
    return oldDeviceSetLocation;
  }
  return deviceSetLocation;
}

function getOldDeviceSetLocation() {
  const oldAppCachesDir = getOldAppCachesDir();
  return path.join(oldAppCachesDir, "Devices", "iOS");
}

function getOrCreateDeviceSet(deviceUDID?: string) {
  let deviceSetLocation = getDeviceSetLocation(deviceUDID);
  if (!fs.existsSync(deviceSetLocation)) {
    fs.mkdirSync(deviceSetLocation, { recursive: true });
  }

  return deviceSetLocation;
}

function convertToSimctlSize(size: DeviceSettings["contentSize"]): string {
  switch (size) {
    case "xsmall":
      return "extra-small";
    case "small":
      return "small";
    case "normal":
      return "medium";
    case "large":
      return "large";
    case "xlarge":
      return "extra-large";
    case "xxlarge":
      return "extra-extra-large";
    case "xxxlarge":
      return "extra-extra-extra-large";
  }
}
