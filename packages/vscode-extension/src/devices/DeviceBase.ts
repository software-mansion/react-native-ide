import { Disposable } from "vscode";
import { Preview } from "./preview";
import { BuildResult } from "../builders/BuildManager";
import { DeviceSettings } from "../common/Project";
import { Platform } from "../common/DeviceManager";
import { tryAcquiringLock } from "../utilities/common";

import fs from "fs";

export abstract class DeviceBase implements Disposable {
  private preview: Preview | undefined;

  protected abstract get lockFilePath(): string;

  abstract bootDevice(): Promise<void>;
  abstract changeSettings(settings: DeviceSettings): Promise<void>;
  abstract installApp(build: BuildResult, forceReinstall: boolean): Promise<void>;
  abstract launchApp(build: BuildResult, metroPort: number, devtoolsPort: number): Promise<void>;
  abstract makePreview(): Preview;
  abstract get platform(): Platform;

  async acquire() {
    return tryAcquiringLock(this.lockFilePath);
  }

  dispose() {
    // if file doesn't exist, we ignore the error in the callback
    fs.unlink(this.lockFilePath, (_err) => {});
    this.preview?.dispose();
  }

  get previewURL(): string | undefined {
    return this.preview?.streamURL;
  }

  public sendTouch(xRatio: number, yRatio: number, type: "Up" | "Move" | "Down") {
    this.preview?.sendTouch(xRatio, yRatio, type);
  }

  public sendKey(keyCode: number, direction: "Up" | "Down") {
    this.preview?.sendKey(keyCode, direction);
  }

  public sendPaste(text: string) {
    this.preview?.sendPaste(text);
  }

  async startPreview() {
    this.preview = this.makePreview();
    return this.preview.start();
  }
}
