import { Disposable, WorkspaceConfiguration } from "vscode";
import { Devtools } from "./devtools";
import { EventEmitter } from "stream";
import type { DeviceInfo } from "../common/DeviceManager";
import type { DeviceSettings, ProjectState } from "../common/Project";

type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SourceLocation = {
  fileName: number;
  line0Based: number;
  column0Based: number;
};

type Event = {
  // app -> extension
  RNIDE_appReady: never;
  RNIDE_fastRefreshStarted: never;
  RNIDE_fastRefreshComplete: never;
  RNIDE_navigationChanged: { displayName: string; id: string };
  RNIDE_inspectData: {
    id: number;
    frame: Frame;
    stack: {
      componentName: string;
      source: SourceLocation;
      frame: Frame;
    };
  };
  // extension -> app
  RNIDE_openPreview: { previewId: string };
  RNIDE_openUrl: { url: string };
  RNIDE_openNavigation: { id: string };
  RNIDE_inspect: { id: number; x: number; y: number; requestStack: boolean };
  RNIDE_iosDevMenu: never;
  // extension -> webview
  devicesChanged: DeviceInfo[];
  deviceRemoved: DeviceInfo;
  configChange: WorkspaceConfiguration;
  navigationChanged: { displayName: string; id: string };
  log: string;
  deviceSettingsChanged: DeviceSettings;
  projectStateChanged: ProjectState;
  needsNativeRebuild: never;
};
const events: (keyof Event)[] = [
  "RNIDE_appReady",
  "RNIDE_fastRefreshStarted",
  "RNIDE_fastRefreshComplete",
  "RNIDE_navigationChanged",
  "RNIDE_inspectData",
  "RNIDE_openPreview",
  "RNIDE_openUrl",
  "RNIDE_openNavigation",
  "RNIDE_inspect",
  "RNIDE_iosDevMenu",
  "devicesChanged",
  "deviceRemoved",
  "configChange",
  "navigationChanged",
  "log",
  "deviceSettingsChanged",
  "projectStateChanged",
  "needsNativeRebuild",
] as const;

function isEvent(event: string): event is keyof Event {
  return (events as string[]).includes(event);
}

/** Notifier is asymmetric – it dispatches all received events to all listeners
 * (from both extension and app context) but splits sending them between
 * extension and app to avoid unnecessary roundtrips for messages that won't be
 * handled anyway.
 */
export class Notifier implements Disposable {
  private devtools = new Devtools();

  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor() {
    this.devtools.start();
    this.devtools.addListener((event, payload) => {
      if (!isEvent(event)) {
        throw new Error("Unrecognized event type: " + event);
      }
      this.dispatchEvent(event, payload);
    });
  }

  get connectedToApp() {
    return this.devtools.hasConnectedClient;
  }

  private dispatchEvent(event: keyof Event, payload: Event[keyof Event]) {
    this.listeners.get(event)!.forEach((listener) => listener(payload, event));
  }

  send<E extends keyof Event>(event: E, message: Event[E]) {
    this.dispatchEvent(event, message);
  }

  async sendToApp<E extends keyof Event>(event: E, message: Event[E]) {
    await this.devtools.ready();
    this.devtools.send(event, message);
  }

  listen<E extends keyof Event>(
    event: E,
    handler: (payload: Event[E], event: E) => void,
    options: { once?: true } = {}
  ): () => void {
    const listeners = this.listeners.get(event)!;
    let listener = handler;

    if (options?.once) {
      listener = (payload, handledEvent) => {
        handler(payload, handledEvent);
        listeners.delete(listener);
      };
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  dispose() {
    this.devtools.dispose();
    this.listeners = null!;
  }
}
