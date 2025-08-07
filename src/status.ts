import * as vscode from "vscode";

export function registerStatusBar(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "perplexity.switchModel";
  refresh();

  context.subscriptions.push(item);
  item.show();

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration("perplexity.model")) refresh();
  }));

  function refresh() {
    const model = vscode.workspace.getConfiguration().get<string>("perplexity.model") || "sonar";
    item.text = `PerplexityPilot: ${model}`;
    item.tooltip = "Switch Perplexity Model";
  }
}
