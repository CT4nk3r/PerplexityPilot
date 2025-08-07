import * as vscode from "vscode";

const ALLOWED_MODELS = [
  "sonar",
  "sonar-reasoning",
  "sonar-pro",
  "sonar-reasoning-pro",
  "sonar-deep-research",
  "r1-1776"
];

export function registerSwitchModel(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("perplexity.switchModel", async () => {
    const cfg = vscode.workspace.getConfiguration();
    const current = cfg.get<string>("perplexity.model") || "sonar";

    if (!ALLOWED_MODELS.includes(current)) {
      await cfg.update("perplexity.model", "sonar", vscode.ConfigurationTarget.Global);
      vscode.window.showWarningMessage(`Unsupported model "${current}" replaced with "sonar".`);
    }

    const choice = await vscode.window.showQuickPick(ALLOWED_MODELS, {
      placeHolder: "Select Perplexity model",
      matchOnDetail: true
    });
    if (!choice) return;

    await cfg.update("perplexity.model", choice, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Perplexity model set to ${choice}`);
  });

  context.subscriptions.push(cmd);
}
