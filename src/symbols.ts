import * as vscode from "vscode";
import * as path from "path";
import * as ctags from "./ctags";

export class PerlSymbolProvider implements vscode.DocumentSymbolProvider, vscode.WorkspaceSymbolProvider {
    public async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {

        let data: string;
        try {
            data = await ctags.asyncGenerateFileTags(document.fileName);
        } catch (error) {
            console.error("error", error);
            return null;
        }

        let lines = data.split("\n");
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

        return symbols;
    }

    public async provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
        let data: string;
        try {
            data = await ctags.asyncReadProjectTags();
        } catch (error) {
            console.error("error", error);
            vscode.window.showErrorMessage(`An error occured while reading tags: ${error}`);
            return null;
        }

        let symbols: vscode.SymbolInformation[] = [];

        let lines = data.split("\n");
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

        return symbols;
    }
}
