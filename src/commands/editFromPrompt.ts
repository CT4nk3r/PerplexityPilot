import * as vscode from "vscode";
import { createPerplexityClient } from "../perplexityClient";

export function registerEditFromPrompt(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("perplexity.editFromPrompt", async () => {
    try {
      const goal = await vscode.window.showInputBox({
        prompt: "Describe the change you want (e.g., 'append a Python hello world')."
      });
      if (!goal) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a file first to apply an edit.");
        return;
      }

      const apiKey = await ensureApiKey(context);
      if (!apiKey) return;

      const client = createPerplexityClient(apiKey);
      const cfg = vscode.workspace.getConfiguration();
      const model = cfg.get<string>("perplexity.model") || "sonar";
      const maxTokens = Math.max(16, Math.min(2048, cfg.get<number>("perplexity.maxTokens") ?? 120));
      const languageHint = editor.document.languageId;

      const system =
        "You are a coding assistant. Respond with a single code line that satisfies the user's goal for the indicated language or file context. Do not include code fences or commentary.";
      const user = `Goal: ${goal}\nLanguage: ${languageHint}\nOutput: a single code line only, no backticks, no commentary.`;

      const res = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      });

      const line = (res.choices?.[0]?.message?.content || "").trim();
      if (!line) {
        vscode.window.showWarningMessage("No content returned from Perplexity.");
        return;
      }

      const doc = editor.document;
      const lastLine = doc.lineCount - 1;
      const endPos = doc.lineAt(lastLine).range.end;

      await editor.edit((builder) => {
        builder.insert(endPos, "\n" + line + "\n");
      });

      vscode.window.showInformationMessage("PerplexityPilot inserted a line from Perplexity.");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      vscode.window.showErrorMessage(`PerplexityPilot error: ${msg}`);
      console.error("PerplexityPilot error:", err);
    }
  });

  context.subscriptions.push(cmd);
}

async function ensureApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  let key = await context.secrets.get("perplexity.apiKey");
  if (!key) {
    key = await vscode.window.showInputBox({
      prompt: "Enter your Perplexity API key",
      password: true,
      ignoreFocusOut: true
    });
    if (key) {
      await context.secrets.store("perplexity.apiKey", key);
      vscode.window.showInformationMessage("Perplexity API key saved to VS Code Secret Storage.");
    }
  }
  return key;
}
