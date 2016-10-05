import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import * as ctags from "./ctags";
import * as perl from "./perl";

function getPointBefore(range: vscode.Range, delta: number): vscode.Position {
    let character = range.start.character - delta;
    character = (character > 0) ? character : 0;
    return new vscode.Position(
        range.start.line,
        character
    );
}

function getRangeBefore(range: vscode.Range, delta: number): vscode.Range {
    let point = getPointBefore(range, delta);
    return new vscode.Range(
        point,
        range.start
    );
}

function getPackageBefore(document: vscode.TextDocument, range: vscode.Range): string {
    let separatorRange = getRangeBefore(range, 2);
    let separator = document.getText(separatorRange);
    let pkg = "";

    while (separator === "::") {
        range = document.getWordRangeAtPosition(getPointBefore(separatorRange, 1));
        pkg = document.getText(range) + separator + pkg;
        separatorRange = getRangeBefore(range, 2);
        separator = document.getText(separatorRange);
    }

    return pkg.replace(/::$/, "");
}

function getMatchLocation(line: string): vscode.Location {
    let match = line.split("\t");
    let name = match[0];
    let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

    let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, match[1]));
    let pos = new vscode.Position(lineNo, 0);

    return new vscode.Location(uri, pos);
}

class PerlDefinitionProvider implements vscode.DefinitionProvider, vscode.HoverProvider, vscode.SignatureHelpProvider {
    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
        let wordRange = document.getWordRangeAtPosition(position);
        if (typeof wordRange === "undefined") {
            console.error("No word at pos!");
            return null;
        }

        return new Promise((resolve, reject) => {
            let word = document.getText(wordRange);
            let pkg = getPackageBefore(document, wordRange);
            // console.log(pkg);

            let fileName = document.fileName;
            // console.log(`Looking for "${word}" in "${fileName}"`);

            let matches: string[] = [];
            let pkgMatch: string;

            ctags.readProject((chunk: Buffer) => {
                let lines = chunk.toString().split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.startsWith(`${word}\t`)) {
                        matches.push(line);
                    } else if (line.startsWith(`${pkg}\t`)) {
                        let split = line.split("\t");
                        if (split[3] === "p") {
                            fileName = split[1];
                        }
                    } else if (line.startsWith(`${pkg}::${word}\t`)) {
                        pkgMatch = line;
                    }
                }
            }, (error: Buffer) => {
                console.error("error", error.toString());
                vscode.window.showErrorMessage(`An error occured while reading tags: ${error.toString()}`);
            }, () => {
                fileName = fileName.replace(vscode.workspace.rootPath, ".");
                if (pkgMatch) {
                    return resolve(getMatchLocation(pkgMatch));
                }
                for (let i = 0; i < matches.length; i++) {
                    let match = matches[i].split("\t");

                    if (fileName === match[1] || (i + 1 === matches.length)) {
                        return resolve(getMatchLocation(matches[i]));
                    }
                }
                console.log("Could not find tag");
                return reject("Could not find tag.");
            });
        });
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
        return this.provideDefinition(document, position, token)
            .then(location => {
                return new Promise((resolve, reject) => {
                    fs.readFile(location.uri.fsPath, (err, data) => {
                        if (err) {
                            reject(err);
                        }
                        let lines = data.toString().split(/\r?\n/);
                        let value = "";

                        let end = Math.max(0, location.range.end.line - 5);
                        let index = location.range.start.line;
                        while (index > end) {
                            let line = lines[index];
                            if (line.match(/^\s*#/) && line !== "##") {
                                value = line.trim() + "\n" + value;
                            }
                            index--;
                        }

                        if (value === "") {
                            resolve(null);
                        }

                        let hover = new vscode.Hover({ language: "perl", value: value, });
                        resolve(hover);
                    });
                });
            });
    }

    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
        let callRange = new vscode.Range(position.line, 0, position.line, position.character);
        let callText = document.getText(callRange);

        let offset = position.character - 1;

        let externalCount = 0;
        let internalCount = 0;

        let callIndex = callText.lastIndexOf("(");

        while (offset > -1) {
            let char = callText[offset];
            switch (char) {
                case ",":
                    externalCount++;
                    internalCount++;
                    break;

                case "[":
                    externalCount = externalCount - internalCount;
                    internalCount = 0;
                    break;

                case "]":
                    internalCount = 0;
                    break;

                case "(":
                    callIndex = offset;
                    if (callText.substr(offset - 2, 2) !== "qw") {
                        offset = 0;
                    }
                    break;

                default:
                    break;
            }
            offset--;
        }

        let callPosition = new vscode.Position(position.line, callIndex);

        return this.provideDefinition(document, callPosition, token)
            .then(location => {
                return new Promise((resolve, reject) => {
                    fs.readFile(location.uri.fsPath, (err, data) => {
                        if (err) {
                            reject(err);
                        }

                        let lines = data.toString().split(/\r?\n/);
                        let lastLine = Math.min(lines.length, location.range.end.line + 5);
                        let i = location.range.start.line;
                        let signature = "";
                        while (i < lastLine) {
                            let line = lines[i];
                            if (line.match("@_")) {
                                signature = line;
                            }
                            i++;
                        }

                        // TODO handle fn(['asd', 'omg']) and fn({asd => 'omg'})
                        let params = signature.substring(
                            signature.indexOf("(") + 1,
                            signature.indexOf(")")
                        ).split(",");
                        let info = new vscode.SignatureInformation(signature);
                        for (let param of params) {
                            info.parameters.push(new vscode.ParameterInformation(param.trim()));
                        }

                        let help = new vscode.SignatureHelp();
                        help.activeParameter = externalCount;
                        help.activeSignature = 0;
                        help.signatures.push(info);

                        resolve(help);
                    });
                });
            });
    }
}

class PerlDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            ctags.readFile(document.fileName, (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
                    return reject("An error occured while generating tags");
                }

                let lines = stdout.toString().split("\n");
                let symbols: vscode.SymbolInformation[] = [];

                for (let i = 0; i < lines.length; i++) {
                    let match = lines[i].split("\t");

                    if (match.length === 4) {
                        let name = match[0];
                        let kind = ctags.SYMBOL_KINDS[match[3].replace(/[^\w]/g, "")];
                        if (typeof kind === "undefined") {
                            console.error("Unknown symbol kind:", match[3]);
                            kind = vscode.SymbolKind.Variable;
                        }
                        let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

                        let range = document.lineAt(lineNo).range;

                        let info = new vscode.SymbolInformation(name, kind, range);

                        symbols.push(info);
                    }
                }
                return resolve(symbols);
            });
        });
    }
}

class PerlWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    public provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            let symbols: vscode.SymbolInformation[] = [];
            let lastLine = "";
            ctags.readProject((chunk: Buffer) => {
                let lines = (lastLine + chunk.toString()).split("\n");
                let last = lines.length - 1;
                let match: string[];

                for (let i = 0; i <= last; i++) {
                    match = lines[i].split("\t");

                    if (match.length === 4 && match[0] !== "") {
                        let name = match[0];
                        let kind = ctags.SYMBOL_KINDS[match[3].replace(/[^\w]/g, "")];
                        if (typeof kind === "undefined") {
                            console.error("Unknown symbol kind:", match[3]);
                            kind = vscode.SymbolKind.Variable;
                        }
                        let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

                        let range = new vscode.Range(lineNo, 0, lineNo, 0);

                        let file = match[1].replace(/^\.\\/, "");
                        let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, file));

                        let info = new vscode.SymbolInformation(name, kind, range, uri);

                        symbols.push(info);
                    }
                }

                if (match && match.length !== 4) {
                    lastLine = lines[last];
                } else {
                    lastLine = "";
                }

            }, (error: Buffer) => {
                return resolve(symbols);
            }, () => {
                return resolve(symbols);
            });
        });
    }
}

interface FileCompletionItems {
    [index: string]: vscode.CompletionItem[];
}

interface FilePackageMap {
    [index: string]: string;
}

class PerlCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        let range = document.getWordRangeAtPosition(position);
        let pkg = getPackageBefore(document, range);
        let separator = document.getText(getRangeBefore(range, 2));

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

        return new Promise((resolve, reject) => {
            ctags.readFileUse(document.fileName, (error, stdout, stderr) => {
                let usedPackages: string[] = [];
                let currentPackage: string = "";

                if (error) {
                    vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
                    return "An error occured while generating tags";
                }

                // console.log(stdout);

                let lines = stdout.toString().split("\n");

                for (let i = 0; i < lines.length; i++) {
                    let match = lines[i].split("\t");
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

                ctags.readProject((chunk: Buffer) => {
                    let lines = chunk.toString().split("\n");
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
                }, (error: Buffer) => {
                    console.error("error", error.toString());
                    vscode.window.showErrorMessage(`An error occured while reading tags: ${error.toString()}`);
                    return resolve(items);
                }, () => {
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

                    return resolve(items);
                });
            });
        });
    }
};


class PerlDocumentRangeFormattingEditProvider implements vscode.DocumentRangeFormattingEditProvider {
    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            if (range.start.line !== range.end.line) {
                range = range.with(
                    range.start.with(range.start.line, 0),
                    range.end.with(range.end.line, Number.MAX_VALUE)
                );
            }

            let newText = "";
            let oldText = document.getText(range);
            // let child = cp.spawn("perltidy.bat", ["-q", "-et=4", "-t", "-ce", "-l=0", "-bar", "-naws", "-blbs=2", "-mbl=2"]); // , "-otr"
            let child = cp.spawn("docker", ["exec", "-i", "myconfigura", "perltidy", "-q", "-et=4", "-t", "-ce", "-l=0", "-bar", "-naws", "-blbs=2", "-mbl=2"]); // , "-otr"
            child.stdin.write(oldText);
            child.stdin.end();

            child.stdout.on("data", (out: Buffer) => {
                newText += out.toString();
            });

            child.stderr.on("data", (out: Buffer) => {
                console.error("err", out.toString());
            });

            child.on("error", (out: Buffer) => {
                console.error(out);
            });

            child.on("close", () => {
                if (!oldText.endsWith("\n")) {
                    newText = newText.slice(0, -1); // remove trailing newline
                }
                resolve([new vscode.TextEdit(range, newText)]);
            });
        });
    }
}

export function activate(context: vscode.ExtensionContext) {

    vscode.languages.setLanguageConfiguration(perl.MODE.language, perl.CONFIG);

    let definitionProvider = new PerlDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(perl.MODE, definitionProvider));
    context.subscriptions.push(vscode.languages.registerHoverProvider(perl.MODE, definitionProvider));
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(perl.MODE, definitionProvider, "(", ","));

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(perl.MODE, new PerlCompletionItemProvider()));

    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(perl.MODE, new PerlDocumentSymbolProvider()));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new PerlWorkspaceSymbolProvider()));

    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(perl.MODE, new PerlDocumentRangeFormattingEditProvider()));

    vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId === "perl") {
            ctags.writeProject();
        }
    });

    ctags.writeProject();
}
