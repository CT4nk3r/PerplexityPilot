import * as vscode from "vscode";

import { createPerplexityClient } from "./perplexityClient";

import { registerInlineEdit } from "./commands/inlineEdit";
import { registerSwitchModel } from "./commands/switchModel";
import { registerEditFromPrompt } from "./commands/editFromPrompt";
import { registerInlineCompletions } from "./inlineCompletions";
import { registerCodeActions } from "./codeActions";

export function activate(context: vscode.ExtensionContext) {
  registerEditFromPrompt(context);
  registerInlineCompletions(context);
  registerCodeActions(context);
  registerInlineEdit(context);
  registerSwitchModel(context);
}

export function deactivate() {}
