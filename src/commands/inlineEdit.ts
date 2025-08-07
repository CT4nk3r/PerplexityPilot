import * as vscode from "vscode";
import OpenAI from "openai";

export function registerInlineEdit(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("perplexity.inlineEdit", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
      vscode.window.showWarningMessage("Select some code to edit.");
      return;
    }

    const instruction = await vscode.window.showInputBox({ prompt: "Describe the change to apply to the selection." });
    if (!instruction) return;

    const apiKey = await context.secrets.get("perplexity.apiKey");
    if (!apiKey) {
      vscode.window.showWarningMessage("Set your Perplexity API key first.");
      return;
    }

    const cfg = vscode.workspace.getConfiguration();
    const model = cfg.get<string>("perplexity.model") || "sonar";
    const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });

    const system = "You transform the user's selected code according to the instruction. Return only the new code, no backticks.";
    const user = `Language: ${editor.document.languageId}\nInstruction: ${instruction}\n---\n${selectedText}\n---`;

    const res = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const out = (res.choices?.[0]?.message?.content || "").trim();
    if (!out) {
      vscode.window.showWarningMessage("No edit returned.");
      return;
    }

    await editor.edit((builder) => builder.replace(selection, out));
    vscode.window.showInformationMessage("PerplexityPilot applied inline edit.");
  });

  context.subscriptions.push(cmd);
}
