import * as vscode from "vscode";
import OpenAI from "openai";

export class ChatSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "perplexityChat.sidebar";

  private _view?: vscode.WebviewView;
  private _client: OpenAI;

  constructor(private readonly _context: vscode.ExtensionContext, client: OpenAI) {
    this._client = client;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "sendMessage":
          const userMessage = message.text;

          // Get AI reply
          const botReply = await this.getPerplexityReply(userMessage);

          // Send reply back to webview
          webviewView.webview.postMessage({ command: "botReply", text: botReply });
          break;
      }
    });
  }

  private async getPerplexityReply(userMessage: string): Promise<string> {
    try {
      // Minimal casting to avoid TS type errors
      const messages = [
        {
          role: "system",
          content: "You are a helpful AI assistant. Answer user code questions or chat about code."
        },
        {
          role: "user",
          content: userMessage
        }
      ] as any;

      const response = await this._client.chat.completions.create({
        model: "sonar", // your preferred model
        messages,
        temperature: 0.5,
        max_tokens: 500
      });

      return response.choices?.[0]?.message?.content?.trim() ?? "[No response]";
    } catch (error) {
      console.error("Error in Perplexity API call:", error);
      return "[Error calling Perplexity API]";
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Perplexity Chat</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            margin: 0; padding: 0;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex; flex-direction: column; height: 100vh;
          }
          #messages {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
          }
          .message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 6px;
            max-width: 80%;
            white-space: pre-wrap;
          }
          .user {
            background-color: var(--vscode-editorWidget-border);
            color: var(--vscode-editor-foreground);
            align-self: flex-end;
          }
          .bot {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-editorWidget-border);
            color: var(--vscode-editor-foreground);
            align-self: flex-start;
          }
          #inputContainer {
            padding: 8px;
            border-top: 1px solid var(--vscode-editorWidget-border);
            display: flex;
          }
          #input {
            flex: 1;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 6px 8px;
            border-radius: 4px;
            border: 1px solid var(--vscode-editorWidget-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
          }
          #sendBtn {
            margin-left: 8px;
            padding: 6px 12px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div id="messages"></div>
        <div id="inputContainer">
          <input id="input" type="text" placeholder="Type your message..." />
          <button id="sendBtn">Send</button>
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();

          const messagesContainer = document.getElementById("messages");
          const inputBox = document.getElementById("input");
          const sendBtn = document.getElementById("sendBtn");

          function appendMessage(text, sender) {
            const el = document.createElement("div");
            el.textContent = text;
            el.className = "message " + sender;
            messagesContainer.appendChild(el);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          sendBtn.addEventListener("click", () => {
            const text = inputBox.value.trim();
            if (!text) return;

            appendMessage(text, "user");
            vscode.postMessage({ command: "sendMessage", text });
            inputBox.value = "";
          });

          inputBox.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              sendBtn.click();
              e.preventDefault();
            }
          });

          window.addEventListener("message", event => {
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
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
