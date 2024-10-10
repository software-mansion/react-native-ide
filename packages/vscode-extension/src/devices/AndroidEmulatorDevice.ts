import path from "path";
import fs from "fs";
import { EOL } from "node:os";
import xml2js from "xml2js";
import { v4 as uuidv4 } from "uuid";
import { Preview } from "./preview";
import { DeviceBase } from "./DeviceBase";
import { retry } from "../utilities/retry";
import { getAppCachesDir, getNativeABI, getOldAppCachesDir } from "../utilities/common";
import { ANDROID_HOME } from "../utilities/android";
import { ChildProcess, exec, lineReader } from "../utilities/subprocess";
import { BuildResult } from "../builders/BuildManager";
import { AndroidSystemImageInfo, DeviceInfo, DevicePlatform } from "../common/DeviceManager";
import { Logger } from "../Logger";
import { AppPermissionType, DeviceSettings } from "../common/Project";
import { getAndroidSystemImages } from "../utilities/sdkmanager";
import { EXPO_GO_PACKAGE_NAME, fetchExpoLaunchDeeplink } from "../builders/expoGo";
import { Platform } from "../utilities/platform";
import { AndroidBuildResult } from "../builders/buildAndroid";

export const EMULATOR_BINARY = path.join(
  ANDROID_HOME,
  "emulator",
  Platform.select({
    macos: "emulator",
    windows: "emulator.exe",
  })
);
const ADB_PATH = path.join(
  ANDROID_HOME,
  "platform-tools",
  Platform.select({
    macos: "adb",
    windows: "adb.exe",
  })
);
const DISPOSE_TIMEOUT = 9000;

interface EmulatorProcessInfo {
  pid: number;
  serialPort: number;
  adbPort: number;
  avdName: string;
  avdDir: string;
  grpcPort: number;
  grpcToken: string;
}

export class AndroidEmulatorDevice extends DeviceBase {
  private emulatorProcess: ChildProcess | undefined;
  private serial: string | undefined;

  constructor(private readonly avdId: string, private readonly info: DeviceInfo) {
    super();
  }

  public get platform(): DevicePlatform {
    return DevicePlatform.Android;
  }

  get deviceInfo(): DeviceInfo {
    return this.info;
  }

  get lockFilePath(): string {
    const avdDirectory = getAvdDirectoryLocation(this.avdId);
    const pidFile = path.join(avdDirectory, `${this.avdId}.avd`, "lock.pid");
    return pidFile;
  }

  public dispose(): void {
    super.dispose();
    this.emulatorProcess?.kill();
    // If the emulator process does not shut down initially due to ongoing activities or processes,
    // a forced termination (kill signal) is sent after a certain timeout period.
    setTimeout(() => {
      this.emulatorProcess?.kill(9);
    }, DISPOSE_TIMEOUT);
  }

  async changeSettings(settings: DeviceSettings) {
    await exec(ADB_PATH, [
      "-s",
      this.serial!,
      "shell",
      "settings",
      "put",
      "system",
      "font_scale",
      convertToAdbFontSize(settings.contentSize).toString(),
      "&&",
      `cmd uimode night ${settings.appearance === "light" ? "no" : "yes"}`,
    ]);
    // location_mode: LOCATION_MODE_OFF: 0 LOCATION_MODE_HIGH_ACCURACY: 3 LOCATION_MODE_BATTERY_SAVING: 2 LOCATION_MODE_SENSORS_ONLY: 1
    if (settings.location.isDisabled) {
      await exec(ADB_PATH, [
        "-s",
        this.serial!,
        "shell",
        "settings",
        "put",
        "secure",
        "location_mode",
        "0",
      ]);
    } else {
      await exec(ADB_PATH, [
        "-s",
        this.serial!,
        "shell",
        "settings",
        "put",
        "secure",
        "location_mode",
        "3",
      ]);
      // note that geo fix command takes arguments: $longitude , $latitude so the order is reversed compared to most conventions
      await exec(ADB_PATH, [
        "-s",
        this.serial!,
        "emu",
        "geo",
        "fix",
        settings.location.longitude.toString(),
        settings.location.latitude.toString(),
      ]);
    }
    return false;
  }

