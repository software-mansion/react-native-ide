import {
  commands,
  languages,
  debug,
  window,
  workspace,
  Uri,
  ExtensionContext,
  ExtensionMode,
  ConfigurationChangeEvent,
  DebugConfigurationProviderTriggerKind,
  DebugAdapterExecutable,
} from "vscode";
import vscode from "vscode";
import { TabPanel } from "./panels/Tabpanel";
import { PreviewCodeLensProvider } from "./providers/PreviewCodeLensProvider";
import { DebugConfigProvider } from "./providers/DebugConfigProvider";
import { DebugAdapterDescriptorFactory } from "./debugging/DebugAdapterDescriptorFactory";
import { Logger, enableDevModeLogging } from "./Logger";
import {
  extensionContext,
  setAppRootFolder,
  setExtensionContext,
} from "./utilities/extensionContext";
import { command } from "./utilities/subprocess";
import path from "path";
import os from "os";
import fs from "fs";
import { SidePanelViewProvider } from "./panels/SidepanelViewProvider";
import { PanelLocation } from "./common/WorkspaceConfig";
import { getDefaultLaunchConfiguration } from "./utilities/launchConfiguration";
import { Project } from "./project/project";
import { findSingleFileInWorkspace } from "./utilities/common";

const BIN_MODIFICATION_DATE_KEY = "bin_modification_date";
const OPEN_PANEL_ON_ACTIVATION = "open_panel_on_activation";

function handleUncaughtErrors() {
  process.on("unhandledRejection", (error) => {
    Logger.error("Unhandled promise rejection", error);
  });
  process.on("uncaughtException", (error: Error) => {
    // @ts-ignore
    if (error.errno === -49) {
      // there is some weird EADDRNOTAVAIL uncaught error thrown in extension host
      // that does not seem to affect anything yet it gets reported here while not being
      // super valuable to the user – hence we ignore it.
      return;
    }
    Logger.error("Uncaught exception", error);
    Logger.openOutputPanel();
    window.showErrorMessage("Internal extension error.", "Dismiss");
  });
}

export function deactivate(context: ExtensionContext): undefined {
  TabPanel.currentPanel?.dispose();
  SidePanelViewProvider.currentProvider?.dispose();
  commands.executeCommand("setContext", "RNIDE.extensionIsActive", false);
  commands.executeCommand("setContext", "RNIDE.sidePanelIsClosed", false);
  return undefined;
}

