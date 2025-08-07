import * as vscode from "vscode";
import { registerEditFromPrompt } from "./commands/editFromPrompt";

export function activate(context: vscode.ExtensionContext) {
  registerEditFromPrompt(context);
}

export function deactivate() {}