  async bootDevice(settings: DeviceSettings) {
    // this prevents booting device with the same AVD twice
    await ensureOldEmulatorProcessExited(this.avdId);

    const avdDirectory = getOrCreateAvdDirectory(this.avdId);

    const subprocess = exec(
      EMULATOR_BINARY,
      [
        "-avd",
        this.avdId,
        "-qt-hide-window",
        "-no-audio",
        "-no-boot-anim",
        "-grpc-use-token",
        "-no-snapshot-save",
      ],
      { env: { ANDROID_AVD_HOME: avdDirectory } }
    );
    this.emulatorProcess = subprocess;

    const initPromise = new Promise<string>((resolve, reject) => {
      subprocess.catch(reject).then(() => {
        // we expect the process to produce an expected output that we listed for
        // below and resolve the promise earlier. However, if the process exists
        // and the promise is still not resolved we should reject it such that we
        // don't hold other code waiting for it indefinitely.
        reject(new Error("Emulator process exited without producing expected output"));
      });

      lineReader(subprocess).onLineRead(async (line) => {
        Logger.debug("Emulator output", line);
        if (line.includes("Advertising in:")) {
          const match = line.match(/Advertising in: (\S+)/);
          const iniFile = match![1];
          const emulatorInfo = await parseAvdIniFile(iniFile);
          const emulatorSerial = `emulator-${emulatorInfo.serialPort}`;
          await waitForEmulatorOnline(emulatorSerial, 60000);
          resolve(emulatorSerial);
        }
      });
    });

    this.serial = await initPromise;

    await this.changeSettings(settings);
  }

