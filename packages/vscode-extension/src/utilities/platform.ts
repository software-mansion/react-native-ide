import * as os from "os";

export class Platform {
  static OS: "macos" | "windows" | "unknown" = (() => {
    const platform = os.platform();
    switch (platform) {
      case "darwin":
        return "macos";
      case "win32":
        return "windows";
      default:
        return "macos";
    }
  })();

  static select(obj: { macos: any; windows: any }) {
    if (Platform.OS !== "unknown" && Platform.OS in obj) {
      return obj[Platform.OS];
    }
  }
}
