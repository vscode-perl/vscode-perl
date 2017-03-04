import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CompletionItemKind, SymbolKind } from "vscode";

const DEFAULT_ARGS = ["--languages=perl", "-n", "--fields=k"];
const EXTRA = {
    "use": "--regex-perl=\/^[ \\t]*use[ \\t]+['\"]*([A-Za-z][A-Za-z0-9:]+)['\" \\t]*;\/\\1\/u,use,uses\/",
    "require": "--regex-perl=\/^[ \\t]*require[ \\t]+['\"]*([A-Za-z][A-Za-z0-9:]+)['\" \\t]*\/\\1\/r,require,requires\/",
    "variable": "--regex-perl=\/^[ \\t]*my[ \\t(]+([$@%][A-Za-z][A-Za-z0-9:]+)[ \\t)]*\/\\1\/v,variable\/"
};

export const ITEM_KINDS = {
    p: CompletionItemKind.Module,
    s: CompletionItemKind.Function,
    r: CompletionItemKind.Reference,
    v: CompletionItemKind.Variable,
    c: CompletionItemKind.Value,
};

export const SYMBOL_KINDS = {
    p: SymbolKind.Package,
    s: SymbolKind.Function,
    l: SymbolKind.Constant,
    c: SymbolKind.Constant,
};


export class Ctags {
    versionOk = false;

    checkVersion(): Promise<void> {
        if (this.versionOk) {
            return Promise.resolve();
        }

        return this.run(["--version"])
            .then(out => {
                this.versionOk = true;
            });
    }

    // running ctags

    private run(args: string[]) {
        return new Promise<string>((resolve, reject) => {
            let options = {
                cwd: vscode.workspace.rootPath
            };
            let callback = (error: Error, stdout: string, stderr: string) => {
                if (error) {
                    reject(error);
                }
                resolve(stdout);
            };

            cp.execFile("ctags", args, options, callback);
        });
    }

    getFileName(): string {
        return vscode.workspace.getConfiguration("perl.ctags").get("tagsfile", ".vstags");
    }

    generateProjectTagsFile(): Promise<void> {
        let filename = this.getFileName();
        let args = DEFAULT_ARGS.concat(["-R", "--perl-kinds=psc", "-f", filename]);
        return this.checkVersion()
            .then(() => this.run(args))
            .then(out => {
                vscode.window.setStatusBarMessage(filename + " file generated.", 5000);
            });
    }

    generateFileTags(filename: string): Promise<string> {
        let args = DEFAULT_ARGS.concat(["-f", "-", filename]);
        return this.checkVersion()
            .then(() => this.run(args));
    }

    generateFileUseTags(filename: string): Promise<string> {
        let args = DEFAULT_ARGS.concat([EXTRA["use"], "-f", "-", filename]);
        return this.checkVersion()
            .then(() => this.run(args));
    }

    // reading tags (and other) files

    readFile(filename: string) {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(filename, (error, data) => {
                if (error) {
                    return reject(error);
                }
                resolve(data.toString());
            });
        });
    }

    readProjectTags() {
        let filename = path.join(vscode.workspace.rootPath, this.getFileName());
        return this.readFile(filename);
    }

}