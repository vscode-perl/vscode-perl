import * as vscode from "vscode";

import * as ctags from "./ctags";
import * as perl from "./perl";
import * as utils from "./utils";

interface FileCompletionItems {
    [index: string]: vscode.CompletionItem[];
}

interface FilePackageMap {
    [index: string]: string;
}

export class PerlCompletionProvider implements vscode.CompletionItemProvider {
    public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CompletionItem[]> {
        let range = document.getWordRangeAtPosition(position);
        let pkg = utils.getPackageBefore(document, range);
        let separator = document.getText(utils.getRangeBefore(range, 2));

        let isMethod = (separator === "->");
        // console.log("isMethod: ", isMethod);

        // let currentFile = document.uri.fsPath.replace(vscode.workspace.rootPath, ".");
        // console.log(currentFile);

        let word: RegExpExecArray;
        let text = document.getText();
        let words = {};
        while (word = perl.CONFIG.wordPattern.exec(text)) {
            words[word[0]] = true;
        }

        let currentWord = document.getText(range);
        delete words[currentWord];

        let items: vscode.CompletionItem[] = [];
        for (let i = 0; i < perl.KEYWORDS.length; i++) {
            delete words[perl.KEYWORDS[i]];
            let item = new vscode.CompletionItem(perl.KEYWORDS[i]);
            item.kind = vscode.CompletionItemKind.Keyword;
            item.detail = "perl keyword";
            items.push(item);
        }
        for (let i = 0; i < perl.FUNCTIONS.length; i++) {
            delete words[perl.FUNCTIONS[i]];
            let item = new vscode.CompletionItem(perl.FUNCTIONS[i]);
            item.kind = vscode.CompletionItemKind.Function;
            item.detail = "perl function";
            items.push(item);
        }
        for (let i = 0; i < perl.VARIABLES.length; i++) {
            delete words[perl.VARIABLES[i]];
            let item = new vscode.CompletionItem(perl.VARIABLES[i]);
            item.kind = vscode.CompletionItemKind.Variable;
            item.detail = "perl variable";
            items.push(item);
        }

        let useData: string;
        try {
            useData = await ctags.asyncGenerateFileUseTags(document.fileName);
        } catch (error) {
            console.error("error", error);
            return null;
        }

        let usedPackages: string[] = [];
        let currentPackage: string = "";

        let useLines = useData.split("\n");

        for (let i = 0; i < useLines.length; i++) {
            let match = useLines[i].split("\t");
            if (match.length === 4) {
                let kind = match[3].replace(/[^\w]/g, "");
                if (kind === "u") {
                    usedPackages.push(match[0]);
                } else if (kind === "p") {
                    usedPackages.push(match[0]);
                    currentPackage = match[0];
                }
            }
        }

        let methodFiles: FilePackageMap = {};
        let filePackage: FilePackageMap = {};
        let fileItems: FileCompletionItems = {};
        let packageItems: vscode.CompletionItem[] = [];

        let data: string;
        try {
            data = await ctags.asyncGenerateFileUseTags(document.fileName);
        } catch (error) {
            console.error("error", error);
            return null;
        }

        let lines = data.split("\n");
        for (let i = 0; i < lines.length; i++) {
            let match = lines[i].split("\t");

            if (match.length === 4) {
                fileItems[match[1]] = fileItems[match[1]] || [];

                let item = new vscode.CompletionItem(match[0]);
                item.kind = ctags.ITEM_KINDS[match[3].replace(/[^\w]/g, "")];
                item.detail = match[1];

                if (match[3].replace(/[^\w]/g, "") === "p") {
                    filePackage[match[0]] = match[1];
                    packageItems.push(item);
                } else {
                    fileItems[match[1]].push(item);

                    if (match[0] === "new") {
                        methodFiles[match[1]] = "1";
                    }
                }

            }
        }

        if (filePackage[pkg]) {
            let file = filePackage[pkg];
            if (fileItems[file]) {
                fileItems[file].forEach(item => {
                    delete words[item.label];

                    item.insertText = item.label;
                    item.label = `${pkg}::${item.label}`;
                    items.push(item);
                });
            }
        } else if (isMethod) {
            let keys = Object.keys(methodFiles);
            for (let i = 0; i < keys.length; i++) {
                fileItems[keys[i]].forEach(item => {
                    delete words[item.label];
                    items.push(item);
                });
            }
        } else {
            packageItems.forEach(item => {
                delete words[item.label];
                items.push(item);
            });
            usedPackages.forEach(usedPkg => {
                let file = filePackage[usedPkg];
                if (fileItems[file]) {
                    fileItems[file].forEach(item => {
                        delete words[item.label];

                        if (item.label.startsWith("_") && usedPkg === currentPackage) {
                            item.insertText = item.label;
                        }

                        item.label = `${usedPkg}::${item.label}`;
                        items.push(item);
                    });
                }
            });
        }

        let keys = Object.keys(words);
        // console.log(keys.length);
        for (let i = 0; i < keys.length; i++) {
            let item = new vscode.CompletionItem(keys[i]);
            item.kind = vscode.CompletionItemKind.Text;
            items.push(item);
        }

        return items;
    }
};
