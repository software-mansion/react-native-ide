import { Disposable } from "vscode";
import { Preview } from "./preview";
import { BuildResult } from "../builders/BuildManager";
import { AppPermissionType, DeviceSettings } from "../common/Project";
import { DevicePlatform } from "../common/DeviceManager";
import { tryAcquiringLock } from "../utilities/common";

import fs from "fs";
import path from "path";

export abstract class DeviceBase implements Disposable {
  private preview: Preview | undefined;
  private previewStartPromise: Promise<string> | undefined;
  private acquired = false;

  abstract get lockFilePath(): string;

  abstract bootDevice(): Promise<void>;
  abstract changeSettings(settings: DeviceSettings): Promise<void>;
  abstract changeBiometricAuthorizationEnrollment(biometricEnrollment: boolean): Promise<void>;
  abstract sendBiometricAuthorization(match: number): Promise<void>;
  abstract installApp(build: BuildResult, forceReinstall: boolean): Promise<void>;
  abstract launchApp(build: BuildResult, metroPort: number, devtoolsPort: number): Promise<void>;
  abstract makePreview(): Preview;
  abstract get platform(): DevicePlatform;
  abstract resetAppPermissions(
    appPermission: AppPermissionType,
    buildResult: BuildResult
  ): Promise<boolean>;

  async acquire() {
    const acquired = await tryAcquiringLock(this.lockFilePath);
    this.acquired = acquired;
    return acquired;
  }

  dispose() {
    if (this.acquired) {
      try {
        fs.unlinkSync(this.lockFilePath);
      } catch (_error) {
        // ignore ENOENT
      }
    }
    this.preview?.dispose();
  }

  get previewURL(): string | undefined {
    return this.preview?.streamURL;
  }

  public sendTouch(xRatio: number, yRatio: number, type: "Up" | "Move" | "Down") {
    this.preview?.sendTouch(xRatio, yRatio, type);
  }

  public sendMultiTouch(
    xRatio: number,
    yRatio: number,
    xAnchorRatio: number,
    yAnchorRatio: number,
    type: "Up" | "Move" | "Down"
  ) {
    this.preview?.sendMultiTouch(xRatio, yRatio, xAnchorRatio, yAnchorRatio, type);
  }

  public sendKey(keyCode: number, direction: "Up" | "Down") {
    this.preview?.sendKey(keyCode, direction);
  }

  public sendPaste(text: string) {
    this.preview?.sendPaste(text);
  }

  async startPreview() {
    if (!this.previewStartPromise) {
      this.preview = this.makePreview();
      this.previewStartPromise = this.preview.start();
    }
    return this.previewStartPromise;
  }
}
