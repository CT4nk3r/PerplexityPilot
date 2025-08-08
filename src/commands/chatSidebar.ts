import * as vscode from "vscode";
import OpenAI from "openai";
import * as fs from 'fs';
import * as path from 'path';


type EditorContext = {
  filePath: string | null;
  languageId: string | null;
  code: string | null; // selection or full document
  source: "selection" | "document" | "none";
};

export class ChatSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "perplexitypilot.sidebar";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _client: OpenAI,
    private readonly _apiKeyMissing: boolean
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "sendMessage": {
          const userMessage: string = (message.text ?? "").toString().trim();
          if (!userMessage) return;

          if (this._apiKeyMissing) {
            webviewView.webview.postMessage({
              command: "botReply",
              text: "[No API key set. Store your Perplexity API key in VS Code secrets to use chat.]",
            });
            return;
          }

          const ctx = getEditorContext();
          const botReply = await this.getPerplexityReply(userMessage, ctx);

          webviewView.webview.postMessage({ command: "botReply", text: botReply });
          break;
        }
      }
    });
  }

  private async getPerplexityReply(userMessage: string, ctx: EditorContext): Promise<string> {
    try {
      const cfg = vscode.workspace.getConfiguration();
      const model = (cfg.get<string>("perplexity.model") ?? "sonar").toString();

      const system = [
        "You are a helpful AI assistant embedded in VS Code.",
        "When code context is provided, prioritize concrete, actionable suggestions referencing the code.",
        "Be concise unless asked otherwise."
      ].join(" ");

      const contextAttachment = buildContextAttachment(ctx);

      const messages = [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            userMessage,
            contextAttachment ? "\n--- ACTIVE EDITOR CONTEXT ---\n" + contextAttachment + "\n--- END CONTEXT ---" : "",
          ].join("")
        }
      ] as any;

      const response = await this._client.chat.completions.create({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 800,
      });

      return response.choices?.[0]?.message?.content?.trim() ?? "[No response]";
    } catch (error: any) {
      console.error("Perplexity chat error:", error);
      const msg = typeof error?.message === "string" ? error.message : "Unknown error calling Perplexity API";
      return `[Error] ${msg}`;
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this._getNonce();
    const htmlPath = path.join(this._context.extensionPath, 'media', 'webview.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/{{nonce}}/g, nonce);
    return html;
}


  private _getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }
}

function getEditorContext(): EditorContext {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { filePath: null, languageId: null, code: null, source: "none" };
  }

  const doc = editor.document;
  const sel = editor.selection;
  const selectedText = doc.getText(sel);
  const hasSelection = sel && !sel.isEmpty && selectedText.trim().length > 0;

  const code = hasSelection ? selectedText : doc.getText();
  const source: EditorContext["source"] = hasSelection ? "selection" : "document";
  const filePath = doc.uri.fsPath || null;
  const languageId = doc.languageId || null;

  return { filePath, languageId, code, source };
}

function buildContextAttachment(ctx: EditorContext): string | null {
  if (!ctx.code) return null;

  const lang = ctx.languageId ?? "plaintext";
  const location = ctx.filePath ? `File: ${ctx.filePath}` : "File: [unsaved/untitled]";
  const scope = ctx.source === "selection" ? "Scope: selection" : "Scope: entire document";

  return [
    `${location}`,
    `${scope}`,
    `Language: ${lang}`,
    "Code:",
    "```",
    ctx.code,
    "```",
  ].join("\n");
}
