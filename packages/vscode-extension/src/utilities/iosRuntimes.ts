import { IOSRuntimeInfo } from "../common/DeviceManager";
import { exec } from "./subprocess";

type RuntimeInfo = {
  bundlePath: string;
  buildversion: string;
  platform: "iOS" | "tvOS" | "watchOS";
  runtimeRoot: string;
  identifier: string;
  version: string;
  isInternal: boolean;
  isAvailable: boolean;
  name: string;
  supportedDeviceTypes: Array<{ name: string; identifier: string }>;
};

export async function getAvailableIosRuntimes(): Promise<IOSRuntimeInfo[]> {
  const result: { runtimes: RuntimeInfo[] } = JSON.parse(
    (await exec("xcrun", ["simctl", "list", "runtimes", "--json"])).stdout
  );
  return result.runtimes
    .filter((runtime) => runtime.platform === "iOS")
    .map((runtime) => ({
      platform: runtime.platform,
      identifier: runtime.identifier,
      name: runtime.name,
      version: runtime.version,
      supportedDeviceTypes: runtime.supportedDeviceTypes,
      available: runtime.isAvailable,
    }));
}
