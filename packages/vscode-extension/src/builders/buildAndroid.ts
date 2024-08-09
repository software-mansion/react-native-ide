import { getNativeABI } from "../utilities/common";
import { ANDROID_HOME, JAVA_HOME } from "../utilities/android";
import { Logger } from "../Logger";
import { exec, lineReader } from "../utilities/subprocess";
import semver from "semver";
import { AndroidBuildResult, CancelToken } from "./BuildManager";
import path from "path";
import fs from "fs";
import { OutputChannel, workspace } from "vscode";
import { extensionContext } from "../utilities/extensionContext";
import { BuildAndroidProgressProcessor } from "./BuildAndroidProgressProcessor";
import { getLaunchConfiguration } from "../utilities/launchConfiguration";
import { EXPO_GO_PACKAGE_NAME, downloadExpoGo, isExpoGoProject } from "./expoGo";
import { DevicePlatform } from "../common/DeviceManager";
import { getReactNativeVersion } from "../utilities/reactNative";

const BUILD_TOOLS_PATH = path.join(ANDROID_HOME, "build-tools");
const RELATIVE_APK_DIR = "app/build/outputs/apk";

// Assuming users have android folder in their project's root
export const getAndroidSourceDir = (appRootFolder: string) => path.join(appRootFolder, "android");

function locateAapt() {
  // search for aapt binary under BUILD_TOOLS_PATH/<version>/aapt
  // since we only need aapt to extract package name, we can use any version.
  // However, on M1 macs, aapt we noticed that older aapt versions may not work
  // as they may require rosetta, so we try to find the latest version.
  const versions = fs.readdirSync(BUILD_TOOLS_PATH);
  const latestVersion = versions.sort().reverse()[0];
  return path.join(BUILD_TOOLS_PATH, latestVersion, "aapt");
}

async function extractPackageName(artifactPath: string, cancelToken: CancelToken) {
  const aaptPath = locateAapt();
  const { stdout } = await cancelToken.adapt(exec(aaptPath, ["dump", "badging", artifactPath]));
  const packageLine = stdout.split("\n").find((line: string) => line.startsWith("package: name="));
  const packageName = packageLine!.split("'")[1];
  return packageName;
}

function getApkPath(appRootFolder: string, productFlavor: string, buildType: string) {
  const androidSourceDir = getAndroidSourceDir(appRootFolder);
  const apkFile = ["app", productFlavor, buildType].filter(Boolean).join("-") + ".apk";
  return path.join(androidSourceDir, RELATIVE_APK_DIR, productFlavor, buildType, apkFile);
}

export async function getAndroidBuildPaths(
  appRootFolder: string,
  cancelToken: CancelToken,
  productFlavor: string,
  buildType: string
) {
  const apkPath = getApkPath(appRootFolder, productFlavor, buildType);
  const packageName = await extractPackageName(apkPath, cancelToken);
  return { apkPath, packageName };
}

function makeBuildTaskName(productFlavor: string, buildType: string) {
  // task name is in the format of assemble<ProductFlavor><BuildType> where productFlavor and buildType
  // are the names of the productFlavor and buildType that each start with a capital letter.
  // By default, Android Gradle Plugin always creates staging and release buildTypes and does not define any productFlavor.
  const flavor = productFlavor.charAt(0).toUpperCase() + productFlavor.slice(1);
  return "assemble" + flavor + buildType.charAt(0).toUpperCase() + buildType.slice(1);
}

export async function buildAndroid(
  appRootFolder: string,
  forceCleanBuild: boolean,
  cancelToken: CancelToken,
  outputChannel: OutputChannel,
  progressListener: (newProgress: number) => void
) {
  if (await isExpoGoProject()) {
    const apkPath = await downloadExpoGo(DevicePlatform.Android, cancelToken);
    return { apkPath, packageName: EXPO_GO_PACKAGE_NAME };
  }
  const androidSourceDir = getAndroidSourceDir(appRootFolder);
  const buildOptions = getLaunchConfiguration();
  const productFlavor = buildOptions.android?.productFlavor || "";
  const buildType = buildOptions.android?.buildType || "debug";
  const gradleArgs = [
    "-x",
    "lint",
    `-PreactNativeArchitectures=${getNativeABI()}`,
    ...(forceCleanBuild ? ["clean"] : []),
    makeBuildTaskName(productFlavor, buildType),
    "--init-script", // buildProgressEvaluation init script is used log build task count for build progress logging
    path.join(
      extensionContext.extensionPath,
      "lib",
      "android",
      "buildProgressEvaluation.initscript.gradle"
    ),
  ];
  // configureReactNativeOverrides init script is only necessary for RN versions older then 0.74.0 see comments in configureReactNativeOverrides.gradle for more details
  if (semver.lt(await getReactNativeVersion(), "0.74.0")) {
    gradleArgs.push(
      "--init-script", // configureReactNativeOverrides init script is used to patch React Android project, see comments in configureReactNativeOverrides.gradle for more details
      path.join(
        extensionContext.extensionPath,
        "lib",
        "android",
        "configureReactNativeOverrides.initscript.gradle"
      )
    );
  }
  Logger.debug("Starting Android build");
  const buildProcess = cancelToken.adapt(
    exec("./gradlew", gradleArgs, {
      cwd: androidSourceDir,
      env: { ...buildOptions.env, JAVA_HOME, ANDROID_HOME },
      buffer: false,
    })
  );
  const buildAndroidProgressProcessor = new BuildAndroidProgressProcessor(progressListener);
  outputChannel.clear();
  lineReader(buildProcess, true).onLineRead((line) => {
    outputChannel.appendLine(line);
    buildAndroidProgressProcessor.processLine(line);
  });

  await buildProcess;
  Logger.debug("Android build sucessful");
  return getAndroidBuildPaths(appRootFolder, cancelToken, productFlavor, buildType);
}
