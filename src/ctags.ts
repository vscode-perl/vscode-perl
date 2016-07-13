import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from 'vscode'

const TAGS_FILE = "tags";

export function read(data: (data:Buffer)=>void, error: (error:Buffer)=>void, end: ()=>void) {
    let tags = path.join(vscode.workspace.rootPath, TAGS_FILE);
    let stream = fs.createReadStream(tags);
    stream.on("data", data);
    stream.on("error", error);
    stream.on("end", end);
}

export function write() {
    cp.execFile("ctags", ["-R", "-n", "--languages=perl", "--perl-kinds=ps", "--fields=k", "-f", TAGS_FILE], {
        cwd: vscode.workspace.rootPath
    }, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
        }
        console.log("Tags generated.");
    });
}