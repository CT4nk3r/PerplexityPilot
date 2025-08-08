import * as vscode from "vscode";

export function registerCodeActions(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCodeActionsProvider(
    { scheme: "file" },
    new PerplexityActions(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  );
  context.subscriptions.push(provider);
}

class PerplexityActions implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] | undefined {
    const selection = range as vscode.Selection;
    if (selection.isEmpty) return;

    const fix = new vscode.CodeAction("Perplexity: Improve this code", vscode.CodeActionKind.QuickFix);
    fix.command = { command: "perplexity.inlineEdit", title: "Perplexity: Improve this code" };
    return [fix];
  }
}
