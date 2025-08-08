import * as vscode from "vscode";

import { registerInlineEdit } from "./commands/inlineEdit";
import { registerSwitchModel } from "./commands/switchModel";
import { registerEditFromPrompt } from "./commands/editFromPrompt";
import { registerInlineCompletions } from "./commands/inlineCompletions";
import { registerCodeActions } from "./commands/codeActions";
import { registerImproveCodeAlias } from "./commands/improveCode";

import { ChatSidebarProvider } from "./commands/chatSidebar";
import OpenAI from "openai";

export async function activate(context: vscode.ExtensionContext) {
  const apiKey = await context.secrets.get("perplexity.apiKey");

  const client = new OpenAI({
    apiKey: apiKey || "missing-key",
    baseURL: "https://api.perplexity.ai",
  });
  const chatSidebarProvider = new ChatSidebarProvider(context, client, !apiKey);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatSidebarProvider.viewType,
      chatSidebarProvider
    )
  );

  if (!apiKey) {
    vscode.window.showWarningMessage(
      "PerplexityPilot: No API key set. Store your Perplexity API key in VS Code secrets to use chat."
    );
  }

  registerEditFromPrompt(context);
  registerInlineCompletions(context);
  registerCodeActions(context);
  registerInlineEdit(context);
  registerSwitchModel(context);
  registerImproveCodeAlias(context);
}

export function deactivate() {}