  async configureExpoDevMenu(packageName: string) {
    if (packageName === "host.exp.exponent") {
      // For expo go we are unable to change this setting as the APK is not debuggable
      return;
    }
    // this code disables expo devmenu popup when the app is launched. When dev menu
    // is displayed, it blocks the JS loop and hence react devtools are unable to establish
    // the connection, and hence we never get the app ready event.
    const prefsXML = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map><boolean name="isOnboardingFinished" value="true"/></map>`;
    await exec(
      ADB_PATH,
      [
        "-s",
        this.serial!,
        "shell",
        `run-as ${packageName} sh -c 'mkdir -p /data/data/${packageName}/shared_prefs && cat > /data/data/${packageName}/shared_prefs/expo.modules.devmenu.sharedpreferences.xml'`,
      ],
      {
        // pass serialized prefs as input:
        input: prefsXML,
      }
    );
  }

  async configureMetroPort(packageName: string, metroPort: number) {
    // read preferences
    let prefs: { map: any };
    try {
      const { stdout } = await exec(
        ADB_PATH,
        [
          "-s",
          this.serial!,
          "shell",
          "run-as",
          packageName,
          "cat",
          `/data/data/${packageName}/shared_prefs/${packageName}_preferences.xml`,
        ],
        { allowNonZeroExit: true }
      );
      prefs = await xml2js.parseStringPromise(stdout, { explicitArray: true });
      // test if prefs.map is an object, otherwise we just start from an empty prefs
      if (typeof prefs.map !== "object") {
        throw new Error("Invalid prefs file format");
      }
    } catch (e) {
      // preferences file does not exists
      prefs = { map: {} };
    }

    // filter out existing debug_http_host record
    prefs.map.string = prefs.map.string?.filter((s: any) => s.$.name !== "debug_http_host") || [];
    // add new debug_http_host record pointing to 10.0.2.2:metroPort (localhost from emulator)
    prefs.map.string.push({ $: { name: "debug_http_host" }, _: `10.0.2.2:${metroPort}` });
    const prefsXML = new xml2js.Builder().buildObject(prefs);

    // write prefs
    await exec(
      ADB_PATH,
      [
        "-s",
        this.serial!,
        "shell",
        `run-as ${packageName} sh -c 'mkdir -p /data/data/${packageName}/shared_prefs && cat > /data/data/${packageName}/shared_prefs/${packageName}_preferences.xml'`,
      ],
      {
        // pass serialized prefs as input:
        input: prefsXML,
      }
    );
  }

  async launchWithBuild(build: AndroidBuildResult) {
    await exec(ADB_PATH, [
      "-s",
      this.serial!,
      "shell",
      "monkey",
      "-p",
      build.packageName,
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ]);
  }

  async launchWithExpoDeeplink(metroPort: number, devtoolsPort: number, expoDeeplink: string) {
    // For Expo dev-client and expo go setup, we use deeplink to launch the app. Since Expo's manifest is configured to
    // return localhost:PORT as the destination, we need to setup adb reverse for metro port first.
    await exec(ADB_PATH, ["-s", this.serial!, "reverse", `tcp:${metroPort}`, `tcp:${metroPort}`]);
    await exec(ADB_PATH, [
      "-s",
      this.serial!,
      "reverse",
      `tcp:${devtoolsPort}`,
      `tcp:${devtoolsPort}`,
    ]);
    // next, we open the link
    await exec(ADB_PATH, [
      "-s",
      this.serial!,
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      expoDeeplink,
    ]);
  }

  async launchApp(build: BuildResult, metroPort: number, devtoolsPort: number) {
    if (build.platform !== DevicePlatform.Android) {
      throw new Error("Invalid platform");
    }
    const deepLinkChoice =
      build.packageName === EXPO_GO_PACKAGE_NAME ? "expo-go" : "expo-dev-client";
    const expoDeeplink = await fetchExpoLaunchDeeplink(metroPort, "android", deepLinkChoice);
    if (expoDeeplink) {
      await this.configureExpoDevMenu(build.packageName);
      await this.launchWithExpoDeeplink(metroPort, devtoolsPort, expoDeeplink);
    } else {
      await this.configureMetroPort(build.packageName, metroPort);
      await this.launchWithBuild(build);
    }
  }

  async installApp(build: BuildResult, forceReinstall: boolean) {
    if (build.platform !== DevicePlatform.Android) {
      throw new Error("Invalid platform");
    }

    // allowNonZeroExit is set to true to not print errors when INSTALL_FAILED_UPDATE_INCOMPATIBLE occurs.
    const installApk = (allowDowngrade: boolean) =>
      exec(
        ADB_PATH,
        ["-s", this.serial!, "install", ...(allowDowngrade ? ["-d"] : []), "-r", build.apkPath],
        { allowNonZeroExit: true }
      );

    const uninstallApp = async (packageName: string) => {
      try {
        await retry(
          () =>
            exec(ADB_PATH, ["-s", this.serial!, "uninstall", packageName], {
              allowNonZeroExit: true,
            }),
          2,
          1000
        );
      } catch (e) {
        Logger.error("Error while uninstalling will be ignored", e);
      }
    };

    // adb install sometimes fails because we call it too early after the device is initialized.
    // we haven't found a better way to test if device is ready and already wait for boot_completed
    // flag in waitForEmulatorOnline. But even after that even is delivered, adb install also sometimes
    // fails claiming it is too early. The workaround therefore is to retry install command.
    if (forceReinstall) {
      await uninstallApp(build.packageName);
    }

    await retry(
      async (retryNumber) => {
        if (retryNumber === 0) {
          await installApk(false);
        } else if (retryNumber === 1) {
          // There's a chance that same emulator was used in newer version of Expo
          // and then RN IDE was opened on older project, in which case installation
          // will fail. We use -d flag which allows for downgrading debuggable
          // applications (see `adb shell pm`, install command)
          await installApk(true);
        } else {
          // If the app is still not installed, we try to uninstall it first to
          // avoid "INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package <name>
          // signatures do not match newer version; ignoring!" error. This error
          // may come when building locally and with EAS.
          await uninstallApp(build.packageName);
          await installApk(true);
        }
      },
      2,
      1000
    );
  }

  async resetAppPermissions(appPermission: AppPermissionType, build: BuildResult) {
    if (build.platform !== DevicePlatform.Android) {
      throw new Error("Invalid platform");
    }
    if (appPermission !== "all") {
      Logger.warn(
        "Resetting all privacy permission as individual permissions aren't currently supported on Android."
      );
    }
    await exec(ADB_PATH, [
      "-s",
      this.serial!,
      "shell",
      "pm",
      "reset-permissions",
      build.packageName,
    ]);
    return true; // Android will terminate the process if any of the permissions were granted prior to reset-permissions call
  }

  makePreview(): Preview {
    return new Preview(["android", "--id", this.serial!]);
  }

  async sendBiometricAuthorization(isMatch: boolean) {
    // TO DO: implement android biometric authorization
  }
}

export async function createEmulator(displayName: string, deviceName: string, systemImage: AndroidSystemImageInfo) {
  const avdDirectory = getOrCreateAvdDirectory();
  const avdId = uuidv4();
  const avdIni = path.join(avdDirectory, `${avdId}.ini`);
  const avdLocation = path.join(avdDirectory, `${avdId}.avd`);
  const configIni = path.join(avdLocation, "config.ini");

  fs.mkdirSync(avdLocation, { recursive: true });

  const avdIniData = [
    ["avd.ini.encoding", "UTF-8"],
    ["path", avdLocation],
  ];
  const avdIniContent = avdIniData.map(([key, value]) => `${key}=${value}`).join("\n");
  await fs.promises.writeFile(avdIni, avdIniContent, "utf-8");

  const configIniData = [
    ["AvdId", avdId],
    ["PlayStore.enabled", "true"],
    ["abi.type", getNativeABI()],
    ["avd.ini.displayname", displayName],
    ["avd.ini.encoding", "UTF-8"],
    ["disk.dataPartition.size", "6442450944"],
    ["fastboot.chosenSnapshotFile", ""],
    ["fastboot.forceChosenSnapshotBoot", "no"],
    ["fastboot.forceColdBoot", "no"],
    ["fastboot.forceFastBoot", "yes"],
    ["hw.accelerometer", "yes"],
    ["hw.arc", "false"],
    ["hw.audioInput", "yes"],
    ["hw.battery", "yes"],
    ["hw.camera.back", "virtualscene"],
    ["hw.camera.front", "emulated"],
    ["hw.cpu.arch", getNativeQemuArch()],
    ["hw.cpu.ncore", "4"],
    ["hw.dPad", "no"],
    ["hw.device.manufacturer", "Google"],
    ["hw.device.name", deviceName],
    ["hw.gps", "yes"],
    ["hw.gpu.enabled", "yes"],
    ["hw.gpu.mode", "auto"],
    ["hw.initialOrientation", "Portrait"],
    ["hw.keyboard", "yes"],
    ["hw.lcd.density", "420"],
    ["hw.lcd.height", "2400"],
    ["hw.lcd.width", "1080"],
    ["hw.mainKeys", "no"],
    ["hw.ramSize", "1536"],
    ["hw.sdCard", "yes"],
    ["hw.sensors.orientation", "yes"],
    ["hw.sensors.proximity", "yes"],
    ["hw.trackBall", "no"],
    ["image.sysdir.1", systemImage.location],
    ["runtime.network.latency", "none"],
    ["runtime.network.speed", "full"],
    ["sdcard.size", "512M"],
    ["showDeviceFrame", "no"],
    ["tag.display", "Google Play"],
    ["tag.id", "google_apis_playstore"],
    ["vm.heapSize", "228"],
  ];
  const configIniContent = configIniData.map(([key, value]) => `${key}=${value}`).join("\n");
  await fs.promises.writeFile(configIni, configIniContent, "utf-8");
  return {
    id: `android-${avdId}`,
    platform: DevicePlatform.Android,
    avdId,
    name: displayName,
    systemName: systemImage.name,
    available: true, // TODO: there is no easy way to check if emulator is available, we'd need to parse config.ini
  } as DeviceInfo;
}
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
async function getAvdIds(avdDirectory: string) {
  const { stdout } = await exec(EMULATOR_BINARY, ["-list-avds"], {
    env: { ANDROID_AVD_HOME: avdDirectory },
  });

  // filters out error messages and empty lines
  // https://github.com/react-native-community/cli/issues/1801#issuecomment-1980580355
  return stdout.split(EOL).filter((id) => UUID_REGEX.test(id));
}

export async function listEmulators() {
  const avdDirectory = getOrCreateAvdDirectory();
  const emulators = listEmulatorsForDirectory(avdDirectory);
  const oldAvdDirectory = getOldAvdDirectoryLocation();
  const oldEmulators = listEmulatorsForDirectory(oldAvdDirectory);

  const combinedEmulators = await Promise.all([emulators, oldEmulators]);

  return combinedEmulators[0].concat(combinedEmulators[1]);
}

async function listEmulatorsForDirectory(avdDirectory: string) {
  const avdIds = await getAvdIds(avdDirectory);
  const systemImages = await getAndroidSystemImages();
  return Promise.all(
    avdIds.map(async (avdId) => {
      const avdConfigPath = path.join(avdDirectory, `${avdId}.avd`, "config.ini");
      const { displayName, systemImageDir } = await parseAvdConfigIniFile(avdConfigPath);

      const systemImageName = systemImages.find(
        (image: AndroidSystemImageInfo) => image.location === systemImageDir
      )?.name;
      return {
        id: `android-${avdId}`,
        platform: DevicePlatform.Android,
        avdId,
        name: displayName,
        systemName: systemImageName ?? "Unknown",
        available: true, // TODO: there is no easy way to check if emulator is available, we'd need to parse config.ini
      } as DeviceInfo;
    })
  );
}

async function ensureOldEmulatorProcessExited(avdId: string) {
  let runningPid: string | undefined;
  const command = Platform.select({
    macos: "ps",
    windows:
      'powershell.exe "Get-WmiObject Win32_Process | Select-Object ProcessId, CommandLine | ConvertTo-Csv -NoTypeInformation"',
  });
  const args = Platform.select({ macos: ["-Ao", "pid,command"], windows: [] });
  const subprocess = exec(command, args);
  const regexpPattern = new RegExp(`(\\d+).*qemu.*-avd ${avdId}`);
  lineReader(subprocess).onLineRead(async (line) => {
    const regExpResult = regexpPattern.exec(line);
    if (regExpResult) {
      runningPid = regExpResult[1];
    }
  });
  await subprocess;
  if (runningPid) {
    process.kill(Number(runningPid), 9);
  }
}

export async function removeEmulator(avdId: string) {
  // ensure to kill emulator process before removing avd files used by that process
  if (Platform.OS === "windows") {
    await ensureOldEmulatorProcessExited(avdId);
  }

  const avdDirectory = getOrCreateAvdDirectory(avdId);
  const removeAvd = fs.promises.rm(path.join(avdDirectory, `${avdId}.avd`), {
    recursive: true,
  });
  const removeIni = fs.promises.rm(path.join(avdDirectory, `${avdId}.ini`));
  return Promise.all([removeAvd, removeIni])
    .catch(() => {
      /* ignore errors when removing */
    })
    .then(() => {});
}

async function parseAvdConfigIniFile(filePath: string) {
  const content = await fs.promises.readFile(filePath, "utf-8");

  let displayName: string | undefined;
  let systemImageDir: string | undefined;
  content.split("\n").forEach((line: string) => {
    const [key, value] = line.split("=");
    switch (key) {
      case "avd.ini.displayname":
        displayName = value;
        break;
      case "image.sysdir.1":
        systemImageDir = value.includes(ANDROID_HOME) ? value : path.join(ANDROID_HOME, value);
        break;
    }
  });
  if (!displayName || !systemImageDir) {
    throw new Error(`Couldn't parse AVD ${filePath}`);
  }

