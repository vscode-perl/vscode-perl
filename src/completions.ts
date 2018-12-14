import * as vscode from "vscode";

import { Ctags, ITEM_KINDS } from "./ctags";
import * as perl from "./perl";
import * as utils from "./utils";

interface FileCompletionItems {
    [index: string]: vscode.CompletionItem[];
}

interface FilePackageMap {
    [index: string]: string;
}

interface WordMap {
    [index: string]: boolean;
}

function addCompletions(
    items: vscode.CompletionItem[],
    words: WordMap,
    completions: string[],
    kind: vscode.CompletionItemKind,
    detail: string
) {
    for (let i = 0; i < completions.length; i++) {
        let word = completions[i];

        delete words[word];

        let item = new vscode.CompletionItem(word, kind);
        item.detail = detail;

        items.push(item);
    }
}

function addLanguageCompletions(items: vscode.CompletionItem[], words: WordMap) {
    addCompletions(items, words, perl.KEYWORDS, vscode.CompletionItemKind.Keyword, "perl keyword");
    addCompletions(
        items,
        words,
        perl.FUNCTIONS,
        vscode.CompletionItemKind.Function,
        "perl function"
    );
    addCompletions(
        items,
        words,
        perl.VARIABLES,
        vscode.CompletionItemKind.Variable,
        "perl variable"
    );
}

export class PerlCompletionProvider implements vscode.CompletionItemProvider {
    tags: Ctags;

    constructor(tags: Ctags) {
        this.tags = tags;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[]> {
        let text = document.getText();

        let words: WordMap = {};
        let word: RegExpExecArray | null;
        while ((word = perl.CONFIG.wordPattern.exec(text))) {
            words[word[0]] = true;
        }

        let currentWordRange = document.getWordRangeAtPosition(position);
        let currentWord = document.getText(currentWordRange);
        delete words[currentWord];

        let items: vscode.CompletionItem[] = [];
        addLanguageCompletions(items, words);

        const useData = await this.tags.generateFileUseTags(document);
        const dataz = await this.tags.projectOrFileTags(document);
        if (useData instanceof Error) {
            return [];
        }

        let usedPackages: string[] = [];
        let currentPackage = "";
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

        for (const tags of dataz) {
            if (tags instanceof Error) {
                continue;
            }
            let lines = tags.data.split("\n");
            for (let i = 0; i < lines.length; i++) {
                let match = lines[i].split("\t");

                if (match.length === 4) {
                    fileItems[match[1]] = fileItems[match[1]] || [];

                    let item = new vscode.CompletionItem(match[0]);
                    item.kind = ITEM_KINDS[match[3].replace(/[^\w]/g, "")];
                    item.detail = match[1];

                    if (match[3].replace(/[^\w]/g, "") === "p") {
                        filePackage[match[0]] = match[1];
                        packageItems.push(item);
                    } else if (match[0].indexOf("::") === -1) {
                        fileItems[match[1]].push(item);

                        if (match[0] === "new") {
                            methodFiles[match[1]] = "1";
                        }
                    }
                }
            }
        }

        let pkg = currentWordRange ? utils.getPackageBefore(document, currentWordRange) : "";
        let separator = currentWordRange
            ? document.getText(utils.getRangeBefore(currentWordRange, 2))
            : "";
        let isMethod = separator === "->";

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
        for (let i = 0; i < keys.length; i++) {
            let item = new vscode.CompletionItem(keys[i]);
            item.kind = vscode.CompletionItemKind.Text;
            items.push(item);
        }

        return items;
    }
}
