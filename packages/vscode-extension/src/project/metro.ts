import path from "path";
import { Disposable, Uri, workspace } from "vscode";
import { exec, ChildProcess, lineReader } from "../utilities/subprocess";
import { Logger } from "../Logger";
import { extensionContext, getAppRootFolder } from "../utilities/extensionContext";
import { Devtools } from "./devtools";
import stripAnsi from "strip-ansi";
import { getLaunchConfiguration } from "../utilities/launchConfiguration";
import fs from "fs";

export interface MetroDelegate {
  onBundleError(): void;
  onIncrementalBundleError(message: string, errorModulePath: string): void;
}

export type MetroCDPTargetInfo = {
  reactNativeDebuggerWsURL: string;
  usesNewDebugger: boolean;
  reanimatedDebuggerWsURL?: string;
};

interface CDPTargetDescription {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
  [key: string]: any; // To allow for any additional properties
}

type MetroEvent =
  | {
      type: "bundle_build_failed"; // related to bundleError status
    }
  | {
      type: "bundling_error"; // related to incrementalBundleError status
      message: string;
      stack: string;
      error: {
        message: string;
        originModulePath: string;
        targetModuleName: string;
        errors: {
          description: string;
        }[];
      };
    }
  | {
      type: "bundle_transform_progressed";
      transformedFileCount: number;
      totalFileCount: number;
    }
  | {
      type: "RNIDE_initialize_done";
      port: number;
    }
  | {
      type: "client_log";
      level: "error";
      data: [
        string, // message
        string, // bundle
        string, // todo: ensure what this field means
        string // todo: ensure what this field means
      ];
    };

export class Metro implements Disposable {
  private subprocess?: ChildProcess;
  private _port = 0;
  private startPromise: Promise<void> | undefined;

  constructor(private readonly devtools: Devtools, private readonly delegate: MetroDelegate) {}

  public get port() {
    return this._port;
  }

  public dispose() {
    this.subprocess?.kill(9);
  }

  public async ready() {
    if (!this.startPromise) {
      throw new Error("metro not started");
    }
    await this.startPromise;
  }

  public async start(
    resetCache: boolean,
    progressListener: (newStageProgress: number) => void,
    dependencies: Promise<any>[]
  ) {
    if (this.startPromise) {
      throw new Error("metro already started");
    }
    this.startPromise = this.startInternal(resetCache, progressListener, dependencies);
    return this.startPromise;
  }

  private launchExpoMetro(
    appRootFolder: string,
    libPath: string,
    resetCache: boolean,
    metroEnv: typeof process.env
  ) {
    return exec("node", [path.join(libPath, "expo_start.js"), ...(resetCache ? ["--clear"] : [])], {
      cwd: appRootFolder,
      env: metroEnv,
      buffer: false,
    });
  }

  private launchPackager(
    appRootFolder: string,
    libPath: string,
    resetCache: boolean,
    metroEnv: typeof process.env
  ) {
    const reactNativeRoot = path.dirname(
      require.resolve("react-native", { paths: [appRootFolder] })
    );
    return exec(
      "node",
      [
        path.join(reactNativeRoot, "cli.js"),
        "start",
        ...(resetCache ? ["--reset-cache"] : []),
        "--no-interactive",
        "--port",
        "0",
        "--config",
        path.join(libPath, "metro_config.js"),
        "--customLogReporterPath",
        path.join(libPath, "metro_reporter.js"),
      ],
      {
        cwd: appRootFolder,
        env: metroEnv,
        buffer: false,
      }
    );
  }

