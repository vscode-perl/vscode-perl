import * as vscode from "vscode";
import * as path from "path";

import * as utils from "./utils";
import { Ctags } from "./ctags";

export class PerlDefinitionProvider
    implements vscode.DefinitionProvider, vscode.HoverProvider, vscode.SignatureHelpProvider {
    tags: Ctags;

    constructor(tags: Ctags) {
        this.tags = tags;
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<Option<vscode.Location>> {
        let wordRange = document.getWordRangeAtPosition(position);
        if (wordRange === undefined) {
            return;
        }

        let dataz = await this.tags.projectOrFileTags(document);

        let word = document.getText(wordRange);
        let pkg = utils.getPackageBefore(document, wordRange);

        let fileName = document.fileName;

        let matches: { line: string; folder: string }[] = [];
        let pkgMatch: Option<string>;
        let pkgMatchFolder = "";

        for (const tags of dataz) {
            if (tags instanceof Error) {
                continue;
            }
            const folder = tags.folder;
            let lines = tags.data.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (line.startsWith(`${word}\t`)) {
                    matches.push({ line, folder });
                } else if (line.startsWith(`${pkg}\t`)) {
                    let split = line.split("\t");
                    if (split[3] === "p") {
                        fileName = split[1];
                    }
                } else if (line.startsWith(`${pkg}::${word}\t`)) {
                    pkgMatch = line;
                    pkgMatchFolder = tags.folder;
                }
            }
        }

        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspace !== undefined) {
            fileName = fileName.replace(workspace.uri.fsPath, ".");
        }

        if (pkgMatch) {
            return utils.getMatchLocation(pkgMatch, pkgMatchFolder);
        }

        for (let i = 0; i < matches.length; i++) {
            let match = matches[i];
            let split = match.line.split("\t");

            if (fileName === split[1] || i + 1 === matches.length) {
                return utils.getMatchLocation(match.line, match.folder);
            }
        }

        return;
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<Option<vscode.Hover>> {
        let location = await this.provideDefinition(document, position, token);
        if (location === undefined) {
            return;
        }

        let workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        let data = await this.tags.readFile(location.uri.fsPath);
        if (data instanceof Error) {
            console.error(data);
            return;
        }

        let lines = data.split(/\r?\n/);
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
            return;
        }

        let hover = new vscode.Hover({ language: "perl", value: value });

        return hover;
    }

    public async provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<Option<vscode.SignatureHelp>> {
        let callRange = new vscode.Range(position.line, 0, position.line, position.character);
        let callText = document.getText(callRange);

        let offset = position.character - 1;

        let externalCount = 0;
        let internalCount = 0;

        let callIndex = callText.lastIndexOf("(");

        if (callIndex < 0) {
            return;
        }

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

        let location = await this.provideDefinition(document, callPosition, token);
        if (location === undefined) {
            return;
        }

        let data = await this.tags.readFile(location.uri.fsPath);
        if (data instanceof Error) {
            console.error(data);
            return;
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
        let params = signature
            .substring(signature.indexOf("(") + 1, signature.indexOf(")"))
            .split(",");
        let info = new vscode.SignatureInformation(signature);
        for (let param of params) {
            info.parameters.push(new vscode.ParameterInformation(param.trim()));
        }

        let help = new vscode.SignatureHelp();
        help.activeParameter = externalCount;
        help.activeSignature = 0;
        help.signatures.push(info);

        return help;
    }
}
