import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const PERL_MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };

class PerlDefinitionProvider implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		return new Promise((resolve, reject) => {
			let range = document.getWordRangeAtPosition(position);
			let word = document.getText(range);
			console.log(word);

			let wordRegexp = new RegExp(`\\x7f${word}\\x01(\\d+)`);
			let fileRegexp = new RegExp("(.*),\\d");
			let dir = path.dirname(document.uri.fsPath);
			console.log(dir);

			let fileName: string;
			let lineNumber: number;

			let stream = fs.createReadStream(path.join(dir, "TAGS"));
			stream.on("data", (chunk: Buffer) => {
				let sections = chunk.toString().split("\x0c");
				sections.forEach(section => {
					let lines = section.split("\n");
					lines.forEach(line => {
						let match = line.match(wordRegexp);
						if (match) {
							lineNumber = parseInt(match[1]);
							fileName = lines[1].match(fileRegexp)[1];

							let uri = vscode.Uri.file(path.join(dir, fileName));
							let pos = new vscode.Position(lineNumber - 1, 0);

							resolve(new vscode.Location(uri, pos));
						}
					});
				});
			});

		});
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log("Congratulations, your extension \"vscode-perl\" is now active!");


	context.subscriptions.push(vscode.languages.registerDefinitionProvider(PERL_MODE, new PerlDefinitionProvider()));
}
