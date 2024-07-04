import { workspace } from "vscode";

export type LaunchConfigurationOptions = {
  appRoot?: string;
  metroConfigPath?: string;
  name?: string;
  env?: Record<string, string>;
  ios?: {
    scheme?: string;
    configuration?: string;
  };
  isExpo?: boolean;
  android?: {
    buildType?: string;
    productFlavor?: string;
  };
  preview?: {
    waitForAppLaunch?: boolean;
  };
};

export function getLaunchConfigurations(): LaunchConfigurationOptions[] {
  return (
    workspace
      .getConfiguration("launch")
      ?.configurations?.filter((config: any) => config.type === "react-native-ide") || {}
  );
}

export function getDefaultLaunchConfiguration(): LaunchConfigurationOptions {
  const launchConfigurations = getLaunchConfigurations();
  const appRoot = workspace.getConfiguration("ReactNativeIDE").get<string>("appRoot");
  const defaultLaunchConfig = launchConfigurations.find((config) => config.appRoot === appRoot);
  return defaultLaunchConfig || {};
}
