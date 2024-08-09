import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { vscode } from "../utilities/vscode";

export enum InstallationStatus {
  NotInstalled,
  InProgress,
  Installed,
}

export interface DependencyState {
  installed: InstallationStatus;
  info: string;
  error?: string;
}

interface DependencyMessageData {
  command: string;
  data: {
    installed: boolean;
    info: string;
    error?: string;
  };
}

// when editing, update hasError function
type Dependencies = {
  Nodejs?: DependencyState;
  AndroidEmulator?: DependencyState;
  Xcode?: DependencyState;
  CocoaPods?: DependencyState;
  NodeModules?: DependencyState;
  ReactNative?: DependencyState;
  Expo?: DependencyState;
  Pods?: DependencyState;
};

const defaultDependencies: Dependencies = {
  Nodejs: undefined,
  AndroidEmulator: undefined,
  Xcode: undefined,
  CocoaPods: undefined,
  NodeModules: undefined,
  ReactNative: undefined,
  Expo: undefined,
  Pods: undefined,
};

const prerequisites = Object.keys(defaultDependencies);

function runDiagnostics() {
  prerequisites.forEach((prerequisite) => {
    vscode.postMessage({
      command: `check${prerequisite}Installed`,
    });
  });
}

function hasError(dependencies: Dependencies, domain: "ios" | "android" | "common"): boolean {
  function errored(state: DependencyState | undefined) {
    if (state === undefined) {
      return false;
    }
    return state.error !== undefined;
  }

  const required = {
    ios: ["Xcode", "CocoaPods", "Pods"],
    android: ["AndroidEmulator"],
    common: ["Nodejs", "NodeModules"],
  }[domain];

  return entries(dependencies)
    .filter(([dependency, _state]) => required.includes(dependency))
    .some(([_dependency, state]) => errored(state));
}

function adaptDependencyData(data: DependencyMessageData["data"]): DependencyState {
  if (data.installed) {
    return { ...data, installed: InstallationStatus.Installed };
  }
  return { ...data, installed: InstallationStatus.NotInstalled };
}

function entries<K extends string, T>(object: Partial<Record<K, T>>) {
  return Object.entries(object) as [K, T][];
}

interface DependenciesContextProps {
  dependencies: Dependencies;
  isReady: boolean;
  isCommonError: boolean;
  isAndroidError: boolean;
  isIosError: boolean;
  androidEmulatorError: string | undefined;
  iosSimulatorError: string | undefined;
  runDiagnostics: () => void;
}

const DependenciesContext = createContext<DependenciesContextProps>({
  dependencies: defaultDependencies,
  isReady: false,
  isCommonError: false,
  isAndroidError: false,
  isIosError: false,
  androidEmulatorError: undefined,
  iosSimulatorError: undefined,
  runDiagnostics,
});

export default function DependenciesProvider({ children }: PropsWithChildren) {
  const [dependencies, setDependencies] = useState<Dependencies>({});

  // `isReady` is true when all dependencies were checked
  const isReady = !Object.values<DependencyState | undefined>(dependencies).includes(undefined);

  const isCommonError = hasError(dependencies, "common");
  const isIosError = hasError(dependencies, "ios");
  const isAndroidError = hasError(dependencies, "android");

  const androidEmulatorError = dependencies.AndroidEmulator?.error;
  const iosSimulatorError = dependencies.Xcode?.error;

  const rerunDiagnostics = useCallback(() => {
    // reset `.installed` and .error, leave other data as is
    setDependencies((prevState) => {
      const newState: Dependencies = {};
      for (const [dependency, data] of entries(prevState)) {
        newState[dependency] = {
          ...data,
          installed: InstallationStatus.NotInstalled,
          error: undefined,
        };
      }
      return newState;
    });

    runDiagnostics();
  }, []);

  const updateDependency = useCallback(
    (name: keyof Dependencies, newState: Partial<DependencyState>) => {
      setDependencies((prev) => ({
        ...prev,
        [name]: { ...prev[name], ...newState },
      }));
    },
    [setDependencies]
  );

  useEffect(() => {
    const listener = (event: MessageEvent<DependencyMessageData>) => {
      const { command, data: rawData } = event.data;
      if (!rawData) {
        return;
      }
      const data = adaptDependencyData(rawData);
      switch (command) {
        case "isNodejsInstalled":
          updateDependency("Nodejs", data);
          break;
        case "isAndroidEmulatorInstalled":
          updateDependency("AndroidEmulator", data);
          break;
        case "isXcodeInstalled":
          updateDependency("Xcode", data);
          break;
        case "isCocoaPodsInstalled":
          updateDependency("CocoaPods", data);
          break;
        case "isNodeModulesInstalled":
          updateDependency("NodeModules", data);
          break;
        case "installingNodeModules":
          updateDependency("NodeModules", { installed: InstallationStatus.InProgress });
          break;
        case "isReactNativeInstalled":
          updateDependency("ReactNative", data);
          break;
        case "isExpoInstalled":
          updateDependency("Expo", data);
          break;
        case "isPodsInstalled":
          updateDependency("Pods", data);
          break;
        case "installingPods":
          updateDependency("Pods", { error: undefined, installed: InstallationStatus.InProgress });
          break;
      }
    };

    runDiagnostics();
    window.addEventListener("message", listener);

    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <DependenciesContext.Provider
      value={{
        dependencies,
        isReady,
        isCommonError,
        isAndroidError,
        isIosError,
        androidEmulatorError,
        iosSimulatorError,
        runDiagnostics: rerunDiagnostics,
      }}>
      {children}
    </DependenciesContext.Provider>
  );
}

export function useDependencies() {
  const context = useContext(DependenciesContext);

  if (context === undefined) {
    throw new Error("useDependencies must be used within a DependenciesProvider");
  }

  return context;
}
