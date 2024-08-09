import { Logger } from "../Logger";
import execa, { ExecaChildProcess } from "execa";
import readline from "readline";
import { Platform } from "./platform";

export type ChildProcess = ExecaChildProcess<string>;

function overridePWD<T extends execa.Options>(options?: T) {
  // Some processes rely on PWD environment variable to tell the current working
  // directory in which cases PWD takes precedence over process.cwd.
  // By default, execa would copy all process env to the subprocess (which is desired)
  // including PWD that may point to a different location that the selected cwd (indicated
  // by options.cwd). Specifically, when VSCode is launched from the launcher (as opposed to
  // being launched from command line using 'code' command), the PWD is set to "/".
  // This method overrides PWD to the current cwd option when it's set for the subprocess call
  // therefore removing the risk of the subprocess using the wrong working directory.

  if (options?.cwd) {
    return { ...options, env: { ...options.env, PWD: options.cwd } };
  }
  return options;
}

/**
 * When using this methid, the subprocess should be started with buffer: false option
 * as there's no need for allocating memory for the output that's going to be very long.
 */
export function lineReader(childProcess: ExecaChildProcess<string>, includeStderr = false) {
  const input = childProcess.stdout;
  if (!input) {
    throw new Error("Child process has no stdout");
  }
  const stdoutReader = readline.createInterface({
    input,
    terminal: false,
  });
  let stderrReader = null;
  if (includeStderr && childProcess.stderr) {
    stderrReader = readline.createInterface({
      input: childProcess.stderr!,
      terminal: false,
    });
  }
  return {
    onLineRead: (callback: (line: string) => void) => {
      stdoutReader.on("line", callback);
      stderrReader?.on("line", callback);
    },
  };
}

export function exec(
  name: string,
  args?: string[],
  options?: execa.Options & { allowNonZeroExit?: boolean }
) {
  const subprocess = execa(
    name,
    args,
    Platform.select({ macos: overridePWD(options), windows: options })
  );
  const allowNonZeroExit = options?.allowNonZeroExit;
  async function printErrorsOnExit() {
    try {
      const result = await subprocess;
      if (result.stderr) {
        Logger.debug("Subprocess", name, args?.join(" "), "produced error output:", result.stderr);
      }
    } catch (e) {
      // @ts-ignore idk how to deal with error objects in ts
      const { exitCode, signal } = e;
      if (exitCode === undefined && signal !== undefined) {
        Logger.info("Subprocess", name, "was terminated with", signal);
      } else {
        if (!allowNonZeroExit || !exitCode) {
          Logger.error("Subprocess", name, args?.join(" "), "execution resulted in an error:", e);
        }
      }
    }
  }
  printErrorsOnExit(); // don't want to await here not to block the outer method
  return subprocess;
}

export function execSync(name: string, args?: string[], options?: execa.SyncOptions) {
  const result = execa.sync(
    name,
    args,
    Platform.select({ macos: overridePWD(options), windows: options })
  );
  if (result.stderr) {
    Logger.debug("Subprocess", name, args?.join(" "), "produced error output:", result.stderr);
  }
  return result;
}

export function command(commandWithArgs: string, options?: execa.Options & { quiet?: boolean }) {
  const subprocess = execa.command(
    commandWithArgs,
    Platform.select({ macos: overridePWD(options), windows: options })
  );
  async function printErrorsOnExit() {
    try {
      const result = await subprocess;
      if (result.stderr) {
        Logger.debug("Command", commandWithArgs, "produced error output:", result.stderr);
      }
    } catch (e) {
      Logger.error("Command", commandWithArgs, "execution resulted in an error:", e);
    }
  }

  if (!options?.quiet) {
    printErrorsOnExit(); // don't want to await here not to block the outer method
  }

  return subprocess;
}
