import * as vscode from "vscode";

export function registerCodeActions(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCodeActionsProvider(
    { scheme: "file" },
    new PerplexityActions(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor] }
  );
  context.subscriptions.push(provider);
}

class PerplexityActions implements vscode.CodeActionProvider {
  provideCodeActions() {
    const actions: vscode.CodeAction[] = [];
    const fix = new vscode.CodeAction("PerplexityPilot: Improve this code", vscode.CodeActionKind.QuickFix);
    fix.command = { command: "perplexity.inlineEdit", title: "PerplexityPilot: Improve this code" };
    actions.push(fix);
    return actions;
  }
}
