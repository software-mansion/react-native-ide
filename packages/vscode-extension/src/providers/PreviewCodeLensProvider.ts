import {
  CodeLensProvider,
  TextDocument,
  CancellationToken,
  CodeLens,
  Range,
  Command,
} from "vscode";

export class PreviewCodeLensProvider implements CodeLensProvider {
  provideCodeLenses(
    document: TextDocument,
    token: CancellationToken
  ): CodeLens[] | Thenable<CodeLens[]> {
    const text = document.getText();

    // imported preview
    if (!text.includes("react-native-ide")) {
      return [];
    }

    const regex = /\bpreview\b\s*\(/g;
    const codeLenses = [];

    for (const match of text.matchAll(regex)) {
      const line = document.lineAt(document.positionAt(match.index).line);
      const range = new Range(line.lineNumber, 0, line.lineNumber, line.text.length);
      const command: Command = {
        title: "Open preview",
        command: "RNIDE.showPanel",
        arguments: [document.fileName, line.lineNumber + 1],
      };
      codeLenses.push(new CodeLens(range, command));
    }

    return codeLenses;
  }
}
