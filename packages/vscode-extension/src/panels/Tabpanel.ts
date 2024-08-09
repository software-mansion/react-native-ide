import {
  WebviewPanel,
  window,
  Uri,
  ViewColumn,
  ExtensionContext,
  commands,
  workspace,
  ConfigurationChangeEvent,
  Disposable,
} from "vscode";

import { extensionContext } from "../utilities/extensionContext";
import { generateWebviewContent } from "./webviewContentGenerator";
import { WebviewController } from "./WebviewController";

const OPEN_PANEL_ON_ACTIVATION = "open_panel_on_activation";

export class TabPanel implements Disposable {
  public static currentPanel: TabPanel | undefined;
  private readonly _panel: WebviewPanel;
  private webviewController: WebviewController;
  private changeViewStateDisposable: Disposable;

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    this._panel.iconPath = Uri.joinPath(context.extensionUri, "assets", "logo.svg");
    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)

    commands.executeCommand("setContext", "RNIDE.isTabPanelFocused", this._panel.active);

    this.changeViewStateDisposable = this._panel.onDidChangeViewState((e) => {
      commands.executeCommand("setContext", "RNIDE.isTabPanelFocused", this._panel.active);
    });

    this._panel.onDidDispose(() => {
      this.dispose();
    });

    // Set the HTML content for the webview panel
    this._panel.webview.html = generateWebviewContent(
      extensionContext,
      this._panel.webview,
      extensionContext.extensionUri
    );

    this.webviewController = new WebviewController(this._panel.webview);

    workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
      if (!event.affectsConfiguration("ReactNativeIDE")) {
        return;
      }
      if (workspace.getConfiguration("ReactNativeIDE").get("panelLocation") !== "tab") {
        this.dispose();
      }
    });
  }

  public static render(context: ExtensionContext, fileName?: string, lineNumber?: number) {
    if (TabPanel.currentPanel) {
      // If the webview panel already exists reveal it
      TabPanel.currentPanel._panel.reveal(ViewColumn.Beside);
    } else {
      // If a webview panel does not already exist create and show a new one

      // If there is an empty group in the editor, we will open the panel there:
      const emptyGroup = window.tabGroups.all.find((group) => group.tabs.length === 0);

      const panel = window.createWebviewPanel(
        "react-native-ide-panel",
        "React Native IDE",
        { viewColumn: emptyGroup?.viewColumn || ViewColumn.Beside },
        {
          enableScripts: true,
          localResourceRoots: [
            Uri.joinPath(context.extensionUri, "dist"),
            Uri.joinPath(context.extensionUri, "node_modules"),
          ],
          retainContextWhenHidden: true,
        }
      );
      TabPanel.currentPanel = new TabPanel(panel, context);
      context.workspaceState.update(OPEN_PANEL_ON_ACTIVATION, true);

      commands.executeCommand("workbench.action.lockEditorGroup");
    }

    if (fileName !== undefined && lineNumber !== undefined) {
      TabPanel.currentPanel.webviewController.project.startPreview(
        `preview:/${fileName}:${lineNumber}`
      );
    }
  }

  public dispose() {
    commands.executeCommand("setContext", "RNIDE.panelIsOpen", false);
    // this is triggered when the user closes the webview panel by hand, we want to reset open_panel_on_activation
    // key in this case to prevent extension from automatically opening the panel next time they open the editor
    extensionContext.workspaceState.update(OPEN_PANEL_ON_ACTIVATION, undefined);

    this.changeViewStateDisposable.dispose();
    commands.executeCommand("setContext", "RNIDE.isTabPanelFocused", false);

    TabPanel.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    //dispose of current webwiew dependencies
    this.webviewController.dispose();
  }
}