  public async startInternal(
    resetCache: boolean,
    progressListener: (newStageProgress: number) => void,
    dependencies: Promise<any>[]
  ) {
    const appRootFolder = getAppRootFolder();
    const launchConfiguration = getLaunchConfiguration();
    await Promise.all([this.devtools.ready()].concat(dependencies));

    const libPath = path.join(extensionContext.extensionPath, "lib");
    let metroConfigPath: string | undefined;
    if (launchConfiguration.metroConfigPath) {
      metroConfigPath = findCustomMetroConfig(launchConfiguration.metroConfigPath);
    }
    const metroEnv = {
      ...launchConfiguration.env,
      ...(metroConfigPath ? { RN_IDE_METRO_CONFIG_PATH: metroConfigPath } : {}),
      NODE_PATH: path.join(appRootFolder, "node_modules"),
      RCT_METRO_PORT: "0",
      RCT_DEVTOOLS_PORT: this.devtools.port.toString(),
      REACT_NATIVE_IDE_LIB_PATH: libPath,
    };
    let bundlerProcess: ChildProcess;

    if (shouldUseExpoCLI()) {
      bundlerProcess = this.launchExpoMetro(appRootFolder, libPath, resetCache, metroEnv);
    } else {
      bundlerProcess = this.launchPackager(appRootFolder, libPath, resetCache, metroEnv);
    }
    this.subprocess = bundlerProcess;

    const initPromise = new Promise<void>((resolve, reject) => {
      // reject if process exits
      bundlerProcess
        .catch((reason) => {
          Logger.error("Metro exited unexpectedly", reason);
          reject(new Error(`Metro exited with code ${reason.exitCode}: ${reason.message}`));
        })
        .then(() => {
          // we expect metro to produce a line with the port number indicating it started
          // sucessfully. However, if it doesn't produce that line and exists, the promise
          // would be waiting indefinitely, so we reject it in that case as well.
          reject(new Error("Metro exited but did not start server successfully."));
        });

      lineReader(bundlerProcess, true).onLineRead((line) => {
        try {
          const event = JSON.parse(line) as MetroEvent;
          if (event.type === "bundle_transform_progressed") {
            // Because totalFileCount grows as bundle_transform progresses at the begining there are a few logs that indicate 100% progress thats why we ignore them
            if (event.totalFileCount > 10) {
              progressListener(event.transformedFileCount / event.totalFileCount);
            }
          } else if (event.type === "client_log" && event.level === "error") {
            Logger.error(stripAnsi(event.data[0]));
          } else {
            Logger.debug("Metro", line);
          }

          switch (event.type) {
            case "RNIDE_initialize_done":
              this._port = event.port;
              Logger.info(`Metro started on port ${this._port}`);
              resolve();
              break;
            case "bundle_build_failed":
              this.delegate.onBundleError();
              break;
            case "bundling_error":
              this.delegate.onIncrementalBundleError(event.message, event.error.originModulePath);
              break;
          }
        } catch (error) {
          // ignore parsing errors, just print out the line
          Logger.debug("Metro", line);
        }
      });
    });

    return initPromise;
  }

  public async reload() {
    const appReady = this.devtools.appReady();
    await fetch(`http://localhost:${this._port}/reload`);
    await appReady;
  }

  public async getCDPTargetInfo() {
    const WAIT_FOR_DEBUGGER_TIMEOUT_MS = 15_000;

    const startTime = Date.now();
    let cdpTargetInfo: MetroCDPTargetInfo | undefined;
    while (!cdpTargetInfo && Date.now() - startTime < WAIT_FOR_DEBUGGER_TIMEOUT_MS) {
      cdpTargetInfo = await this.fetchCDPTargetInfo();
      await new Promise((res) => setTimeout(res, 1000));
    }
    return cdpTargetInfo;
  }

  private lookupWsAddressForOldDebugger(listJson: CDPTargetDescription[]) {
    // Pre 0.76 RN metro lists debugger pages that are identified as "deviceId-pageId"
    // After new device is connected, the deviceId is incremented while pageId could be
    // either 1 or -1 where "-1" corresponds to connection that supports reloads.
    // We search for the most recent device id and want to use special -1 page identifier (reloadable page)
    let recentDeviceId = -1;
    let websocketAddress: string | undefined;
    for (const page of listJson) {
      // pageId can sometimes be negative so we can't just use .split('-') here
      const matches = page.id.match(/([^-]+)-(-?\d+)/);

      if (!matches) continue;
      const pageId = parseInt(matches[2]);
      if (pageId !== -1) continue;
      //If deviceId is a number we want to pick the highest one, with expo it's never a number and we pick the latest record
      if (Number.isInteger(matches[1])) {
        const deviceId = parseInt(matches[1]);
        if (deviceId < recentDeviceId) {
          continue;
        }
        recentDeviceId = deviceId;
      }
      websocketAddress = page.webSocketDebuggerUrl;
    }
    return websocketAddress;
  }

