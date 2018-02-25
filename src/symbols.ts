import * as vscode from "vscode";
import * as path from "path";
import { Ctags, SYMBOL_KINDS } from "./ctags";

export class PerlSymbolProvider
    implements vscode.DocumentSymbolProvider, vscode.WorkspaceSymbolProvider {
    tags: Ctags;

    constructor(tags: Ctags) {
        this.tags = tags;
    }

    public async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        let result = await this.tags.generateFileTags(document);
        if (result instanceof Error) {
            console.error("error", result);
            throw result;
        }

        let lines = result.data.split("\n");
        let symbols: vscode.SymbolInformation[] = [];

        for (let i = 0; i < lines.length; i++) {
            let match = lines[i].split("\t");

            if (match.length === 4) {
                let name = match[0];
                let kind = SYMBOL_KINDS[match[3].replace(/[^\w]/g, "")];

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

    public async provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        let symbols: vscode.SymbolInformation[] = [];
        let results = await this.tags.readProjectTags();

        for (const tags of results) {
            if (tags instanceof Error) {
                vscode.window.showErrorMessage(`An error occured while reading tags: '${tags}'`);
                continue;
            }

            let lines = tags.data.split("\n");
            let last = lines.length - 1;
            let match: string[];

            for (let i = 0; i <= last; i++) {
                match = lines[i].split("\t");

                if (match.length === 4 && match[0] !== "") {
                    let name = match[0];
                    let kind = SYMBOL_KINDS[match[3].replace(/[^\w]/g, "")];
                    if (typeof kind === "undefined") {
                        console.error("Unknown symbol kind:", match[3]);
                        kind = vscode.SymbolKind.Variable;
                    }
                    let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

                    let range = new vscode.Range(lineNo, 0, lineNo, 0);

                    let file = match[1].replace(/^\.\\/, "");
                    let filePath = path.join(vscode.workspace.rootPath || "", file);
                    let uri = vscode.Uri.file(filePath);

                    let info = new vscode.SymbolInformation(name, kind, range, uri);

                    symbols.push(info);
                }
            }
        }

        return symbols;
    }
}
