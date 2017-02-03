import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CompletionItemKind, SymbolKind } from "vscode";


const TAGS_FILE = ".vstags";

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

// FILE

function exec(args: string[], callback: (error: Error, stdout: string, stderr: string) => void) {
    cp.execFile("ctags", ["--languages=perl", "-n", "--fields=k"].concat(args), {
        cwd: vscode.workspace.rootPath
    }, callback);
}

// export function readFile(fileName: string, callback: (error: Error, stdout: string, stderr: string) => void) {
//     exec(["-f", "-", fileName], callback);
// }

export function readFileUse(fileName: string, callback: (error: Error, stdout: string, stderr: string) => void) {
    exec([EXTRA["use"], "-f", "-", fileName], callback);
}

export function writeProject() {
    exec(["-R", "--perl-kinds=psc", "-f", TAGS_FILE], (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
        }
        console.log("Tags generated.");
    });
}

export function asyncGenerateFileTags(fileName: string) {
    return new Promise<string>((resolve, reject) => {
        exec(["-f", "-", fileName], (error, stdout, stderr) => {
            if (error) {
                reject(`An error occured while generating tags: ${stderr.toString()}`);
            }
            resolve(stdout);
        });
    });
}

export function asyncGenerateFileUseTags(fileName: string) {
    return new Promise<string>((resolve, reject) => {
        exec([EXTRA["use"], "-f", "-", fileName], (error, stdout, stderr) => {
            if (error) {
                reject(`An error occured while generating tags: ${stderr.toString()}`);
            }
            resolve(stdout);
        });
    });
}

// PROJECT

export function readProject(data: (data: Buffer) => void, error: (error: Buffer) => void, end: () => void) {
    let tags = path.join(vscode.workspace.rootPath, TAGS_FILE);
    let stream = fs.createReadStream(tags);
    stream.on("data", data);
    stream.on("error", error);
    stream.on("end", end);
}

export function asyncReadProjectTags() {
    let tags = path.join(vscode.workspace.rootPath, TAGS_FILE);
    return asyncReadFile(tags);
}

export function asyncReadFile(filename: string) {
    return new Promise<string>((resolve, reject) => {
        let stream = fs.createReadStream(filename);

        let data = "";
        stream.on("data", buf => {
            data += buf.toString();
        });

        let error = "";
        stream.on("error", buf => {
            error += buf.toString();
        });

        stream.on("end", () => {
            if (error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}
