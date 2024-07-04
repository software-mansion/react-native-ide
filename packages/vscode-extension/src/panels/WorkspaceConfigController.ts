import { ConfigurationChangeEvent, workspace, Disposable } from "vscode";
import {
  PanelLocation,
  WorkspaceConfig,
  WorkspaceConfigProps,
  WorkspaceConfigEventMap,
  WorkspaceConfigEventListener,
} from "../common/WorkspaceConfig";
import { EventEmitter } from "stream";
import { getLaunchConfigurations } from "../utilities/launchConfiguration";

export class WorkspaceConfigController implements Disposable, WorkspaceConfig {
  private config: WorkspaceConfigProps;
  private eventEmitter = new EventEmitter();
  private configListener: Disposable | undefined;

  constructor() {
    const configuration = workspace.getConfiguration("ReactNativeIDE");
    this.config = {
      panelLocation: configuration.get<PanelLocation>("panelLocation")!,
      launchConfigurations: getLaunchConfigurations(),
      appRoot: configuration.get<string>("appRoot")! || getLaunchConfigurations()[0].appRoot || ".",
    };

    this.configListener = workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
      if (!event.affectsConfiguration("ReactNativeIDE")) {
        return;
      }
      const config = workspace.getConfiguration("ReactNativeIDE");
      this.config = {
        panelLocation: config.get<PanelLocation>("panelLocation")!,
        launchConfigurations: getLaunchConfigurations(),
        appRoot: config.get<string>("appRoot")! || getLaunchConfigurations()[0].appRoot || ".",
      };
      this.eventEmitter.emit("configChange", this.config);
    });
  }

  async getConfig() {
    return this.config;
  }

  async update<K extends keyof WorkspaceConfigProps>(key: K, value: WorkspaceConfigProps[K]) {
    const configuration = workspace.getConfiguration("ReactNativeIDE");
    if (configuration.inspect(key as string)?.workspaceValue) {
      await configuration.update(key as string, value, false);
    } else {
      await configuration.update(key as string, value, true);
    }
  }

  async addListener<K extends keyof WorkspaceConfigEventMap>(
    eventType: K,
    listener: WorkspaceConfigEventListener<WorkspaceConfigEventMap[K]>
  ) {
    this.eventEmitter.addListener(eventType, listener);
  }

  async removeListener<K extends keyof WorkspaceConfigEventMap>(
    eventType: K,
    listener: WorkspaceConfigEventListener<WorkspaceConfigEventMap[K]>
  ) {
    this.eventEmitter.removeListener(eventType, listener);
  }

  dispose() {
    this.configListener?.dispose();
  }
}