  private lookupWsAddressForNewDebugger(listJson: CDPTargetDescription[]) {
    // in the new debugger, ids are generated in the following format: "deviceId-pageId"
    // but unlike with the old debugger, deviceId is a hex string (UUID most likely)
    // that is stable between reloads.
    // Subsequent runtimes that register get incremented pageId (e.g. main runtime will
    // be 1, reanimated worklet runtime would get 2, etc.)
    // The most recent runtimes are listed first, so we can pick the first one with title
    // that that starts with "React Native Bridge" (which is the main runtime)
    for (const page of listJson) {
      if (page.reactNative && page.title.startsWith("React Native Bridge")) {
        // we search for Reanimated runtime matching logicalDeviceId (logical idenitfier for the device)
        let reanimatedWsAddress: string | undefined;
        for (const page2 of listJson) {
          if (
            page2.reactNative &&
            page2.reactNative.logicalDeviceId === page.reactNative.logicalDeviceId &&
            page2.title.startsWith("Reanimated")
          ) {
            reanimatedWsAddress = page2.webSocketDebuggerUrl;
            break;
          }
        }
        return [page.webSocketDebuggerUrl, reanimatedWsAddress];
      }
    }
    return [undefined, undefined];
  }

  private ensureWsAddressIsLocal<T extends string | undefined>(websocketAddress: T) {
    if (!websocketAddress) {
      return undefined;
    }
    // Port and host in webSocketDebuggerUrl are set manually to match current metro address,
    // because we always know what the correct one is and some versions of RN are sending out wrong port (0 or 8081)
    const websocketDebuggerUrl = new URL(websocketAddress);
    // replace port number with metro port number:
    websocketDebuggerUrl.port = this._port.toString();
    // replace host with localhost:
    websocketDebuggerUrl.host = "localhost";
    return websocketDebuggerUrl.toString();
  }

  private async fetchCDPTargetInfo() {
    // query list from http://localhost:${metroPort}/json/list
    const list = await fetch(`http://localhost:${this._port}/json/list`);
    const listJson = await list.json();

    // we try using "new debugger" lookup first, and then switch to trying out
    // the old debugger connection (we can tell by the page naming scheme whether
    // it's the old or new debugger)
    const [newDebuggerWsAddress, reanimatedDebuggerWsAddress] =
      this.lookupWsAddressForNewDebugger(listJson);
    if (newDebuggerWsAddress) {
      return {
        reactNativeDebuggerWsURL: this.ensureWsAddressIsLocal(newDebuggerWsAddress),
        usesNewDebugger: true,
        reanimatedDebuggerWsURL: this.ensureWsAddressIsLocal(reanimatedDebuggerWsAddress),
      } as MetroCDPTargetInfo;
    }

    const oldWebSocketAddress = this.lookupWsAddressForOldDebugger(listJson);
    if (oldWebSocketAddress) {
      return {
        reactNativeDebuggerWsURL: this.ensureWsAddressIsLocal(oldWebSocketAddress),
        usesNewDebugger: false,
      } as MetroCDPTargetInfo;
    }

    return null;
  }
}

function findCustomMetroConfig(configPath: string) {
  for (const folder of workspace.workspaceFolders ?? []) {
    const possibleMetroConfigLocation = Uri.joinPath(folder.uri, configPath);
    if (fs.existsSync(possibleMetroConfigLocation.fsPath)) {
      return possibleMetroConfigLocation.fsPath;
    }
  }
  throw new Error("Metro config cannot be found, please check if `metroConfigPath` path is valid");
}

function shouldUseExpoCLI() {
  // The mechanism for detecting whether the project should use Expo CLI or React Native Community CLI works as follows:
  // We check launch configuration, which has an option to force Expo CLI, we verify that first and if it is set to true we use Expo CLI.
  // When the Expo option isn't set, we need all of the below checks to be true in order to use Expo CLI:
  // 1. expo cli package is present in the app's node_modules (we can resolve it using require.resolve)
  // 2. package.json has expo scripts in it (i.e. "expo start" or "expo build" scripts are present in the scripts section of package.json)
  // 3. the user doesn't use a custom metro config option – this is only available for RN CLI projects
  const config = getLaunchConfiguration();
  if (config.isExpo) {
    return true;
  }

  if (config.metroConfigPath) {
    return false;
  }

  const appRootFolder = getAppRootFolder();
  let hasExpoCLIInstalled = false,
    hasExpoCommandsInScripts = false;
  try {
    hasExpoCLIInstalled =
      require.resolve("@expo/cli/build/src/start/index", {
        paths: [appRootFolder],
      }) !== undefined;
  } catch (e) {}

  try {
    const packageJson = require(path.join(appRootFolder, "package.json"));
    hasExpoCommandsInScripts = Object.values<string>(packageJson.scripts).some((script: string) => {
      return script.includes("expo ");
    });
  } catch (e) {}

  return hasExpoCLIInstalled && hasExpoCommandsInScripts;
}