  return { displayName, systemImageDir };
}

async function parseAvdIniFile(filePath: string) {
  const content = await fs.promises.readFile(filePath, "utf-8");

  const info: Partial<EmulatorProcessInfo> = {
    pid: parseInt(filePath.match(/^pid_(\d+)\.ini$/)?.[1] ?? "0"),
  };
  Logger.debug("Parsing ini file", filePath);

  content.split("\n").forEach((line: string) => {
    const [key, value] = line.split("=");
    switch (key) {
      case "port.serial":
        info.serialPort = parseInt(value);
        break;
      case "port.adb":
        info.adbPort = parseInt(value);
        break;
      case "avd.name":
        info.avdName = value;
        break;
      case "avdDir":
        info.avdDir = value;
        break;
      case "grpc.port":
        info.grpcPort = parseInt(value);
        break;
      case "grpc.token":
        info.grpcToken = value;
        break;
    }
  });

  return info as EmulatorProcessInfo;
}

async function waitForEmulatorOnline(serial: string, timeoutMs: number) {
  await exec(ADB_PATH, [
    "-s",
    serial,
    "wait-for-device",
    "shell",
    "while [[ -z $(getprop sys.boot_completed) ]]; do sleep 0.5; done; input keyevent 82",
  ]);
}

function getOrCreateAvdDirectory(avd?: string) {
  const avdDirectory = getAvdDirectoryLocation(avd);
  if (!fs.existsSync(avdDirectory)) {
    fs.mkdirSync(avdDirectory, { recursive: true });
  }

  return avdDirectory;
}

