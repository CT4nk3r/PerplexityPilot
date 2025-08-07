// src/extension.ts
import * as vscode from "vscode";
import { createPerplexityClient } from "./perplexityClient";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "perplexity.editFromPrompt",
    async () => {
      try {
        // Ask for a goal
        const goal = await vscode.window.showInputBox({
          prompt: "Describe the change you want (e.g., 'append a Python hello world')."
        });
        if (!goal) return;

        // Ensure there is an active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("Open a file first to apply an edit.");
          return;
        }

        // Get API key (stored securely after first prompt)
        const apiKey = await ensureApiKey(context);
        if (!apiKey) return;

        // Client and settings
        const client = createPerplexityClient(apiKey);
        const cfg = vscode.workspace.getConfiguration();
        const model = cfg.get<string>("perplexity.model") || "sonar";
        const maxTokens = Math.max(16, Math.min(2048, cfg.get<number>("perplexity.maxTokens") ?? 120));
        const languageHint = editor.document.languageId;

        // System/user prompts
        const system =
          "You are a coding assistant. Respond with a single code line that satisfies the user's goal for the indicated language or file context. " +
          "Do not include code fences or extra commentary. Keep it concise.";
        const user = `Goal: ${goal}\nLanguage: ${languageHint}\nOutput: a single code line only, no backticks, no commentary.`;

        // Call Perplexity via OpenAI SDK
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

        // Insert at end of current file
        const doc = editor.document;
        const lastLine = doc.lineCount - 1;
        const endPos = doc.lineAt(lastLine).range.end;

        await editor.edit((builder) => {
          builder.insert(endPos, "\n" + line + "\n");
        });

        vscode.window.showInformationMessage("CoderGPT inserted a line from Perplexity.");
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        vscode.window.showErrorMessage(`CoderGPT error: ${msg}`);
        console.error("CoderGPT error:", err);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

// Store/retrieve API key in SecretStorage
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

// Optional local helper if you switch to non-API demo that appends a comment
function formatAsComment(languageId: string, text: string): string {
  switch (languageId) {
    case "python":
    case "shellscript":
    case "ruby":
    case "makefile":
    case "elixir":
      return "# " + text;
    case "lua":
    case "haskell":
      return "-- " + text;
    case "html":
    case "xml":
    case "markdown":
      return "<!-- " + text + " -->";
    default:
      return "// " + text;
  }
}
