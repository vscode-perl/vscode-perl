import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { Ctags } from "./ctags";
import * as perl from "./perl";

import { PerlDefinitionProvider } from "./definitions";
import { PerlSymbolProvider } from "./symbols";
import { PerlCompletionProvider } from "./completions";
import { PerlFormattingProvider } from "./format";

export function activate(context: vscode.ExtensionContext) {
    let tags = new Ctags();

    tags.checkVersion()
        .then(() => {
            vscode.languages.setLanguageConfiguration(perl.MODE.language, perl.CONFIG);

            let definitionProvider = new PerlDefinitionProvider(tags);
            context.subscriptions.push(vscode.languages.registerDefinitionProvider(perl.MODE, definitionProvider));
            context.subscriptions.push(vscode.languages.registerHoverProvider(perl.MODE, definitionProvider));
            context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(perl.MODE, definitionProvider, "(", ","));

            let completionProvider = new PerlCompletionProvider(tags);
            context.subscriptions.push(vscode.languages.registerCompletionItemProvider(perl.MODE, completionProvider));

            let symbolProvider = new PerlSymbolProvider(tags);
            context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(perl.MODE, symbolProvider));
            context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(symbolProvider));

            vscode.workspace.onDidSaveTextDocument(document => {
                if (document.languageId === "perl") {
                    tags.generateProjectTagsFile();
                }
            });

            tags.generateProjectTagsFile();
        })
        .catch(error => {
            vscode.window.showInformationMessage("Could no find a compatible version of Exuberant Ctags.");
        });

    vscode.commands.registerCommand("perl.generateTags", () => {
        tags.generateProjectTagsFile();
    });

    let formatProvider = new PerlFormattingProvider();
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(perl.MODE, formatProvider));
}
