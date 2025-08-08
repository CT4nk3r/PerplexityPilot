import * as vscode from "vscode";
import OpenAI from "openai";

let applyItem: vscode.StatusBarItem | undefined;
let cancelItem: vscode.StatusBarItem | undefined;

// Shared state for the current inline edit session:
let currentEditor: vscode.TextEditor | undefined;
let currentSelection: vscode.Selection | undefined;
let currentOriginalText: string | undefined;

export function registerInlineEdit(context: vscode.ExtensionContext) {
  // Register internal commands once
  const applyCmd = vscode.commands.registerCommand("perplexity.inlineEdit.applyInternal", async () => {
    if (!currentEditor) return disposeStatusBarItems();

    disposeStatusBarItems();

    try {
      await currentEditor.document.save();
      vscode.window.showInformationMessage("Perplexity edit applied.");
    } catch {
      vscode.window.showInformationMessage("Perplexity edit kept (unsaved).");
    }
  });

  const cancelCmd = vscode.commands.registerCommand("perplexity.inlineEdit.cancelInternal", async () => {
    if (!currentEditor || !currentSelection || currentOriginalText === undefined) return disposeStatusBarItems();

    disposeStatusBarItems();

    await revertSelection(currentEditor, currentSelection, currentOriginalText);
    vscode.window.showInformationMessage("Perplexity edit canceled.");
  });

  // Register main inline edit command
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
      prompt: "Describe the change to apply to the selection.",
    });
    if (!instruction) return;

    const apiKey = await context.secrets.get("perplexity.apiKey");
    if (!apiKey) {
      vscode.window.showWarningMessage("Set your Perplexity API key first.");
      return;
    }

    const cfg = vscode.workspace.getConfiguration();
    const model = (cfg.get<string>("perplexity.model") ?? "sonar").toString();
    const maxTokensSetting = cfg.get<number>("perplexity.maxTokens") ?? 120;
    const baseMaxTokens = Math.max(256, Math.min(4096, maxTokensSetting * 4));
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
      `--- END ORIGINAL ---`,
    ].join("\n");

    let accumulated = "";
    let finishReason: string | null = null;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "PerplexityPilot: Applying inline edit…",
        cancellable: false,
      },
      async () => {
        const res = await client.chat.completions.create({
          model,
          temperature: 0.1,
          max_tokens: baseMaxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });

        accumulated = (res.choices?.[0]?.message?.content ?? "").toString();
        finishReason = res.choices?.[0]?.finish_reason ?? null;
      }
    );

    accumulated = stripFences(accumulated).trim();

    if (!accumulated) {
      const fallback = trySimpleRemove(original, instruction);
      if (!fallback) {
        vscode.window.showWarningMessage("No edit returned.");
        return;
      }
      await previewReplace(editor.document.uri, selection, fallback);
      showApplyCancel();
      // Save context for internal commands
      setCurrentContext(editor, selection, original);
      return;
    }

    if (normalize(accumulated) === normalize(original)) {
      vscode.window.showInformationMessage("No meaningful changes detected for this selection.");
      return;
    }

    if (finishReason === "length") {
      const continueChoice = await vscode.window.showInformationMessage(
        "PerplexityPilot: Output may be truncated. Continue generation?",
        "Continue",
        "Skip"
      );

      if (continueChoice === "Continue") {
        const continueMsg = [
          `Language: ${lang}`,
          `Continue the edited selection from where you left off. Do not repeat lines already provided.`,
          `--- CONTEXT (last 40 lines) ---`,
          tailLines(accumulated, 40),
          `--- END CONTEXT ---`,
        ].join("\n");

        const maxContTokens = Math.min(4096, Math.round(baseMaxTokens * 1.5));

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "PerplexityPilot: Continuing inline edit generation…",
            cancellable: false,
          },
          async () => {
            const contRes = await client.chat.completions.create({
              model,
              temperature: 0.1,
              max_tokens: maxContTokens,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
                { role: "assistant", content: accumulated },
                { role: "user", content: continueMsg },
              ],
            });

            const continuation = contRes.choices?.[0]?.message?.content ?? "";
            accumulated += "\n" + stripFences(continuation).trim();
          }
        );
      }
    }

    await previewReplace(editor.document.uri, selection, accumulated);
    showApplyCancel();

    // Save context for internal commands
    setCurrentContext(editor, selection, original);
  });

  context.subscriptions.push(cmd, applyCmd, cancelCmd);
}

function setCurrentContext(editor: vscode.TextEditor, selection: vscode.Selection, original: string) {
  currentEditor = editor;
  currentSelection = selection;
  currentOriginalText = original;
}

function disposeStatusBarItems() {
  applyItem?.hide();
  applyItem?.dispose();
  applyItem = undefined;
  cancelItem?.hide();
  cancelItem?.dispose();
  cancelItem = undefined;

  // Clear the current context
  currentEditor = undefined;
  currentSelection = undefined;
  currentOriginalText = undefined;
}

function showApplyCancel() {
  if (!applyItem) {
    applyItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    applyItem.text = "$(check) Apply";
    applyItem.tooltip = "Apply and keep changes";
    applyItem.command = "perplexity.inlineEdit.applyInternal";
  }
  if (!cancelItem) {
    cancelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
    cancelItem.text = "$(discard) Cancel";
    cancelItem.tooltip = "Discard changes";
    cancelItem.command = "perplexity.inlineEdit.cancelInternal";
  }

  applyItem.show();
  cancelItem.show();
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

function stripFences(s: string): string {
  if (!s) return "";
  let out = s.trim();
  // Remove leading ```
  out = out.replace(/^\s*```[a-zA-Z0-9_-]*\s*\r?\n/, "");
  // Remove trailing ```
  out = out.replace(/\r?\n\s*```\s*$/, "");
  return out.trim();
}

function normalize(s: string): string {
  return s.replace(/\s+$/gm, "").trim();
}

function tailLines(s: string, n: number): string {
  const arr = s.split(/\r?\n/);
  return arr.slice(-n).join("\n");
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
