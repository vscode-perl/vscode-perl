import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {CompletionItemKind, SymbolKind} from "vscode";


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

function exec(args: string[], callback: (error: Error, stdout: string, stderr: string) => void) {
    cp.execFile("ctags", ["--languages=perl", "-n", "--fields=k"].concat(args), {
        cwd: vscode.workspace.rootPath
    }, callback);
}

export function readFile(fileName: string, callback: (error: Error, stdout: string, stderr: string) => void) {
    exec(["-f", "-", fileName], callback);
}

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

export function readProject(data: (data: Buffer) => void, error: (error: Buffer) => void, end: () => void) {
    let tags = path.join(vscode.workspace.rootPath, TAGS_FILE);
    let stream = fs.createReadStream(tags);
    stream.on("data", data);
    stream.on("error", error);
    stream.on("end", end);
}
