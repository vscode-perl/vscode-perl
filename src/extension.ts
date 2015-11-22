import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";

const PERL_MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };

let fileRegexp = /^(.*),\d+$/;
let tagsFile = "TAGS";

class PerlDefinitionProvider implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		return new Promise((resolve, reject) => {
			let range = document.getWordRangeAtPosition(position);
			let word = document.getText(range);
			let wordRegexp = new RegExp(`\\x7f${word}\\x01(\\d+)`);

			let tags = path.join(vscode.workspace.rootPath, tagsFile);

			let stream = fs.createReadStream(tags);
			stream.on("data", (chunk: Buffer) => {
				let sections = chunk.toString().split("\x0c");
				for (var i = 0; i < sections.length; i++) {
					let section = sections[i];
					let lines = section.split("\n");
					for (var j = 0; j < lines.length; j++) {
						var line = lines[j];
						let match = line.match(wordRegexp);
						if (match) {
							let fileMatch = lines[1].match(fileRegexp);
							if (!fileMatch) {
								return reject("No file matched!");
							}

							let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, fileMatch[1]));
							let pos = new vscode.Position(parseInt(match[1]) - 1, 0);
							return resolve(new vscode.Location(uri, pos));
						}
						if (token.isCancellationRequested) {
							return reject("Cancelled.");
						}
					}
				}
				return reject("Could not find tag.");
			});

			stream.on("error", (error: Buffer) => {
				vscode.window.showErrorMessage(`An error occured while generating tags: ${error.toString() }`);
				console.error(error.toString());
			});

			stream.on("close", close => {
				console.log(close);
			});

			stream.on("end", end => {
				console.log(end);
			});
		});
	}
}

let symbolKindMap = {
	p: vscode.SymbolKind.Package,
	s: vscode.SymbolKind.Function
};

class PerlDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
		return new Promise((resolve, reject) => {
			let cmd = `ctags --languages=perl --fields=kn -f - ${document.fileName}`;
			cp.exec(cmd, (error, stdout, stderr) => {
				console.log(cmd, error, stdout.toString(), stderr.toString());
				if (error) {
					vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString() }`);
					return reject("An error occured while generating tags");
				}

				let lines = stdout.toString().split("\n");
				let symbols: vscode.SymbolInformation[] = [];

				for (var i = 0; i < lines.length; i++) {
					let match = lines[i].split("\t");

					if (match.length === 5) {
						let name = match[0];
						let kind = symbolKindMap[match[3]];
						let line = match[4].replace("line:", "");

						let position = new vscode.Position(parseInt(line) - 1, 5);
						let range = document.getWordRangeAtPosition(position);
						let info = new vscode.SymbolInformation(name, kind, range);

						symbols.push(info);
					}
				}
				return resolve(symbols);
			});
		});
	}
}

function makeTags() {
	let s = cp.exec(`ctags -R -e --languages=perl --extra=+q -f ${tagsFile}`, {
		cwd: vscode.workspace.rootPath
	}, (error, stdout, stderr) => {
		if (error) {
			vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString() }`);
		}
		console.log("Tags generated.");
		console.log(error, stdout.toString(), stderr.toString());
	});
};

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(PERL_MODE, new PerlDefinitionProvider()));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(PERL_MODE, new PerlDocumentSymbolProvider()));

	vscode.languages.setLanguageConfiguration(PERL_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\'\"\,\.\<\>\/\?\s]+)/g,
		comments: {
			lineComment: "#",
		},
		brackets: [
			["{", "}"],
			["[", "]"],
			["(", ")"],
			["|", "|"],
			["/", "/"],
		],

		__characterPairSupport: {
			autoClosingPairs: [
				{ open: "/", close: "/" },
				{ open: "|", close: "|" },
				{ open: "{", close: "}" },
				{ open: "[", close: "]" },
				{ open: "(", close: ")" },
				{ open: "\"", close: "\"", notIn: ["string"] },
				{ open: "'", close: "'", notIn: ["string", "comment"] }
			]
		}
	});

	vscode.workspace.onDidSaveTextDocument(document => {
		if (document.languageId == "perl") {
			makeTags();
		}
	});

	makeTags();
}