function getOldAvdDirectoryLocation() {
  const oldAppCachesDir = getOldAppCachesDir();
  return path.join(oldAppCachesDir, "Devices", "Android", "avd");
}

function getAvdDirectoryLocation(avd?: string) {
  const appCachesDir = getAppCachesDir();
  const avdDirectory = path.join(appCachesDir, "Devices", "Android", "avd");
  if (!avd) {
    return avdDirectory;
  }

  const oldAvdDirectory = getOldAvdDirectoryLocation();
  if (!fs.existsSync(oldAvdDirectory)) {
    return avdDirectory;
  }
  const devices = fs.readdirSync(oldAvdDirectory);
  if (devices.includes(`${avd}.avd`)) {
    return oldAvdDirectory;
  }
  return avdDirectory;
}

function convertToAdbFontSize(size: DeviceSettings["contentSize"]): number {
  switch (size) {
    case "xsmall":
      return 0.75;
    case "small":
      return 0.85;
    case "normal":
      return 1;
    case "large":
      return 1.3;
    case "xlarge":
      return 1.4;
    case "xxlarge":
      return 1.5;
    case "xxxlarge":
      return 1.6;
  }
}

enum CPU_ARCH {
  X86 = "x86",
  X86_64 = "x86_64",
  ARM = "arm",
  ARM64 = "arm64",
}

function getNativeQemuArch() {
  switch (process.arch) {
    case "x64":
      return CPU_ARCH.X86_64;
    case "ia32":
      return CPU_ARCH.X86;
    case "arm":
      return CPU_ARCH.ARM;
    case "arm64":
      return CPU_ARCH.ARM64;
    default:
      throw new Error("Unsupported CPU architecture.");
  }
}
