import * as vscode from "vscode";
import OpenAI from "openai";

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

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    const nonce = this._getNonce();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; style-src 'unsafe-inline';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PerplexityPilot Chat</title>
        <style>
          body { font-family: var(--vscode-font-family); margin:0; padding:0; color:var(--vscode-foreground); background:var(--vscode-editor-background); display:flex; flex-direction:column; height:100vh; }
          #messages { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:10px; }
          .message { padding:8px 12px; border-radius:6px; max-width:85%; line-height:1.4; }
          .user { background:var(--vscode-editorWidget-border); color:var(--vscode-editor-foreground); align-self:flex-end; white-space:pre-wrap; }
          .bot { background:var(--vscode-editor-background); border:1px solid var(--vscode-editorWidget-border); color:var(--vscode-editor-foreground); align-self:flex-start; white-space:normal; }
          #inputContainer { padding:8px; border-top:1px solid var(--vscode-editorWidget-border); display:flex; gap:8px; }
          #input { flex:1; font-family:var(--vscode-font-family); font-size:13px; padding:6px 8px; border-radius:4px; border:1px solid var(--vscode-editorWidget-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground); outline:none; }
          #sendBtn { padding:6px 12px; cursor:pointer; }
          .hint { opacity:0.7; font-size:12px; margin:6px 0 8px 8px; }
          .message pre { background: var(--vscode-editorGroupHeader-tabsBackground); padding: 8px; border-radius: 4px; overflow-x: auto; }
          .message code { font-family: var(--vscode-editor-font-family); font-size: 12px; background: var(--vscode-editor-background); padding: 2px 4px; border-radius: 3px; }
        </style>
        <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      </head>
      <body>
        <div id="messages"></div>
        <div id="inputContainer">
          <input id="input" type="text" placeholder="Ask about the code in the current file..." />
          <button id="sendBtn">Send</button>
        </div>
        <div class="hint">Tip: Select code to focus the answer. Without selection, I’ll use the entire file.</div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const messagesContainer = document.getElementById("messages");
          const inputBox = document.getElementById("input");
          const sendBtn = document.getElementById("sendBtn");

          function appendMessage(text, sender) {
            const el = document.createElement("div");
            el.className = "message " + sender;
            if (sender === "bot") {
              el.innerHTML = marked.parse(text);
            } else {
              el.textContent = text;
            }
            messagesContainer.appendChild(el);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          function sendCurrentInput() {
            const text = inputBox.value.trim();
            if (!text) return;
            appendMessage(text, "user");
            vscode.postMessage({ command: "sendMessage", text });
            inputBox.value = "";
            inputBox.focus();
          }

          sendBtn.addEventListener("click", sendCurrentInput);
          inputBox.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendCurrentInput();
            }
          });

          appendMessage("PerplexityPilot Chat ready. I’ll use your selection or the whole file for context.", "bot");

          window.addEventListener("message", (event) => {
            const message = event.data;
            if (message.command === "botReply") {
              appendMessage(message.text, "bot");
            }
          });
        </script>
      </body>
      </html>
    `;
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
