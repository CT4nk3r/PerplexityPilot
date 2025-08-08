import * as vscode from "vscode";

import { registerInlineEdit } from "./commands/inlineEdit";
import { registerSwitchModel } from "./commands/switchModel";
import { registerEditFromPrompt } from "./commands/editFromPrompt";
import { registerInlineCompletions } from "./commands/inlineCompletions";
import { registerCodeActions } from "./commands/codeActions";
import { registerImproveCodeAlias } from "./commands/improveCode";


export function activate(context: vscode.ExtensionContext) {
  registerEditFromPrompt(context);
  registerInlineCompletions(context);
  registerCodeActions(context);
  registerInlineEdit(context);
  registerSwitchModel(context);
  registerImproveCodeAlias(context);
}

export function deactivate() {}
