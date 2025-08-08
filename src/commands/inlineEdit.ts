import * as vscode from "vscode";
import OpenAI from "openai";

export function registerInlineEdit(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("perplexity.inlineEdit", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const original = editor.document.getText(selection);
    if (!original) {
      vscode.window.showWarningMessage("Select some code to edit.");
      return;
    }

    const instruction = await vscode.window.showInputBox({
      prompt: "Describe the change to apply to the selection."
    });
    if (!instruction) return;

    const apiKey = await context.secrets.get("perplexity.apiKey");
    if (!apiKey) {
      vscode.window.showWarningMessage("Set your Perplexity API key first.");
      return;
    }

    const cfg = vscode.workspace.getConfiguration();
    const model = cfg.get<string>("perplexity.model") || "sonar";
    const maxTokensSetting = cfg.get<number>("perplexity.maxTokens") ?? 120;
    const maxTokens = Math.max(256, Math.min(4096, maxTokensSetting * 4));
    const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });

    const lang = editor.document.languageId || "plaintext";

    const system =
      "You are a precise code transformation engine. Apply the user's instruction to the given selection and return ONLY the full edited selection as code, in the same language. Do not include commentary or code fences.";
    const user = [
      `Language: ${lang}`,
      `Instruction: ${instruction}`,
      `Return: the full edited selection only (no backticks, no prose).`,
      `--- ORIGINAL SELECTION ---`,
      original,
      `--- END ORIGINAL ---`
    ].join("\n");

    let raw = "";

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "PerplexityPilot: Applying inline edit…",
        cancellable: false
      },
      async () => {
        const res = await client.chat.completions.create({
          model,
          temperature: 0.1,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        });
        raw = (res.choices?.[0]?.message?.content ?? "").toString();
      }
    );

    const proposed = stripFences(raw).trim();
    if (!proposed) {
      const fallback = trySimpleRemove(original, instruction);
      if (!fallback) {
        vscode.window.showWarningMessage("No edit returned.");
        return;
      }
      await previewReplace(editor.document.uri, selection, fallback);
      await showApplyCancel(editor, selection, original);
      return;
    }

    if (normalize(proposed) === normalize(original)) {
      vscode.window.showInformationMessage("No meaningful changes detected for this selection.");
      return;
    }

    await previewReplace(editor.document.uri, selection, proposed);
    await showApplyCancel(editor, selection, original);
  });

  context.subscriptions.push(cmd);
}

async function previewReplace(uri: vscode.Uri, sel: vscode.Selection, text: string) {
  const we = new vscode.WorkspaceEdit();
  we.replace(uri, new vscode.Range(sel.start, sel.end), text);
  await vscode.workspace.applyEdit(we);
}

async function revertSelection(editor: vscode.TextEditor, sel: vscode.Selection, original: string) {
  const we = new vscode.WorkspaceEdit();
  we.replace(editor.document.uri, new vscode.Range(sel.start, sel.end), original);
  await vscode.workspace.applyEdit(we);
}

async function showApplyCancel(editor: vscode.TextEditor, sel: vscode.Selection, original: string) {
  const applyItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  const cancelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
  applyItem.text = "$(check) Apply";
  cancelItem.text = "$(discard) Cancel";
  applyItem.tooltip = "Apply and keep changes";
  cancelItem.tooltip = "Discard changes";

  const disposeAll = () => {
    applyItem.hide();
    cancelItem.hide();
    applyItem.dispose();
    cancelItem.dispose();
  };

  applyItem.command = {
    title: "Apply Inline Edit",
    command: "perplexity.inlineEdit.applyInternal"
  };
  cancelItem.command = {
    title: "Cancel Inline Edit",
    command: "perplexity.inlineEdit.cancelInternal"
  };

  applyItem.show();
  cancelItem.show();

  const applyCmd = vscode.commands.registerCommand("perplexity.inlineEdit.applyInternal", async () => {
    disposeAll();
    try {
      await editor.document.save();
      vscode.window.showInformationMessage("Perplexity edit applied.");
    } catch {
      vscode.window.showInformationMessage("Perplexity edit kept (unsaved).");
    }
    applyCmd.dispose();
    cancelCmd.dispose();
  });

  const cancelCmd = vscode.commands.registerCommand("perplexity.inlineEdit.cancelInternal", async () => {
    disposeAll();
    await revertSelection(editor, sel, original);
    vscode.window.showInformationMessage("Perplexity edit canceled.");
    applyCmd.dispose();
    cancelCmd.dispose();
  });
}

function stripFences(s: string): string {
  if (!s) return "";
  let out = s.trim();

  // Remove exactly one leading ```
  out = out.replace(/^\s*```[a-zA-Z0-9_-]*\s*\r?\n/, "");

  // Remove exactly one trailing ```
  out = out.replace(/\r?\n\s*```\s*$/, "");

  return out.trim();
}


function normalize(s: string): string {
  return s.replace(/\s+$/gm, "").trim();
}

function trySimpleRemove(original: string, instruction: string): string | null {
  const m = instruction.match(/remove\s+(.+)/i);
  if (!m) return null;
  const needle = (m[1] || "").trim();
  if (!needle) return null;

  const patterns = [needle];
  if (/sleep/i.test(needle) || /time\.sleep/i.test(needle)) {
    patterns.push("time.sleep(", "sleep(");
  }

  const lines = original.split(/\r?\n/);
  const lowered = patterns.map((p) => p.toLowerCase());
  const out = lines.filter((line) => {
    const ll = line.toLowerCase();
    return !lowered.some((p) => ll.includes(p));
  });
  const joined = out.join("\n");
  if (normalize(joined) === normalize(original)) return null;
  return joined;
}
