import { getAppCachesDir } from "../utilities/common";
import { DeviceBase } from "./DeviceBase";
import { Preview } from "./preview";
import { Logger } from "../Logger";
import { exec } from "../utilities/subprocess";
import { getAvailableIosRuntimes } from "../utilities/iosRuntimes";
import {
  IOSDeviceInfo,
  IOSDeviceTypeInfo,
  IOSRuntimeInfo,
  Platform,
} from "../common/DeviceManager";
import { BuildResult, IOSBuildResult } from "../builders/BuildManager";
import path from "path";
import fs from "fs";
import { DeviceSettings } from "../common/Project";
import { EXPO_GO_BUNDLE_ID, fetchExpoLaunchDeeplink } from "../builders/expoGo";
import { ExecaError } from "execa";

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
}

interface SimulatorData {
  devices: { [runtimeID: string]: SimulatorInfo[] };
}

export class IosSimulatorDevice extends DeviceBase {
  constructor(private readonly deviceUDID: string) {
    super();
  }

  public get platform(): Platform {
    return Platform.IOS;
  }

  get lockFilePath(): string {
    const deviceSetLocation = getDeviceSetLocation();
    const pidFile = path.join(deviceSetLocation, this.deviceUDID, "lock.pid");
    return pidFile;
  }

  public dispose() {
    super.dispose();
    return exec("xcrun", ["simctl", "--set", getOrCreateDeviceSet(), "shutdown", this.deviceUDID]);
  }

  async bootDevice() {
    const deviceSetLocation = getOrCreateDeviceSet();
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
  }

  async changeSettings(settings: DeviceSettings) {
    const deviceSetLocation = getOrCreateDeviceSet();
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
      settings.biometricEnrollment ? "1" : "0",
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
  }
  async sendBiometricAuthorization(match: boolean) {
    const deviceSetLocation = getOrCreateDeviceSet();
    await exec("xcrun", [
      "simctl",
      "--set",
      deviceSetLocation,
      "spawn",
      this.deviceUDID,
      "notifyutil",
      "-p",
      match
        ? "com.apple.BiometricKit_Sim.fingerTouch.match"
        : "com.apple.BiometricKit_Sim.fingerTouch.nomatch",
    ]);
  }

  async configureMetroPort(bundleID: string, metroPort: number) {
    const deviceSetLocation = getOrCreateDeviceSet();
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
    const deviceSetLocation = getOrCreateDeviceSet();
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
    const deviceSetLocation = getOrCreateDeviceSet();

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
    if (build.platform !== Platform.IOS) {
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
    if (build.platform !== Platform.IOS) {
      throw new Error("Invalid platform");
    }
    const deviceSetLocation = getOrCreateDeviceSet();
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

  makePreview(): Preview {
    return new Preview(["ios", this.deviceUDID, getOrCreateDeviceSet()]);
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

export async function removeIosSimulator(udid: string | undefined, location: SimulatorDeviceSet) {
  if (!udid) {
    return;
  }

  let deviceSetArgs: string[] = [];
  if (location === SimulatorDeviceSet.RN_IDE) {
    const setDirectory = getOrCreateDeviceSet();
    deviceSetArgs = ["--set", setDirectory];
  }

  return exec("xcrun", ["simctl", ...deviceSetArgs, "delete", udid]);
}

export async function listSimulators(
  location: SimulatorDeviceSet = SimulatorDeviceSet.RN_IDE
): Promise<IOSDeviceInfo[]> {
  let deviceSetArgs: string[] = [];
  if (location === SimulatorDeviceSet.RN_IDE) {
    const deviceSetLocation = getOrCreateDeviceSet();
    deviceSetArgs = ["--set", deviceSetLocation];
  }
  const { stdout } = await exec("xcrun", ["simctl", ...deviceSetArgs, "list", "devices", "--json"]);
  const parsedData: SimulatorData = JSON.parse(stdout);

  const { devices: devicesPerRuntime } = parsedData;
  const runtimes = await getAvailableIosRuntimes();

  const simulators = Object.entries(devicesPerRuntime)
    .map(([runtimeID, devices]) => {
      const runtime = runtimes.find((item) => item.identifier === runtimeID);

      return devices.map((device) => {
        return {
          id: `ios-${device.udid}`,
          platform: Platform.IOS as const,
          UDID: device.udid,
          name: device.name,
          systemName: runtime?.name ?? "Unknown",
          available: device.isAvailable ?? false,
          deviceIdentifier: device.deviceTypeIdentifier,
          runtimeInfo: runtime!,
        };
      });
    })
    .flat();

  return simulators;
}

export enum SimulatorDeviceSet {
  Default,
  RN_IDE,
}

export async function createSimulator(
  deviceName: string,
  deviceIdentifier: string,
  runtime: IOSRuntimeInfo,
  deviceSet: SimulatorDeviceSet
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

  return {
    id: `ios-${UDID}`,
    platform: Platform.IOS,
    UDID,
    name: deviceName,
    systemName: runtime.name,
    available: true, // assuming if create command went through, it's available
    deviceIdentifier: deviceIdentifier,
    runtimeInfo: runtime,
  } as IOSDeviceInfo;
}

function getDeviceSetLocation() {
  const appCachesDir = getAppCachesDir();
  return path.join(appCachesDir, "Devices", "iOS");
}

function getOrCreateDeviceSet() {
  const deviceSetLocation = getDeviceSetLocation();
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