export async function activate(context: ExtensionContext) {
  handleUncaughtErrors();

  if (process.platform !== "darwin") {
    window.showErrorMessage("React Native IDE works only on macOS.", "Dismiss");
    return;
  }

  setExtensionContext(context);
  if (context.extensionMode === ExtensionMode.Development) {
    enableDevModeLogging();
  }

  try {
    await fixBinaries(context);
  } catch (error) {
    Logger.error("Error when processing simulator-server binaries", error);
    // we let the activation continue, as otherwise the diagnostics command would fail
  }

  commands.executeCommand("setContext", "RNIDE.sidePanelIsClosed", false);

  async function showIDEPanel(fileName?: string, lineNumber?: number) {
    commands.executeCommand("setContext", "RNIDE.sidePanelIsClosed", false);
    const panelLocation = workspace
      .getConfiguration("ReactNativeIDE")
      .get<PanelLocation>("panelLocation");

    if (panelLocation !== "tab") {
      SidePanelViewProvider.showView(context, fileName, lineNumber);
    } else {
      TabPanel.render(context, fileName, lineNumber);
    }
  }

  async function closeIDEPanel(fileName?: string, lineNumber?: number) {
    const panelLocation = workspace
      .getConfiguration("ReactNativeIDE")
      .get<PanelLocation>("panelLocation");

    if (panelLocation !== "tab") {
      commands.executeCommand("setContext", "RNIDE.sidePanelIsClosed", true);
    } else {
      TabPanel.currentPanel?.dispose();
    }
  }

  function closeWithConfirmation() {
    window
      .showWarningMessage("Are you sure you want to close the IDE panel?", "Yes", "No")
      .then((item) => {
        if (item === "Yes") {
          commands.executeCommand("RNIDE.closePanel");
        }
      });
  }

  context.subscriptions.push(
    window.registerWebviewViewProvider(
      SidePanelViewProvider.viewType,
      new SidePanelViewProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  context.subscriptions.push(commands.registerCommand("RNIDE.openDevMenu", openDevMenu));
  context.subscriptions.push(commands.registerCommand("RNIDE.closePanel", closeIDEPanel));
  context.subscriptions.push(commands.registerCommand("RNIDE.openPanel", showIDEPanel));
  context.subscriptions.push(commands.registerCommand("RNIDE.showPanel", showIDEPanel));
  context.subscriptions.push(
    commands.registerCommand("RNIDE.closeWithConfirmation", closeWithConfirmation)
  );
  context.subscriptions.push(
    commands.registerCommand("RNIDE.diagnose", diagnoseWorkspaceStructure)
  );

  // Debug adapter used by custom launch configuration, we register it in case someone tries to run the IDE configuration
  // The current workflow is that people shouldn't run it, but since it is listed under launch options it might happen
  // When it does happen, we open the IDE panel and restart the app.
  context.subscriptions.push(
    debug.registerDebugAdapterDescriptorFactory(
      "react-native-ide",
      new LaunchConfigDebugAdapterDescriptorFactory()
    )
  );

  // Debug adapter used for debugging React Native apps
  context.subscriptions.push(
    debug.registerDebugConfigurationProvider(
      "com.swmansion.react-native-ide",
      new DebugConfigProvider(),
      DebugConfigurationProviderTriggerKind.Dynamic
    )
  );

  context.subscriptions.push(
    debug.registerDebugAdapterDescriptorFactory(
      "com.swmansion.react-native-ide",
      new DebugAdapterDescriptorFactory()
    )
  );

  context.subscriptions.push(
    languages.registerCodeLensProvider(
      [
        { scheme: "file", language: "typescriptreact" },
        { scheme: "file", language: "javascript" },
      ],
      new PreviewCodeLensProvider()
    )
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
      if (event.affectsConfiguration("ReactNativeIDE.panelLocation")) {
        showIDEPanel();
      }
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration(async (event: ConfigurationChangeEvent) => {
      if (event.affectsConfiguration("ReactNativeIDE.appRoot")) {
        await configureAppRootFolder();
      }
    })
  );

  await configureAppRootFolder();
}

class LaunchConfigDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    commands.executeCommand("RNIDE.openPanel");
    // we can't return undefined or throw here because then VSCode displays an ugly error dialog
    // so we return a dummy adapter that calls echo command and exists immediately
    return new DebugAdapterExecutable("echo", ["noop"]);
  }
}

function extensionActivated() {
  if (extensionContext.workspaceState.get(OPEN_PANEL_ON_ACTIVATION)) {
    commands.executeCommand("RNIDE.openPanel");
  }
}

async function configureAppRootFolder() {
  const appRootFolder = await findAppRootFolder();
  if (appRootFolder) {
    Logger.info(`Found app root folder: ${appRootFolder}`);
    setAppRootFolder(appRootFolder);
    commands.executeCommand("setContext", "RNIDE.extensionIsActive", true);
    extensionActivated();
  }
  return appRootFolder;
}

