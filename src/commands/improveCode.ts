import * as vscode from "vscode";

export function registerImproveCodeAlias(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("perplexity.improveCode", async () => {
    await vscode.commands.executeCommand("perplexity.inlineEdit");
  });
  context.subscriptions.push(cmd);
}
