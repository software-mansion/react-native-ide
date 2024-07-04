import { RelativePattern, workspace, Uri, OutputChannel } from "vscode";
import { exec, lineReader } from "../utilities/subprocess";
import { Logger } from "../Logger";
import path from "path";
import { checkIosDependenciesInstalled } from "../dependency/DependencyChecker";
import { installIOSDependencies } from "../dependency/DependencyInstaller";
import { CancelToken } from "./BuildManager";
import { BuildIOSProgressProcessor } from "./BuildIOSProgressProcessor";
import { getDefaultLaunchConfiguration } from "../utilities/launchConfiguration";
import {
  SimulatorDeviceSet,
  createSimulator,
  listSimulators,
  removeIosSimulator,
} from "../devices/IosSimulatorDevice";
import { IOSDeviceInfo, Platform } from "../common/DeviceManager";
import { EXPO_GO_BUNDLE_ID, downloadExpoGo, isExpoGoProject } from "./expoGo";

type IOSProjectInfo =
  | {
      workspaceLocation: string;
      xcodeprojLocation: string;
      isWorkspace: true;
    }
  | {
      workspaceLocation: undefined;
      xcodeprojLocation: string;
      isWorkspace: false;
    };

const TEMP_SIMULATOR_NAME_PREFIX = "__RNIDE_TEMP_SIM_";

// Assuming users have ios folder in their project's root
export const getIosSourceDir = (appRootFolder: string) => path.join(appRootFolder, "ios");

async function getBundleID(appPath: string) {
  return (
    await exec("/usr/libexec/PlistBuddy", [
      "-c",
      "Print:CFBundleIdentifier",
      path.join(appPath, "Info.plist"),
    ])
  ).stdout;
}

export async function findXcodeProject(appRootFolder: string) {
  function getParentDirectory(filePath: Uri) {
    return Uri.joinPath(filePath, "..").fsPath;
  }

  function inSameDirectory(file1: Uri, file2: Uri) {
    const parentDirectory1 = getParentDirectory(file1);
    const parentDirectory2 = getParentDirectory(file2);

    return parentDirectory1 === parentDirectory2;
  }

  const iosSourceDir = getIosSourceDir(appRootFolder);

  const xcworkspaceFiles = await workspace.findFiles(
    new RelativePattern(iosSourceDir, "**/*.xcworkspace/*"),
    "**/{node_modules,build,Pods,vendor,*.xcodeproj}/**",
    2
  );

  let workspaceLocation: string | undefined;
  if (xcworkspaceFiles.length === 2 && !inSameDirectory(xcworkspaceFiles[0], xcworkspaceFiles[1])) {
    Logger.warn(`Found multiple XCode workspace files: ${xcworkspaceFiles.join(", ")}`);
  } else if (xcworkspaceFiles.length >= 1) {
    workspaceLocation = getParentDirectory(xcworkspaceFiles[0]);
  }

  const xcodeprojFiles = await workspace.findFiles(
    new RelativePattern(iosSourceDir, "**/*.xcodeproj/*"),
    "**/{node_modules,build,Pods,vendor}/**",
    2
  );

  let xcodeprojLocation: string | undefined;
  if (xcodeprojFiles.length === 2 && !inSameDirectory(xcodeprojFiles[0], xcodeprojFiles[1])) {
    Logger.warn(`Found multiple XCode project files: ${xcodeprojFiles.join(", ")}`);
  } else if (xcodeprojFiles.length >= 1) {
    xcodeprojLocation = getParentDirectory(xcodeprojFiles[0]);
  }

  if (xcodeprojLocation) {
    return {
      workspaceLocation,
      xcodeprojLocation,
      isWorkspace: workspaceLocation !== undefined,
    } as IOSProjectInfo;
  }

  return null;
}

function buildProject(
  UDID: string,
  xcodeProject: IOSProjectInfo,
  buildDir: string,
  scheme: string,
  configuration: string,
  cleanBuild: boolean
) {
  const xcodebuildArgs = [
    xcodeProject.isWorkspace ? "-workspace" : "-project",
    xcodeProject.workspaceLocation || xcodeProject.xcodeprojLocation,
    "-configuration",
    configuration,
    "-scheme",
    scheme,
    "-destination",
    `id=${UDID}`,
    ...(cleanBuild ? ["clean"] : []),
    "build",
  ];

  Logger.debug(`Building using "xcodebuild ${xcodebuildArgs.join(" ")}`);

  return exec("xcodebuild", xcodebuildArgs, {
    env: {
      ...process.env,
      ...getDefaultLaunchConfiguration().env,
      RCT_NO_LAUNCH_PACKAGER: "true",
    },
    cwd: buildDir,
    buffer: false,
  });
}

async function findXcodeScheme(xcodeProject: IOSProjectInfo) {
  const basename = xcodeProject.workspaceLocation
    ? path.basename(xcodeProject.workspaceLocation, ".xcworkspace")
    : path.basename(xcodeProject.xcodeprojLocation, ".xcodeproj");

  // we try to search for the scheme name under .xcodeproj/xcshareddata/xcschemes
  const schemeFiles = await workspace.findFiles(
    new RelativePattern(xcodeProject.xcodeprojLocation, "**/xcshareddata/xcschemes/*.xcscheme")
  );
  if (schemeFiles.length === 1) {
    return path.basename(schemeFiles[0].fsPath, ".xcscheme");
  } else if (schemeFiles.length === 0) {
    Logger.warn(
      `Could not find any scheme files in ${xcodeProject.xcodeprojLocation}, using workspace name "${basename}" as scheme`
    );
  } else {
    Logger.warn(
      `Ambiguous scheme files in ${xcodeProject.xcodeprojLocation}, using workspace name "${basename}" as scheme`
    );
  }
  return basename;
}

