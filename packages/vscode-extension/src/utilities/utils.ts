import { commands, Disposable, env, Uri } from "vscode";
import { Logger } from "../Logger";
import { homedir } from "node:os";
import path from "path";
import JSON5 from "json5";
import fs from "fs";
import { extensionContext } from "./extensionContext";
import { openFileAtPosition } from "./openFileAtPosition";
import { UtilsInterface } from "../common/Utils";

type keybindingType = {
  command: string;
  key?: string;
  mac?: string;
  when?: string;
};

export class Utils implements UtilsInterface {
  public async getCommandsCurrentKeyBinding(commandName: string) {
    const packageJsonPath = path.join(extensionContext.extensionPath, "package.json");
    const extensionPackageJson = require(packageJsonPath);
    let keybindingsJsonPath;
    let keybindingsJson;
    try {
      keybindingsJsonPath = path.join(
        homedir(),
        "Library/Application Support/Code/User/keybindings.json"
      );
      // cannot use require because the file may contain comments
      keybindingsJson = JSON5.parse(fs.readFileSync(keybindingsJsonPath).toString());
    } catch (e) {
      Logger.error("Error while parsing keybindings.json", e);
      return undefined;
    }

    const isRNIDECommand =
      !!extensionPackageJson.contributes.commands &&
      !!extensionPackageJson.contributes.commands.find((command: keybindingType) => {
        return command.command === commandName;
      });
    if (!isRNIDECommand) {
      Logger.warn("Trying to access a keybinding for a command that is not part of an extension.");
      return undefined;
    }

    const userKeybinding = keybindingsJson.find((command: keybindingType) => {
      return command.command === commandName;
    });
    if (userKeybinding) {
      return userKeybinding.key;
    }

    const defaultKeybinding = extensionPackageJson.contributes.keybindings.find(
      (keybinding: keybindingType) => {
        return keybinding.command === commandName;
      }
    );
    if (defaultKeybinding) {
      return defaultKeybinding.mac;
    }

    return undefined;
  }

  async reportIssue() {
    env.openExternal(
      Uri.parse("https://github.com/software-mansion/react-native-ide/issues/new/choose")
    );
  }

  public async openFileAt(filePath: string, line0Based: number, column0Based: number) {
    openFileAtPosition(filePath, line0Based, column0Based);
  }

  public movePanelToNewWindow() {
    commands.executeCommand("workbench.action.moveEditorToNewWindow");
  }
}
