import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

import DevicesProvider from "./providers/DevicesProvider";
import DependenciesProvider from "./providers/DependenciesProvider";
import ModalProvider from "./providers/ModalProvider";
import ProjectProvider from "./providers/ProjectProvider";
import AlertProvider from "./providers/AlertProvider";
import WorkspaceConfigProvider from "./providers/WorkspaceConfigProvider";

import "./styles/theme.css";
import UtilsProvider from "./providers/UtilsProvider";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ProjectProvider>
      <UtilsProvider>
        <WorkspaceConfigProvider>
          <DevicesProvider>
            <DependenciesProvider>
              <ModalProvider>
                <AlertProvider>
                  <App />
                </AlertProvider>
              </ModalProvider>
            </DependenciesProvider>
          </DevicesProvider>
        </WorkspaceConfigProvider>
      </UtilsProvider>
    </ProjectProvider>
  </React.StrictMode>
);
