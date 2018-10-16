import * as vscode from "vscode";
import * as path from "path";
import { Ctags, SYMBOL_KINDS } from "./ctags";

export class PerlSymbolProvider
    implements vscode.DocumentSymbolProvider, vscode.WorkspaceSymbolProvider {
    tags: Ctags;

    constructor(tags: Ctags) {
        this.tags = tags;
    }

    getMaxSymbolResults(): number {
        let config = vscode.workspace.getConfiguration("perl");
        return config.get("maxSymbolResults", 500);
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
        if (query.length < 2) {
            return [];
        }

        var symbolMap : Map<number, vscode.SymbolInformation[]> = new Map<number, vscode.SymbolInformation[]>();
        let queryLength = query.length;

        /*
            Symbol match in vscode looks for characters after a break in the symbol, in this case :: or |

            To accomodate this the query is split into parts, between each character of the query we
            check if we can ignore the rest of the symbol up to either :: or |. Then we check if the next
            symbol character matches the next query character.
        */
        query = query.split("").join("(.*?(_|::)+)*");
        let projectTags = await this.tags.readProjectTags();
        for (const tags of projectTags) {
            if (tags instanceof Error) {
                vscode.window.showErrorMessage(`An error occured while reading tags: '${tags}'`);
                continue;
            }

            let lines = tags.data.split("\n");
            let last = lines.length - 1;
            let match: string[];
            let regxQuery = new RegExp(query, "gi");

            for (let i = 0; i <= last; i++) {
                match = lines[i].split("\t");

                if (match.length === 4 && match[0] !== "") {
                    let name = match[0];
                    let kind = SYMBOL_KINDS[match[3].replace(/[^\w]/g, "")];
                    if (typeof kind === "undefined") {
                        console.error("Unknown symbol kind:", match[3]);
                        kind = vscode.SymbolKind.Variable;
                    }

                    let regxResult = regxQuery.exec(name);
                    if (regxResult) {
                        let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

                        let range = new vscode.Range(lineNo, 0, lineNo, 0);

                        let file = match[1].replace(/^\.\\/, "");
                        let filePath = path.join(vscode.workspace.rootPath || "", file);
                        let uri = vscode.Uri.file(filePath);

                        let info = new vscode.SymbolInformation(name, kind, range, uri);

                        // In order to improve performance we store the results in a map, based on the match's length compared to the query length. Lower is better.
                        let key = (regxResult[0].length - queryLength);
                        let symbolArray: vscode.SymbolInformation[] = [];
                        if (!symbolMap.has(key)) {
                            symbolMap.set(key, symbolArray);
                        } else {
                            symbolArray = symbolMap.get(key) || [];
                        }
                        symbolArray.push(info);
                    }
                }
            }
        }

        const maxResults = this.getMaxSymbolResults();
        let symbols: vscode.SymbolInformation[] = [];

        //Sort the keys so that we first look at the shortest matches, until we have enough results.
        let keys = [...symbolMap.keys()].sort((a: number, b: number) => a - b);
        keys.forEach(key => {
            if (symbols.length < maxResults) {
                let symbolArray: vscode.SymbolInformation[] = symbolMap.get(key) || [];
                symbolArray.forEach(symbol => {
                    if (symbols.length < maxResults) {
                        symbols.push(symbol);
                    } else {
                        return;
                    }
                });
            } else {
                return;
            }
        });
        return symbols;
    }
}
