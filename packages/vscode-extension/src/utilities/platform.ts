import os from "os";

const OS: "macos" | "windows" = (() => {
  const platform = os.platform();
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      throw new Error("Unsupported platform");
  }
})();
export const Platform = {
  OS,
  select: <R, T>(obj: { macos: R; windows: T }) => {
    return obj[Platform.OS];
  },
};

export type Platform = typeof Platform;
