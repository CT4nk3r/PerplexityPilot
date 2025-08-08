import * as vscode from "vscode";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export function registerInlineCompletions(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { scheme: "file" },
    {
      async provideInlineCompletionItems(document, position) {
        try {
          const linePrefix = document.lineAt(position).text.slice(0, position.character);
          if (linePrefix.trim().length === 0) return;

          const cfg = vscode.workspace.getConfiguration();
          const model = cfg.get<string>("perplexity.model") || "sonar";

          const apiKey = await context.secrets.get("perplexity.apiKey");
          if (!apiKey) return;

          const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });

          const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: "You complete code inline. Respond with a single completion, no backticks, no prose." },
            { role: "user", content: `Language: ${document.languageId}\nLine prefix: ${linePrefix}\nContinue this line succinctly.` }
          ];

          const res = await client.chat.completions.create({
            model,
            temperature: 0.2,
            max_tokens: 60,
            messages
          });

          const text = (res.choices?.[0]?.message?.content || "").trim();
          if (!text) return;

          return [
            {
              insertText: text,
              range: new vscode.Range(position, position)
            }
          ];
        } catch {
          return;
        }
      }
    }
  );

  context.subscriptions.push(provider);
}