export async function buildIos(
  deviceInfo: IOSDeviceInfo,
  appRootFolder: string,
  forceCleanBuild: boolean,
  cancelToken: CancelToken,
  outputChannel: OutputChannel,
  progressListener: (newProgress: number) => void
) {
  if (await isExpoGoProject()) {
    const appPath = await downloadExpoGo(Platform.IOS, cancelToken);
    return { appPath, bundleID: EXPO_GO_BUNDLE_ID };
  }

  const sourceDir = getIosSourceDir(appRootFolder);

  const isPodsInstalled = await checkIosDependenciesInstalled();
  if (!isPodsInstalled) {
    await cancelToken.adapt(installIOSDependencies(appRootFolder, forceCleanBuild));
  }

  const xcodeProject = await findXcodeProject(appRootFolder);

  if (!xcodeProject) {
    throw new Error(`Could not find Xcode project files in "${sourceDir}" folder`);
  }
  Logger.debug(
    `Found Xcode ${xcodeProject.isWorkspace ? "workspace" : "project"} ${
      xcodeProject.workspaceLocation || xcodeProject.xcodeprojLocation
    }`
  );

  const buildOptions = getDefaultLaunchConfiguration();
  const scheme = buildOptions.ios?.scheme || (await findXcodeScheme(xcodeProject));
  Logger.debug(`Xcode build will use "${scheme}" scheme`);

  let platformName: string | undefined;
  const buildProcess = withTemporarySimulator(deviceInfo, (UDID) => {
    const process = cancelToken.adapt(
      buildProject(
        UDID,
        xcodeProject,
        sourceDir,
        scheme,
        buildOptions?.ios?.configuration || "Debug",
        forceCleanBuild
      )
    );

    const buildIOSProgressProcessor = new BuildIOSProgressProcessor(progressListener);
    outputChannel.clear();
    lineReader(process, true).onLineRead((line) => {
      outputChannel.appendLine(line);
      buildIOSProgressProcessor.processLine(line);
      // Xcode can sometimes escape `=` with a backslash or put the value in quotes
      const platformNameMatch = /export PLATFORM_NAME\\?="?(\w+)"?$/m.exec(line);
      if (platformNameMatch) {
        platformName = platformNameMatch[1];
      }
    });
    return process;
  });

  await buildProcess;

  if (!platformName) {
    throw new Error(`Couldn't find "PLATFORM_NAME" in xcodebuild output`);
  }

  const appPath = await getBuildPath(
    xcodeProject,
    sourceDir,
    platformName,
    scheme,
    buildOptions?.ios?.configuration || "Debug",
    cancelToken
  );

  const bundleID = await getBundleID(appPath);

  return { appPath, bundleID };
}

async function getBuildPath(
  xcodeProject: IOSProjectInfo,
  projectDir: string,
  platformName: string,
  scheme: string,
  configuration: string,
  cancelToken: CancelToken
) {
  type KnownSettings = "WRAPPER_EXTENSION" | "TARGET_BUILD_DIR" | "EXECUTABLE_FOLDER_PATH";
  type BuildSettings = {
    action: string; // e.g. "build"
    buildSettings: Record<KnownSettings, string> & Record<string, string>;
    target: string;
  }[];

  const buildSettings = await cancelToken.adapt(
    exec(
      "xcodebuild",
      [
        xcodeProject.isWorkspace ? "-workspace" : "-project",
        xcodeProject.workspaceLocation || xcodeProject.xcodeprojLocation,
        "-scheme",
        scheme,
        "-sdk",
        platformName,
        "-configuration",
        configuration,
        "-showBuildSettings",
        "-json",
      ],
      { encoding: "utf8", cwd: projectDir }
    )
  );

  const settings: BuildSettings = JSON.parse(buildSettings.stdout);
  const {
    WRAPPER_EXTENSION: wrapperExtension,
    TARGET_BUILD_DIR: targetBuildDir,
    EXECUTABLE_FOLDER_PATH: executableFolderPath,
  } = settings[0].buildSettings;
  // Find app in all building settings - look for WRAPPER_EXTENSION: 'app',
  if (wrapperExtension !== "app") {
    throw new Error("Failed to get the target build directory and app name.");
  }

  return `${targetBuildDir}/${executableFolderPath}`;
}

async function withTemporarySimulator<T>(
  originalDeviceInfo: IOSDeviceInfo,
  fn: (UDID: string) => Promise<T>
) {
  await removeStaleTemporarySimulators();

  const { UDID } = await createSimulator(
    TEMP_SIMULATOR_NAME_PREFIX + originalDeviceInfo.deviceIdentifier,
    originalDeviceInfo.deviceIdentifier,
    originalDeviceInfo.runtimeInfo,
    SimulatorDeviceSet.Default
  );
  const result = await fn(UDID);
  await removeIosSimulator(UDID, SimulatorDeviceSet.Default);

  return result;
}

async function removeStaleTemporarySimulators() {
  const simulators = await listSimulators(SimulatorDeviceSet.Default);
  const removedSimulators = simulators
    .filter(({ name }) => name.startsWith(TEMP_SIMULATOR_NAME_PREFIX))
    .map(({ UDID }) => removeIosSimulator(UDID, SimulatorDeviceSet.Default));

  await Promise.allSettled(removedSimulators);
}
