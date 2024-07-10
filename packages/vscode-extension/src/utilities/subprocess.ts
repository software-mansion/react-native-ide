import { Logger } from "../Logger";
import execa, { ExecaChildProcess } from "execa";
import readline from "readline";

export type ChildProcess = ExecaChildProcess<string>;

function overridePWD<T extends execa.Options>(options?: T) {
  if (options?.cwd) {
    return { ...options, env: { ...options.env, PWD: "0" } };
  }
  return undefined;
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

type ExecArgs = [string, string[]?, (execa.Options & { allowNonZeroExit?: boolean })?];
export function exec([name, args, options]: ExecArgs) {
  const subprocess = execa(name, args, overridePWD(options));
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

export function execSync([name, args, options]: [string, string[]?, execa.SyncOptions?]) {
  const result = execa.sync(name, args, overridePWD(options));
  if (result.stderr) {
    Logger.debug("Subprocess", name, args?.join(" "), "produced error output:", result.stderr);
  }
  return result;
}

export function command([commandWithArgs, options]: [string, execa.Options?]) {
  const subprocess = execa.command(commandWithArgs, overridePWD(options));
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
  printErrorsOnExit(); // don't want to await here not to block the outer method
  return subprocess;
}
