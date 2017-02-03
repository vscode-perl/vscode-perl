import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import * as ctags from "./ctags";
import * as perl from "./perl";

import { PerlDefinitionProvider } from "./definitions";
import { PerlSymbolProvider } from "./symbols";
import { PerlCompletionProvider } from "./completions";
import { PerlFormattingProvider } from "./format";

export function activate(context: vscode.ExtensionContext) {

    vscode.languages.setLanguageConfiguration(perl.MODE.language, perl.CONFIG);

    let definitionProvider = new PerlDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(perl.MODE, definitionProvider));
    context.subscriptions.push(vscode.languages.registerHoverProvider(perl.MODE, definitionProvider));
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(perl.MODE, definitionProvider, "(", ","));

    let completionProvider = new PerlCompletionProvider();
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(perl.MODE, completionProvider));

    let symbolProvider = new PerlSymbolProvider();
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(perl.MODE, symbolProvider));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(symbolProvider));

    let formatProvider = new PerlFormattingProvider();
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(perl.MODE, formatProvider));

    vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId === "perl") {
            ctags.writeProject();
        }
    });

    ctags.writeProject();
}
