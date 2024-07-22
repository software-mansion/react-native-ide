import { Disposable, WorkspaceConfiguration } from "vscode";
import { Devtools } from "./devtools";
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
  RNIDE_appReady: undefined;
  RNIDE_fastRefreshStarted: undefined;
  RNIDE_fastRefreshComplete: undefined;
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
  RNIDE_iosDevMenu: undefined;
  RNIDE_editorFileChanged: { filename: string; followEnabled: boolean };
  // extension -> webview
  devicesChanged: DeviceInfo[];
  deviceRemoved: DeviceInfo;
  configChange: WorkspaceConfiguration;
  navigationChanged: { displayName: string; id: string };
  log: string;
  deviceSettingsChanged: DeviceSettings;
  projectStateChanged: ProjectState;
  needsNativeRebuild: undefined;
};
type EventName = keyof Event;

const uncheckedEvents = [
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
  "RNIDE_editorFileChanged",
  "devicesChanged",
  "deviceRemoved",
  "configChange",
  "navigationChanged",
  "log",
  "deviceSettingsChanged",
  "projectStateChanged",
  "needsNativeRebuild",
] as const;
type EnsureKeys<A extends readonly unknown[], K extends A[number]> = readonly K[];
const events: EnsureKeys<typeof uncheckedEvents, EventName> = uncheckedEvents;

function isKnownEvent(event: string): event is EventName {
  return (events as readonly string[]).includes(event);
}

type SendArgs<E extends EventName, M = Event[E]> = M extends undefined
  ? [event: E]
  : [event: E, message: M];

/** Notifier is asymmetric – it dispatches all received events to all listeners
 * (from both extension and app context) but splits sending them between
 * extension and app to avoid unnecessary roundtrips for messages that won't be
 * handled anyway.
 */
export class Notifier implements Disposable {
  private devtools = new Devtools();

  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor() {
    events.forEach((event) => this.listeners.set(event, new Set()));
    this.devtools.start();
    this.devtools.addListener((event, payload) => {
      if (isKnownEvent(event)) {
        this.dispatchEvent(event, payload);
      }
    });
  }

  get connectedToApp() {
    return this.devtools.hasConnectedClient;
  }

  get devtoolsPort() {
    return this.devtools.port;
  }

  public async ready() {
    await this.devtools.ready();
  }

  private dispatchEvent(event: EventName, payload: Event[EventName]) {
    this.listeners.get(event)!.forEach((listener) => listener(payload, event));
  }

  send<E extends EventName, M extends Event[E]>(...[event, message]: SendArgs<E, M>) {
    this.dispatchEvent(event, message);
  }

  sendToApp<E extends EventName, M extends Event[E]>(...[event, message]: SendArgs<E, M>) {
    this.devtools.send(event, message);
  }

  listen<E extends EventName>(
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
