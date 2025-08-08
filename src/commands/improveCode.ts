import * as vscode from "vscode";
import OpenAI from "openai";

const PROVIDER_SCHEME = "perplexity-preview";

class PreviewProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  onDidChange?: vscode.Event<vscode.Uri> = this._onDidChange.event;
  private store = new Map<string, string>();

  set(uri: vscode.Uri, content: string) {
    this.store.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    return this.store.get(uri.toString()) ?? "";
  }
}

export function registerImproveCodeAlias(context: vscode.ExtensionContext) {
  const provider = new PreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PROVIDER_SCHEME, provider)
  );

  const cmd = vscode.commands.registerCommand("perplexity.improveCode", async () => {
    const sourceEditor = vscode.window.activeTextEditor;
    if (!sourceEditor) return;

    const selection = sourceEditor.selection;
    const original = sourceEditor.document.getText(selection);
    if (!original) {
      vscode.window.showWarningMessage("Select some code to improve.");
      return;
    }

    const apiKey = await context.secrets.get("perplexity.apiKey");
    if (!apiKey) {
      vscode.window.showWarningMessage("Set your Perplexity API key first.");
      return;
    }

    const cfg = vscode.workspace.getConfiguration();
    const model = cfg.get<string>("perplexity.model") || "sonar";

    const maxTokensSetting = cfg.get<number>("perplexity.maxTokens") ?? 120;
    const baseMax = Math.max(256, Math.min(4096, maxTokensSetting * 8));
    const ceiling = 4096;
    const maxTokens = Math.min(baseMax, ceiling);

    const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });

    const language = sourceEditor.document.languageId || "plaintext";
    const system = "You transform and improve code. Return only the improved code, no backticks.";
    const baseUser = [
      `Language: ${language}`,
      `Task: Improve the selected code as much as reasonable without changing external behavior.`,
      `Prioritize: readability, small refactors, idiomatic patterns, naming, comments/docstrings only if valuable, remove dead code, fix obvious bugs, add simple guards.`,
      `Avoid: introducing new dependencies, large rewrites, changing I/O or public APIs.`,
      `--- ORIGINAL ---`,
      original,
      `--- END ORIGINAL ---`
    ].join("\n");

    const leftUri = vscode.Uri.parse(`${PROVIDER_SCHEME}://original/${Date.now()}.${language}`);
    const rightUri = vscode.Uri.parse(`${PROVIDER_SCHEME}://proposed/${Date.now()}.${language}`);
    provider.set(leftUri, original);
    provider.set(rightUri, "");

    const leftDoc = await vscode.workspace.openTextDocument(leftUri);
    const rightDoc = await vscode.workspace.openTextDocument(rightUri);
    try { await vscode.languages.setTextDocumentLanguage(leftDoc, language); } catch {}
    try { await vscode.languages.setTextDocumentLanguage(rightDoc, language); } catch {}

    await vscode.commands.executeCommand(
      "vscode.diff",
      leftDoc.uri,
      rightDoc.uri,
      `Perplexity Auto-Improve Preview (${language})`
    );

    let accumulated = "";
    let finishReason: string | null = null;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "PerplexityPilot: Improving selection…",
        cancellable: false
      },
      async () => {
        const stream = await client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: baseUser }
          ],
          stream: true
        });

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            provider.set(rightUri, accumulated);
          }
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        }
      }
    );

    accumulated = stripFences(accumulated).trim();
    provider.set(rightUri, accumulated);

    if (finishReason === "length") {
      const cont = await vscode.window.showInformationMessage(
        "PerplexityPilot: Output may be truncated. Continue generation?",
        "Continue",
        "Skip"
      );
      if (cont === "Continue") {
        const continueMsg = [
          `Language: ${language}`,
          `Continue the improved code from where you left off. Do not repeat lines already provided.`,
          `--- CONTEXT (last 40 lines) ---`,
          tailLines(accumulated, 40),
          `--- END CONTEXT ---`
        ].join("\n");

        const stream2 = await client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: Math.min(ceiling, Math.round(maxTokens * 1.5)),
          messages: [
            { role: "system", content: system },
            { role: "user", content: baseUser },
            { role: "assistant", content: accumulated },
            { role: "user", content: continueMsg }
          ],
          stream: true
        });

        for await (const chunk of stream2) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            provider.set(rightUri, accumulated);
          }
        }

        accumulated = stripFences(accumulated).trim();
        provider.set(rightUri, accumulated);
      }
    }

    const choice = await vscode.window.showInformationMessage(
      "Apply the proposed improvements?",
      "Apply",
      "Cancel"
    );
    if (choice !== "Apply") {
      await closePreviewTabs(leftDoc.uri, rightDoc.uri);
      vscode.window.showInformationMessage("Perplexity edit canceled.");
      return;
    }

    await closePreviewTabs(leftDoc.uri, rightDoc.uri);

    const we = new vscode.WorkspaceEdit();
    we.replace(
      sourceEditor.document.uri,
      new vscode.Range(selection.start, selection.end),
      accumulated
    );
    const applied = await vscode.workspace.applyEdit(we);
    if (!applied) {
      vscode.window.showErrorMessage("Failed to apply the edit.");
      return;
    }

    try { await sourceEditor.document.save(); } catch {}
    vscode.window.showInformationMessage("Perplexity improvements applied.");
  });

  context.subscriptions.push(cmd);
}

function stripFences(s: string): string {
  return s.replace(/^\s*``````$/g, "").trim();
}

function tailLines(s: string, n: number): string {
  const arr = s.split(/\r?\n/);
  return arr.slice(-n).join("\n");
}

async function closePreviewTabs(leftUri: vscode.Uri, rightUri: vscode.Uri) {
  const toClose = vscode.window.visibleTextEditors.filter(
    (e) => e.document.uri.toString() === leftUri.toString() || e.document.uri.toString() === rightUri.toString()
  );
  for (const ed of toClose) {
    await vscode.window.showTextDocument(ed.document, ed.viewColumn, false);
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}
