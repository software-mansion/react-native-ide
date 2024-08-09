import { window } from "vscode";

const outputChannel = window.createOutputChannel("React Native IDE", { log: true });

const logger = {
  log(_message: string, ..._args: any[]) {},

  debug(message: string, ...args: any[]) {
    // in the initial phase od development, we want to surface debug messages such that
    // they can be seen by the extension user. This is useful for collecting feedback and
    // being able to better troubleshoot issues. In vscode, the default logging level is set
    // to INFO. We don't want to ask users to change their logging level as it impacts all
    // the logs vscode generates. Also, when changing log level, one need to reload vscode
    // window for the extension to pick up the change.
    outputChannel.info(message, ...args);
  },

  info(message: string, ...args: any[]) {
    outputChannel.info(message, ...args);
  },

  warn(message: string, ...args: any[]) {
    outputChannel.error(message, ...args);
  },

  error(message: string, ...args: any[]) {
    outputChannel.error(message, ...args);
  },

  openOutputPanel() {
    outputChannel.show();
  },
};

let devModeLoggingEnabled = false;

export function enableDevModeLogging() {
  if (devModeLoggingEnabled) {
    return;
  }
  devModeLoggingEnabled = true;

  function wrapConsole(methodName: "log" | "debug" | "info" | "warn" | "error") {
    const origMethod = logger[methodName];
    const consoleMethod = console[methodName !== "debug" ? methodName : "log"];
    logger[methodName] = (message: string, ...args: any[]) => {
      origMethod(message, ...args);
      consoleMethod(message, ...args);
    };
  }

  (["log", "debug", "info", "warn", "error"] as const).forEach(wrapConsole);
}

export class Logger {
  public static openOutputPanel() {
    logger.openOutputPanel();
  }

  // Logs will only appear in development output
  public static log(message: string, ...args: any[]) {
    logger.log(message, ...args);
  }

  // Debug is for verbose messaging that can be seen by the extension user if they have DEBUG logging level specified
  public static debug(message: string, ...args: any[]) {
    logger.debug(message, ...args);
  }

  // Info and other type of messages will be visible by the extension user by default
  public static info(message: string, ...args: any[]) {
    logger.info(message, ...args);
  }

  public static warn(message: string, ...args: any[]) {
    logger.warn(message, ...args);
  }

  public static error(message: string, ...args: any[]) {
    logger.error(message, ...args);
  }
}
