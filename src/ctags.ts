import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CompletionItemKind, SymbolKind } from "vscode";

const TAGS_FILE = ".vstags";
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
            let env = { cwd: vscode.workspace.rootPath };
            let cb = (error: Error, stdout: string, stderr: string) => {
                if (error) {
                    reject(error);
                }
                resolve(stdout);
            };

            cp.execFile("ctags", args, env, cb);
        });
    }

    generateProjectTagsFile(): Promise<void> {
        let args = DEFAULT_ARGS.concat(["-R", "--perl-kinds=psc", "-f", TAGS_FILE]);
        return this.checkVersion()
            .then(() => this.run(args))
            .then(out => {
                vscode.window.setStatusBarMessage(TAGS_FILE + " file generated.", 5000);
            });
    }

    generateFileTags(fileName: string): Promise<string> {
        let args = DEFAULT_ARGS.concat(["-f", "-", fileName]);
        return this.checkVersion()
            .then(() => this.run(args));
    }

    generateFileUseTags(fileName: string): Promise<string> {
        let args = DEFAULT_ARGS.concat([EXTRA["use"], "-f", "-", fileName]);
        return this.checkVersion()
            .then(() => this.run(args));
    }

    // reading tags (and other) files

    readFile(fileName: string) {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(fileName, (error, data) => {
                if (error) {
                    reject(error);
                }
                resolve(data.toString());
            });
        });
    }

    readProjectTags() {
        let tags = path.join(vscode.workspace.rootPath, TAGS_FILE);
        return this.readFile(tags);
    }

}