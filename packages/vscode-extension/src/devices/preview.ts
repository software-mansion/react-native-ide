import path from "path";
import { Disposable, workspace } from "vscode";
import { exec, ChildProcess, lineReader } from "../utilities/subprocess";
import { extensionContext } from "../utilities/extensionContext";
import { Logger } from "../Logger";
import { Platform } from "../utilities/platform";
import { RecordingData, TouchPoint } from "../common/Project";

interface ReplayPromiseHandlers {
  resolve: (value: RecordingData) => void;
  reject: (reason?: any) => void;
}

export class Preview implements Disposable {
  private subprocess?: ChildProcess;
  public streamURL?: string;
  private lastReplayPromise?: ReplayPromiseHandlers;

  constructor(private args: string[]) {}

  dispose() {
    this.subprocess?.kill();
  }

  async start() {
    const simControllerBinary = path.join(
      extensionContext.extensionPath,
      "dist",
      Platform.select({ macos: "sim-server-executable", windows: "sim-server-executable.exe" })
    );

    Logger.debug(`Launch preview ${simControllerBinary} ${this.args}`);

    const subprocess = exec(simControllerBinary, this.args, {
      buffer: false,
    });
    this.subprocess = subprocess;

    return new Promise<string>((resolve, reject) => {
      subprocess.catch(reject).then(() => {
        // we expect the preview server to produce a line with the URL
        // if it doesn't do that and exists w/o error, we still want to reject
        // the promise to prevent the caller from waiting indefinitely
        reject(new Error("Preview server exited without URL"));
      });

      lineReader(subprocess).onLineRead((line, stderr) => {
        if (stderr) {
          Logger.info("sim-server:", line);
          return;
        }

        if (line.includes("stream_ready")) {
          const streamURLRegex = /(http:\/\/[^ ]*stream\.mjpeg)/;
          const match = line.match(streamURLRegex);

          if (match) {
            Logger.info(`Stream ready ${match[1]}`);

            this.streamURL = match[1];
            resolve(this.streamURL);
          }
        } else if (line.includes("video_ready replay") || line.includes("video_error replay")) {
          // video response format for replays looks as follows:
          // video_ready replay <HTTP_URL> <FILE_URL>
          // video_error replay <Error message>
          const videoReadyMatch = line.match(/video_ready replay\S+ (\S+) (\S+)/);
          const videoErrorMatch = line.match(/video_error replay\S+ (.*)/);

          const handlers = this.lastReplayPromise;
          this.lastReplayPromise = undefined;

          if (handlers && videoReadyMatch) {
            // match array looks as follows:
            // [0] - full match
            // [1] - URL or error message
            // [2] - File URL
            const tempFileLocation = videoReadyMatch[2];
            const ext = path.extname(tempFileLocation);
            const fileName = workspace.name
              ? `${workspace.name}-RadonIDE-replay${ext}`
              : `RadonIDE-replay${ext}`;
            handlers.resolve({
              url: videoReadyMatch[1],
              tempFileLocation,
              fileName,
            });
          } else if (handlers && videoErrorMatch) {
            handlers.reject(new Error(videoErrorMatch[1]));
          }
        }
        Logger.info("sim-server:", line);
      });
    });
  }

  static replayID = 0;

  public startReplays() {
    const stdin = this.subprocess?.stdin;
    if (!stdin) {
      throw new Error("sim-server process not available");
    }
    stdin.write(`video replay_${++Preview.replayID} start -m -b 50\n`); // 50MB buffer for in-memory video
  }

  public stopReplays() {
    const stdin = this.subprocess?.stdin;
    if (!stdin) {
      throw new Error("sim-server process not available");
    }
    stdin.write(`video replay_${Preview.replayID} stop\n`);
  }

  public captureReplay() {
    const stdin = this.subprocess?.stdin;
    if (!stdin) {
      throw new Error("sim-server process not available");
    }
    let resolvePromise: (value: RecordingData) => void;
    let rejectPromise: (reason?: any) => void;
    const promise = new Promise<RecordingData>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    if (this.lastReplayPromise) {
      promise.then(this.lastReplayPromise.resolve, this.lastReplayPromise.reject);
    }
    this.lastReplayPromise = { resolve: resolvePromise!, reject: rejectPromise! };
    stdin.write(`video replay_${Preview.replayID} stop\n`);
    // immediately restart replays
    this.startReplays();
    return promise;
  }

  public sendTouches(touches: Array<TouchPoint>, type: "Up" | "Move" | "Down") {
    const touchesCoords = touches.map((pt) => `${pt.xRatio},${pt.yRatio}`).join(" ");
    this.subprocess?.stdin?.write(`touch ${type} ${touchesCoords}\n`);
  }

  public sendKey(keyCode: number, direction: "Up" | "Down") {
    this.subprocess?.stdin?.write(`key ${direction} ${keyCode}\n`);
  }

  public sendPaste(text: string) {
    this.subprocess?.stdin?.write(`paste ${text}\n`);
  }
}
