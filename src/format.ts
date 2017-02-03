import * as vscode from "vscode";
import * as cp from "child_process";

export class PerlFormattingProvider implements vscode.DocumentRangeFormattingEditProvider {
    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            if (range.start.line !== range.end.line) {
                range = range.with(
                    range.start.with(range.start.line, 0),
                    range.end.with(range.end.line, Number.MAX_VALUE)
                );
            }

            let newText = "";
            let oldText = document.getText(range);
            // let child = cp.spawn("perltidy.bat", ["-q", "-et=4", "-t", "-ce", "-l=0", "-bar", "-naws", "-blbs=2", "-mbl=2"]); // , "-otr"
            let child = cp.spawn("docker", ["exec", "-i", "myconfigura", "perltidy", "-q", "-et=4", "-t", "-ce", "-l=0", "-bar", "-naws", "-blbs=2", "-mbl=2"]); // , "-otr"
            child.stdin.write(oldText);
            child.stdin.end();

            child.stdout.on("data", (out: Buffer) => {
                newText += out.toString();
            });

            child.stderr.on("data", (out: Buffer) => {
                console.error("err", out.toString());
            });

            child.on("error", (out: Buffer) => {
                console.error(out);
            });

            child.on("close", () => {
                if (!oldText.endsWith("\n")) {
                    newText = newText.slice(0, -1); // remove trailing newline
                }
                resolve([new vscode.TextEdit(range, newText)]);
            });
        });
    }
}
