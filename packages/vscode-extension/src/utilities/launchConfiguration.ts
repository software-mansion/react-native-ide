import { workspace } from "vscode";

export type LaunchConfigurationOptions = {
  appRoot?: string;
  name?: string;
  metroConfigPath?: string;
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

export function getLaunchConfiguration(): LaunchConfigurationOptions {
  return (
    workspace
      .getConfiguration("launch")
      ?.configurations?.find((config: any) => config.type === "react-native-ide") || {}
  );
}

export function getAllLaunchConfigurations(): LaunchConfigurationOptions[] {
  return (
    workspace
      .getConfiguration("launch")
      ?.configurations?.filter((config: any) => config.type === "react-native-ide") || {}
  );
}
