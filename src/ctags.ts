import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CompletionItemKind, SymbolKind } from "vscode";

const DEFAULT_ARGS = ["--languages=perl", "-n", "--fields=k"];
const EXTRA = {
    use: "--regex-perl=/^[ \\t]*use[ \\t]+['\"]*([A-Za-z][A-Za-z0-9:]+)['\" \\t]*;/\\1/u,use,uses/",
    require:
        "--regex-perl=/^[ \\t]*require[ \\t]+['\"]*([A-Za-z][A-Za-z0-9:]+)['\" \\t]*/\\1/r,require,requires/",
    variable:
        "--regex-perl=/^[ \\t]*my[ \\t(]+([$@%][A-Za-z][A-Za-z0-9:]+)[ \\t)]*/\\1/v,variable/",
};

export const ITEM_KINDS: { [index: string]: Option<CompletionItemKind> } = {
    p: CompletionItemKind.Module,
    s: CompletionItemKind.Function,
    r: CompletionItemKind.Reference,
    v: CompletionItemKind.Variable,
    c: CompletionItemKind.Value,
};

export const SYMBOL_KINDS: { [index: string]: Option<SymbolKind> } = {
    p: SymbolKind.Package,
    s: SymbolKind.Function,
    l: SymbolKind.Constant,
    c: SymbolKind.Constant,
};

export interface TagsFile {
    folder: string;
    data: string;
}

export class Ctags {
    versionOk = false;
    generatingProjectTags = false;

    private getConfiguration(resource?: vscode.Uri): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("perl", resource);
    }

    getTagsFileName(resource: vscode.Uri): string {
        return this.getConfiguration(resource).get("ctagsFile", ".vstags");
    }

    getExecutablePath(): string {
        return this.getConfiguration().get("ctagsPath", "ctags");
    }

    async checkVersion(): Promise<Option<Error>> {
        if (this.versionOk) {
            return undefined;
        }

        const result = await this.run(["--version"]);
        if (result instanceof Error) {
            return Error(
                "Could not find a compatible version of Ctags, check extension log for more info."
            );
        }

        this.versionOk = true;

        return;
    }

    // running ctags

    private async run(args: string[], cwd?: string) {
        return new Promise<Result<string>>((resolve, reject) => {
            const file = this.getExecutablePath();
            let callback = (error: Error | null, stdout: string, stderr: string) => {
                if (error) {
                    console.error(`command failed: '${file} ${args.join(" ")}'`);
                    console.error(`cwd: '${cwd}'`);
                    console.error(`error message: '${error.message}'`);
                    console.error(`stderr: '${stderr}'`);
                    resolve(error);
                }
                resolve(stdout);
            };

            let options: cp.ExecFileOptions = {};
            if (cwd !== undefined) {
                options.cwd = cwd;
            }
            cp.execFile(this.getExecutablePath(), args, options, callback);
        });
    }

    async generateProjectTagsFile(): Promise<Array<Result<String>>> {
        if (this.generatingProjectTags) {
            return [];
        }
        this.generatingProjectTags = true;

        const folders = vscode.workspace.workspaceFolders;
        if (folders === undefined) {
            return [];
        }

        let error = await this.checkVersion();
        if (error !== undefined) {
            return [error];
        }

        const jobs = folders.map(folder => this.generateProjectFolderTagsFile(folder));
        try {
            return await Promise.all(jobs);
        } catch (e) {
            if (e instanceof Error) {
                return [e];
            }
            console.error(e);
            return [Error("unknown error when generating project tags.")];
        } finally {
            this.generatingProjectTags = false;
        }
    }

    async generateProjectFolderTagsFile(folder: vscode.WorkspaceFolder) {
        let filename = this.getTagsFileName(folder.uri);
        let args = DEFAULT_ARGS.concat(["-R", "--perl-kinds=psc", "-f", filename]);

        let res = await this.run(args, folder.uri.fsPath);
        if (
            !(res instanceof Error) ||
            !res.message.match(/doesn't look like a tag file; I refuse to overwrite it./)
        ) {
            return res;
        }

        let remove = await asyncUnlink(path.join(folder.uri.fsPath, filename));
        if (remove instanceof Error) {
            return res;
        }

        return this.run(args, folder.uri.fsPath);
    }

    async generateFileTags(document: vscode.TextDocument): Promise<Result<TagsFile>> {
        let args = DEFAULT_ARGS.concat(["-f", "-", document.fileName]);
        let workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        let folder = workspace ? workspace.uri.fsPath : document.uri.fsPath;

        const data = await this.checkVersion().then(() => this.run(args, folder));
        if (data instanceof Error) {
            return data;
        }

        return { folder, data };
    }

    generateFileUseTags(document: vscode.TextDocument): Promise<Result<string>> {
        let args = DEFAULT_ARGS.concat([EXTRA["use"], "-f", "-", document.fileName]);
        let workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        let cwd = workspace ? workspace.uri.fsPath : document.uri.fsPath;
        return this.checkVersion().then(() => this.run(args, cwd));
    }

    // reading tags (and other) files

    readFile(filename: string) {
        return new Promise<Result<string>>((resolve, reject) => {
            fs.readFile(filename, (error, data) => {
                if (error) {
                    console.error(`could not read file: ${filename}`);
                    console.error(`error message: ${error.message}`);
                    resolve(error);
                    return;
                }
                resolve(data.toString());
            });
        });
    }

    async readProjectTags(): Promise<Result<TagsFile>[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (folders === undefined) {
            return [];
        }

        return Promise.all(
            folders.map(folder => {
                let filename = path.join(folder.uri.fsPath, this.getTagsFileName(folder.uri));
                return this.readFile(filename).then(data => {
                    if (data instanceof Error) {
                        return data;
                    }
                    return { folder: folder.uri.fsPath, data };
                });
            })
        );
    }

    async projectOrFileTags(document: vscode.TextDocument): Promise<Result<TagsFile>[]> {
        const results = await this.readProjectTags();
        if (results.length !== 0) {
            return results;
        }

        const result = await this.generateFileTags(document);
        return [result];
    }
}

async function asyncUnlink(filename: string) {
    return new Promise<Result<null>>((resolve, reject) => {
        fs.unlink(filename, err => {
            if (err) {
                resolve(err);
            }
            resolve(null);
        });
    });
}
