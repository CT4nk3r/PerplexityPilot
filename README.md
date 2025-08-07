# PerplexityPilot

PerplexityPilot is a VS Code extension that brings Perplexity models into your editor for Copilot‑like assistance: inline completions (ghost text), inline selection edits, quick fixes, and a simple “edit from prompt” command.

- Inline completions while you type
- Inline edit of selected code by instruction
- Quick Fix action to improve code
- Model switcher in Command Palette
- Secure Perplexity API key storage in VS Code Secret Storage

## Requirements

- VS Code 1.102.0+
- Perplexity API key
- Node 18+ for development

## Installation (development)

1. Clone this repo
2. Install dependencies: `npm install`
3. Build/watch: `npm run watch` or press F5 to launch the Extension Development Host
4. In the Dev Host, open a file and try the commands below

## Commands

- Perplexity: Edit Code from Prompt  
  Prompts you for a goal and inserts a single generated line at the end of the active file.

- Perplexity: Inline Edit Selection  
  Select code, run the command, describe the change, and it replaces the selection.

- Perplexity: Switch Model  
  Quick-pick of supported Perplexity models and updates your setting.

Inline completions are enabled automatically when the extension activates. Use “Trigger Inline Suggestion” to force a suggestion if needed.

## Settings

- `perplexity.model`  
  Default: `sonar`  
  Allowed: `sonar`, `sonar-reasoning`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research`, `r1-1776`  
  The extension validates and falls back to `sonar` if an unsupported model is selected.

- `perplexity.maxTokens`  
  Default: `120`  
  Maximum tokens used for quick generations.

## API Key

On first use, the extension prompts for your Perplexity API key and stores it in VS Code Secret Storage. To update it later, re-enter via the prompt when needed or clear it from Secret Storage.

## Features

- Inline Completions  
  Provides code suggestions inline (ghost text) based on the current line context.

- Inline Edit  
  Turns your selection and instruction into a transformed code block, replacing the selection.

- Quick Fix / Code Action  
  Lightbulb entry “Perplexity: Improve this code” that routes to Inline Edit.

- Model Switcher  
  Quick-pick of supported models with validation.

## Usage Tips

- Inline completions work best when there’s some prefix on the current line. If nothing shows, try the “Trigger Inline Suggestion” command or continue typing a bit.
- Use Inline Edit for refactors or targeted changes. Select the smallest code region that captures the intent.
- Keep `perplexity.maxTokens` modest for snappier responses during editing; increase when you need longer output.

## Example Workflow

1. Open a Python file
2. Select a function
3. Run “Perplexity: Inline Edit Selection”
4. Instruction: “Add a docstring and type hints”
5. Review the replacement and undo if needed

## Development

- Build once: `npm run compile`
- Watch mode: `npm run watch`
- Package a VSIX: `npm run package` (produces `.vsix`)
- Publish to Marketplace: use `vsce` with your publisher id

### Project structure

- `src/extension.ts`  
  Activates the extension and registers features

- `src/perplexityClient.ts`  
  OpenAI SDK client configured for Perplexity API

- `src/inlineCompletions.ts`  
  InlineCompletionItemProvider for ghost text

- `src/codeActions.ts`  
  CodeActionProvider that surfaces a quick fix

- `src/commands/inlineEdit.ts`  
  Selection-based transformation command

- `src/commands/switchModel.ts`  
  Model quick-pick with
