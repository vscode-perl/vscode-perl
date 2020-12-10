import * as vscode from "vscode";
import * as path from "path";

export function getPointBefore(range: vscode.Range, delta: number): vscode.Position {
    let character = range.start.character - delta;
    character = character > 0 ? character : 0;
    return new vscode.Position(range.start.line, character);
}

export function getRangeBefore(range: vscode.Range, delta: number): vscode.Range {
    let point = getPointBefore(range, delta);
    return new vscode.Range(point, range.start);
}

export function getPackageBefore(document: vscode.TextDocument, range: vscode.Range): string {
    let separatorRange = getRangeBefore(range, 2);
    let separator = document.getText(separatorRange);
    let pkg = "";

    while (separator === "::" || separator === "->") {
        const newRange = document.getWordRangeAtPosition(getPointBefore(separatorRange, 1));
        if (newRange) {
            range = newRange;
            pkg = document.getText(range) + separator + pkg;
            separatorRange = getRangeBefore(range, 2);
            separator = document.getText(separatorRange);
        } else {
            // break loop
            separator = "";
        }
    }

    return pkg.replace(/(::|->)$/, "");
}

export function getMatchLocation(line: string, rootPath?: string): vscode.Location {
    let match = line.split("\t");
    let name = match[0];
    let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

    let filePath = path.join(rootPath || "", match[1]);
    let uri = vscode.Uri.file(filePath);
    let pos = new vscode.Position(lineNo, 0);

    return new vscode.Location(uri, pos);
}
