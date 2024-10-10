import { PropsWithChildren, useContext, createContext, useState, useEffect } from "react";
import { makeProxy } from "../utilities/rpc";
import { DeviceSettings, ProjectInterface, ProjectState } from "../../common/Project";

const project = makeProxy<ProjectInterface>("Project");

interface ProjectContextProps {
  projectState: ProjectState;
  deviceSettings: DeviceSettings;
  project: ProjectInterface;
}

const defaultProjectState: ProjectState = {
  status: "starting",
  previewURL: undefined,
  selectedDevice: undefined,
  previewZoom: undefined,
};

const defaultDeviceSettings: DeviceSettings = {
  appearance: "dark",
  contentSize: "normal",
  hasEnrolledBiometrics: false,
  location: {
    latitude: 50.048653,
    longitude: 19.965474,
    isDisabled: false,
  },
  locale: "en_US",
  replaysEnabled: false,
};

const ProjectContext = createContext<ProjectContextProps>({
  projectState: defaultProjectState,
  deviceSettings: defaultDeviceSettings,
  project,
});

export default function ProjectProvider({ children }: PropsWithChildren) {
  const [projectState, setProjectState] = useState<ProjectState>(defaultProjectState);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>(defaultDeviceSettings);

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
