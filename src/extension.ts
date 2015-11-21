import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";

const PERL_MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };
let fileRegexp = /^(.*),\d+$/;

class PerlDefinitionProvider implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		return new Promise((resolve, reject) => {
			let range = document.getWordRangeAtPosition(position);
			let word = document.getText(range);
			let wordRegexp = new RegExp(`\\x7f${word}\\x01(\\d+)`);

			let tags = path.join(vscode.workspace.rootPath, "TAGS");

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
							let lineNumber = parseInt(match[1]);

							let fileMatch = lines[1].match(fileRegexp);
							if (!fileMatch) {
								return reject("no file matched !");
							}
							let fileName = fileMatch[1];

							let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, fileName));
							let pos = new vscode.Position(lineNumber - 1, 0);

							return resolve(new vscode.Location(uri, pos));
						}
						if (token.isCancellationRequested) {
							return reject("cancelled!");
						}
					}
				}
				return reject("could not find tag");
			});
			stream.on("error", error => {
				console.error(error);
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

function makeTags() {
	let s = cp.exec("ctags -R -e --languages=perl --extra=+q", {
		cwd: vscode.workspace.rootPath
	}, (error, stdout, stderr) => {
		console.log("tags generated.");
		console.log(error, stdout, stderr);
	});
};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log("Congratulations, your extension \"vscode-perl\" is now active!");

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(PERL_MODE, new PerlDefinitionProvider()));

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

	makeTags();
}
