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
  // Retrieve your API key from VS Code secrets
  const apiKey = await context.secrets.get("perplexity.apiKey");
  if (!apiKey) {
    vscode.window.showWarningMessage("Set your Perplexity API key first.");
  } else {
    // Initialize OpenAI client
    const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });

    // Register chat sidebar view provider
    const chatSidebarProvider = new ChatSidebarProvider(context, client);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ChatSidebarProvider.viewType,
        chatSidebarProvider
      )
    );
  }

  // Register other commands as before
  registerEditFromPrompt(context);
  registerInlineCompletions(context);
  registerCodeActions(context);
  registerInlineEdit(context);
  registerSwitchModel(context);
  registerImproveCodeAlias(context);
}

export function deactivate() {}