export async function findFolder(appRootFromLaunchConfig?: string) {
  if (appRootFromLaunchConfig) {
    let appRoot: string | undefined;
    workspace.workspaceFolders?.forEach((folder) => {
      const possibleAppRoot = Uri.joinPath(folder.uri, appRootFromLaunchConfig).fsPath;
      if (fs.existsSync(possibleAppRoot)) {
        appRoot = possibleAppRoot;
      }
    });
    if (!appRoot) {
      // when relative app location setting is set, we expect app root exists
      const openLaunchConfigButton = "Open Launch Configuration";
      window
        .showErrorMessage(
          `The app root folder does not exist in the workspace at ${appRootFromLaunchConfig}.`,
          openLaunchConfigButton
        )
        .then((item) => {
          if (item === openLaunchConfigButton) {
            commands.executeCommand("workbench.action.debug.configure");
          }
        });
      return undefined;
    }
    return appRoot;
  }

  const metroConfigUri = await findSingleFileInWorkspace(
    "**/metro.config.{js,ts}",
    "**/node_modules"
  );
  if (metroConfigUri) {
    return Uri.joinPath(metroConfigUri, "..").fsPath;
  }

  const appConfigUri = await findSingleFileInWorkspace("**/app.config.{js,ts}", "**/node_modules");
  if (appConfigUri) {
    return Uri.joinPath(appConfigUri, "..").fsPath;
  }

  const rnPackageLocation = await findSingleFileInWorkspace(
    "**/node_modules/react-native/package.json",
    null
  );
  if (rnPackageLocation) {
    return Uri.joinPath(rnPackageLocation, "../../..").fsPath;
  }

  // app json is often used in non react-native projects, but in worst case scenario we can use it as a fallback
  const appJsonUri = await findSingleFileInWorkspace("**/app.json", "**/node_modules");
  if (appJsonUri) {
    return Uri.joinPath(appJsonUri, "..").fsPath;
  }

  const manageLaunchConfigButton = "Manage Launch Configuration";
  window
    .showErrorMessage(
      `
    React Native IDE couldn't find root application folder in this workspace.\n
    Please make sure that the opened workspace contains a valid React Native or Expo project.\n
    The way extension verifies the project is by looking for either: app.json, metro.config.js,
    or node_modules/react-native folder. If your project structure is different, you can set the
    app root using launch configuration.`,
      manageLaunchConfigButton,
      "Dismiss"
    )
    .then((item) => {
      if (item === manageLaunchConfigButton) {
        commands.executeCommand("debug.addConfiguration");
      }
    });
  return undefined;
}

async function findAppRootFolder() {
  const launchConfiguration = getDefaultLaunchConfiguration();

  const appRootFolder = await findFolder(launchConfiguration.appRoot);

  return appRootFolder;
}

async function openDevMenu() {
  Project.currentProject?.openDevMenu();
}

async function diagnoseWorkspaceStructure() {
  const appRootFolder = await configureAppRootFolder();
  if (appRootFolder) {
    window
      .showInformationMessage(
        `
          Workspace structure seems to be ok.\n
          You can open the IDE Panel using the button below or from the command palette.`,
        "Open IDE Panel",
        "Cancel"
      )
      .then((item) => {
        if (item === "Open IDE Panel") {
          commands.executeCommand("RNIDE.openPanel");
        }
      });
  }
}

async function fixBinaries(context: ExtensionContext) {
  // MacOS prevents binary files from being executed when downloaded from the internet.
  // It requires notarization ticket to be available in the package where the binary was distributed
  // with. Apparently Apple does not allow for individual binary files to be notarized and only .app/.pkg and .dmg
  // files are allowed. To prevent the binary from being quarantined, we clone using byte-copy (with dd). This way the
  // quarantine attribute is removed. We try to do it only when the binary has been modified or for the new installation,
  // we detect that based on the modification date of the binary file.
  const buildBinPath = Uri.file(context.asAbsolutePath("dist/sim-server"));
  const exeBinPath = Uri.file(context.asAbsolutePath("dist/sim-server-executable"));

  // if build and exe binaries don't match, we need to clone the build binary – we always want the exe one to the exact
  // copy of the build binary:
  try {
    await command(`diff -q ${buildBinPath.fsPath} ${exeBinPath.fsPath}`);
  } catch (error) {
    // if binaries are different, diff will return non-zero code and we will land in catch clouse
    await command(`dd if=${buildBinPath.fsPath} of=${exeBinPath.fsPath}`);
  }
  await fs.promises.chmod(exeBinPath.fsPath, 0o755);
}
