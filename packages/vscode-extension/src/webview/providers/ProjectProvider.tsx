import { PropsWithChildren, useContext, createContext, useState, useEffect } from "react";
import { makeProxy } from "../utilities/rpc";
import { DeviceSettings, ProjectInterface, ProjectState } from "../../common/Project";

const project = makeProxy<ProjectInterface>("Project");

interface ProjectContextProps {
  projectState: ProjectState;
  deviceSettings: DeviceSettings;
  project: ProjectInterface;
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
    biometricEnrollment: false,
    location: {
      latitude: 50.048653,
      longitude: 19.965474,
      isDisabled: false,
    },
  },
  project,
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
    biometricEnrollment: false,
    location: {
      latitude: 50.048653,
      longitude: 19.965474,
      isDisabled: false,
    },
  });

  useEffect(() => {
    project.getProjectState().then(setProjectState);
    project.addListener("projectStateChanged", setProjectState);

    project.getDeviceSettings().then(setDeviceSettings);
    project.addListener("deviceSettingsChanged", setDeviceSettings);

    return () => {
      project.removeListener("projectStateChanged", setProjectState);
      project.removeListener("deviceSettingsChanged", setDeviceSettings);
    };
  }, []);

  return (
    <ProjectContext.Provider value={{ projectState, deviceSettings, project }}>
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
