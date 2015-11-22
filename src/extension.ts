import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";

const PERL_MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };

let fileRegexp = /^(.*),\d+$/;
let tagsFile = "tags";

function parseLine(line: string): vscode.Location {
	let match = line.split("\t");

	let name = match[0];
	let fileName = match[1];
	let lineNo = parseInt(match[4].replace("line:", "")) - 1;

	let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, fileName));
	let pos = new vscode.Position(lineNo, 0);

	return new vscode.Location(uri, pos);
}

class PerlDefinitionProvider implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		return new Promise((resolve, reject) => {
			let range = document.getWordRangeAtPosition(position);
			let word = document.getText(range);
			let fileName = document.fileName.replace(vscode.workspace.rootPath + "/", "");
			console.log(`Loking for "${word}" in "${fileName}"`);

			let tags = path.join(vscode.workspace.rootPath, tagsFile);
			let stream = fs.createReadStream(tags);
			let match: string;
			let resolved = false;

			stream.on("data", (chunk: Buffer) => {
				if (resolved) {
					return;
				};

				let lines = chunk.toString().split("\n");
				for (var i = 0; i < lines.length; i++) {
					var line = lines[i];
					if (line.startsWith(`${word}\t`)) {
						if (line.startsWith(`${word}\t${fileName}`)) {
							resolved = true;
							return resolve(parseLine(line));
						} else {
							match = line;
						}
					};
				}
			});

			stream.on("error", (error: Buffer) => {
				console.error("error", error.toString());
				vscode.window.showErrorMessage(`An error occured while generating tags: ${error.toString() }`);
			});

			stream.on("end", () => {
				if (resolved) {
					return;
				} else if (match) {
					return resolve(parseLine(match));
				} else {
					return reject("Could not find tag.");
				}
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
			cp.execFile("ctags", ["--languages=perl", "--fields=kn", "-f", "-", document.fileName], {
				cwd: vscode.workspace.rootPath
			}, (error, stdout, stderr) => {
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
						let lineNo = parseInt(match[4].replace("line:", "")) - 1;

						let position = new vscode.Position(lineNo, 1);
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
	cp.execFile("ctags", ["-R", "--languages=perl", "--fields=kn", "-f", tagsFile], {
		cwd: vscode.workspace.rootPath
	}, (error, stdout, stderr) => {
		if (error) {
			vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString() }`);
		}
		console.log("Tags generated.");
	});
};

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(PERL_MODE, new PerlDefinitionProvider()));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(PERL_MODE, new PerlDocumentSymbolProvider()));

	vscode.languages.setLanguageConfiguration(PERL_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
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
