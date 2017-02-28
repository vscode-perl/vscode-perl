import * as vscode from "vscode";

import * as utils from "./utils";
import * as ctags from "./ctags";

export class PerlDefinitionProvider implements vscode.DefinitionProvider, vscode.HoverProvider, vscode.SignatureHelpProvider {
    public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location> {
        let wordRange = document.getWordRangeAtPosition(position);
        if (typeof wordRange === "undefined") {
            console.error("No word at pos!");
            return null;
        }

        let data: string;
        try {
            data = await ctags.asyncReadProjectTags();
        } catch (error) {
            console.error("error", error);
            vscode.window.showErrorMessage(`An error occured while reading tags: ${error}`);
            return null;
        }

        let word = document.getText(wordRange);
        let pkg = utils.getPackageBefore(document, wordRange);
        // console.log(pkg);

        let fileName = document.fileName;
        // console.log(`Looking for "${word}" in "${fileName}"`);

        let matches: string[] = [];
        let pkgMatch: string;

        let lines = data.split(/\r?\n/);
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

        fileName = fileName.replace(vscode.workspace.rootPath, ".");
        if (pkgMatch) {
            return utils.getMatchLocation(pkgMatch);
        }
        for (let i = 0; i < matches.length; i++) {
            let match = matches[i].split("\t");

            if (fileName === match[1] || (i + 1 === matches.length)) {
                return utils.getMatchLocation(matches[i]);
            }
        }

        console.log("Could not find tag");
        return null;
    }

    public async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {
        let location: vscode.Location;
        try {
            location = await this.provideDefinition(document, position, token);
        } catch (error) {
            console.error("error", error);
            vscode.window.showErrorMessage(`An error occured while reading tags: ${error}`);
            return null;
        }

        if (!location) {
            return null;
        }

        let data: string;
        try {
            data = await ctags.asyncReadFile(location.uri.fsPath);
        } catch (error) {
            return null;
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
            return null;
        }

        let hover = new vscode.Hover({ language: "perl", value: value, });

        return hover;

    }

    public async provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        let callRange = new vscode.Range(position.line, 0, position.line, position.character);
        let callText = document.getText(callRange);

        let offset = position.character - 1;

        let externalCount = 0;
        let internalCount = 0;

        let callIndex = callText.lastIndexOf("(");

        if (callIndex < 0) {
            console.log("could not find opening parens");
            return null;
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

        let location: vscode.Location;
        try {
            location = await this.provideDefinition(document, position, token);
        } catch (error) {
            console.error("error", error);
            vscode.window.showErrorMessage(`An error occured while reading tags: ${error}`);
            return null;
        }

        let data: string;
        try {
            data = await ctags.asyncReadFile(location.uri.fsPath);
        } catch (error) {
            return null;
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

        return help;
    }
}
