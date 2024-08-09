import { PropsWithChildren, useContext, createContext, useState, useEffect } from "react";
import { makeProxy } from "../utilities/rpc";
import {
  BiometricEnrolment,
  DeviceSettings,
  ProjectInterface,
  ProjectState,
} from "../../common/Project";
import { DevicePlatform } from "../../common/DeviceManager";

const project = makeProxy<ProjectInterface>("Project");

interface ProjectContextProps {
  projectState: ProjectState;
  deviceSettings: DeviceSettings;
  project: ProjectInterface;
  biometricEnrollment: BiometricEnrolment;
}

const ProjectContext = createContext<ProjectContextProps>({
  projectState: {
    status: "starting",
    previewURL: undefined,
    selectedDevice: undefined,
    previewZoom: undefined,
  },
  deviceSettings: {
    appearance: "dark",
    contentSize: "normal",
    location: {
      latitude: 50.048653,
      longitude: 19.965474,
      isDisabled: false,
    },
  },
  project,
  biometricEnrollment: { android: false, ios: false },
});

export default function ProjectProvider({ children }: PropsWithChildren) {
  const [projectState, setProjectState] = useState<ProjectState>({
    status: "starting",
    previewURL: undefined,
    selectedDevice: undefined,
    previewZoom: undefined,
  });
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({
    appearance: "dark",
    contentSize: "normal",
    location: {
      latitude: 50.048653,
      longitude: 19.965474,
      isDisabled: false,
    },
  });

  const [biometricEnrollment, setBiometricEnrollment] = useState<BiometricEnrolment>({
    android: false,
    ios: false,
  });

  useEffect(() => {
    project.getProjectState().then(setProjectState);
    project.addListener("projectStateChanged", setProjectState);

    project.getBiometricEnrollment().then(setBiometricEnrollment);
    project.addListener("biometricEnrollmentChanged", setBiometricEnrollment);

    project.getDeviceSettings().then(setDeviceSettings);
    project.addListener("deviceSettingsChanged", setDeviceSettings);

    return () => {
      project.removeListener("projectStateChanged", setProjectState);
      project.removeListener("deviceSettingsChanged", setDeviceSettings);
      project.removeListener("biometricEnrollmentChanged", setBiometricEnrollment);
    };
  }, []);

  return (
    <ProjectContext.Provider value={{ projectState, deviceSettings, project, biometricEnrollment }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);

  if (context === undefined) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
