import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";

const PERL_MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };

let fileRegexp = /^(.*),\d+$/;
let tagsFile = "tags";

function makeTags() {
	cp.execFile("ctags", ["-R", "--languages=perl", "--fields=kn", "--extra=+q", "-f", tagsFile], {
		cwd: vscode.workspace.rootPath
	}, (error, stdout, stderr) => {
		if (error) {
			vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString() }`);
		}
		console.log("Tags generated.");
	});
};

function parseLine(line: string): vscode.Location {
	let match = line.split("\t");

	let name = match[0];
	let fileName = match[1];
	let lineNo = parseInt(match[4].replace("line:", "")) - 1;

	let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, fileName));
	let pos = new vscode.Position(lineNo, 0);

	return new vscode.Location(uri, pos);
}

function getPointBefore(range: vscode.Range, delta: number): vscode.Position {
	let character = range.start.character - delta;
	character = (character > 0) ? character : 0;
	return new vscode.Position(
		range.start.line,
		character
	);
}

function getRangeBefore(range: vscode.Range, delta: number): vscode.Range {
	let point = getPointBefore(range, delta);
	return new vscode.Range(
		point,
		range.start
	);
}

class PerlDefinitionProvider implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		return new Promise((resolve, reject) => {
			let wRange = document.getWordRangeAtPosition(position);
			let word = document.getText(wRange);
			let sRange = getRangeBefore(wRange, 2);
			let separator = document.getText(sRange);

			while (separator === "::") {
				wRange = document.getWordRangeAtPosition(getPointBefore(sRange, 1));
				word = document.getText(wRange) + separator + word;
				sRange = getRangeBefore(wRange, 2)
				separator = document.getText(sRange);
			}

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
				vscode.window.showErrorMessage(`An error occured while reading tags: ${error.toString() }`);
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
	s: vscode.SymbolKind.Function,
	l: vscode.SymbolKind.Constant,
	c: vscode.SymbolKind.Constant
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
						if (typeof kind === "undefined") {
							console.error(`Unknown symbol kind: ${match[3]}`);
							kind = vscode.SymbolKind.Variable;
						}
						let lineNo = parseInt(match[4].replace("line:", "")) - 1;
						let range = document.lineAt(lineNo).range;

						let info = new vscode.SymbolInformation(name, kind, range);

						symbols.push(info);
					}
				}
				return resolve(symbols);
			});
		});
	}
}

let perlKeywords: string[] = ["__DATA__", "else", "lock", "qw", "__END__", "elsif", "lt", "qx", "__FILE__", "eq", "m", "s", "__LINE__", "exp", "ne", "sub", "__PACKAGE__", "for", "no", "tr", "and", "foreach", "or", "unless", "cmp", "ge", "package", "until", "continue", "gt", "q", "while", "CORE", "if", "qq", "xor", "do", "le", "qr", "y"];

let perlFunctions: string[] = ["-A", "END", "length", "setpgrp", "-B", "endgrent", "link", "setpriority", "-b", "endhostent", "listen", "setprotoent", "-C", "endnetent", "local", "setpwent", "-c", "endprotoent", "localtime", "setservent", "-d", "endpwent", "log", "setsockopt", "-e", "endservent", "lstat", "shift", "-f", "eof", "map", "shmctl", "-g", "eval", "mkdir", "shmget", "-k", "exec", "msgctl", "shmread", "-l", "exists", "msgget", "shmwrite", "-M", "exit", "msgrcv", "shutdown", "-O", "fcntl", "msgsnd", "sin", "-o", "fileno", "my", "sleep", "-p", "flock", "next", "socket", "-r", "fork", "not", "socketpair", "-R", "format", "oct", "sort", "-S", "formline", "open", "splice", "-s", "getc", "opendir", "split", "-T", "getgrent", "ord", "sprintf", "-t", "getgrgid", "our", "sqrt", "-u", "getgrnam", "pack", "srand", "-w", "gethostbyaddr", "pipe", "stat", "-W", "gethostbyname", "pop", "state", "-X", "gethostent", "pos", "study", "-x", "getlogin", "print", "substr", "-z", "getnetbyaddr", "printf", "symlink", "abs", "getnetbyname", "prototype", "syscall", "accept", "getnetent", "push", "sysopen", "alarm", "getpeername", "quotemeta", "sysread", "atan2", "getpgrp", "rand", "sysseek", "AUTOLOAD", "getppid", "read", "system", "BEGIN", "getpriority", "readdir", "syswrite", "bind", "getprotobyname", "readline", "tell", "binmode", "getprotobynumber", "readlink", "telldir", "bless", "getprotoent", "readpipe", "tie", "break", "getpwent", "recv", "tied", "caller", "getpwnam", "redo", "time", "chdir", "getpwuid", "ref", "times", "CHECK", "getservbyname", "rename", "truncate", "chmod", "getservbyport", "require", "uc", "chomp", "getservent", "reset", "ucfirst", "chop", "getsockname", "return", "umask", "chown", "getsockopt", "reverse", "undef", "chr", "glob", "rewinddir", "UNITCHECK", "chroot", "gmtime", "rindex", "unlink", "close", "goto", "rmdir", "unpack", "closedir", "grep", "say", "unshift", "connect", "hex", "scalar", "untie", "cos", "index", "seek", "use", "crypt", "INIT", "seekdir", "utime", "dbmclose", "int", "select", "values", "dbmopen", "ioctl", "semctl", "vec", "defined", "join", "semget", "wait", "delete", "keys", "semop", "waitpid", "DESTROY", "kill", "send", "wantarray", "die", "last", "setgrent", "warn", "dump", "lc", "sethostent", "write", "each", "lcfirst", "setnetent"];

let perlVariables: string[] = ["$!", "$^RE_TRIE_MAXBUF", "$LAST_REGEXP_CODE_RESULT", "$\"", "$^S", "$LIST_SEPARATOR", "$#", "$^T", "$MATCH", "$$", "$^TAINT", "$MULTILINE_MATCHING", "$%", "$^UNICODE", "$NR", "$&", "$^UTF8LOCALE", "$OFMT", "$'", "$^V", "$OFS", "$(", "$^W", "$ORS", "$)", "$^WARNING_BITS", "$OS_ERROR", "$*", "$^WIDE_SYSTEM_CALLS", "$OSNAME", "$+", "$^X", "$OUTPUT_AUTO_FLUSH", "$,", "$_", "$OUTPUT_FIELD_SEPARATOR", "$-", "$`", "$OUTPUT_RECORD_SEPARATOR", "$.", "$a", "$PERL_VERSION", "$/", "$ACCUMULATOR", "$PERLDB", "$0", "$ARG", "$PID", "$:", "$ARGV", "$POSTMATCH", "$;", "$b", "$PREMATCH", "$<", "$BASETIME", "$PROCESS_ID", "$=", "$CHILD_ERROR", "$PROGRAM_NAME", "$>", "$COMPILING", "$REAL_GROUP_ID", "$?", "$DEBUGGING", "$REAL_USER_ID", "$@", "$EFFECTIVE_GROUP_ID", "$RS", "$[", "$EFFECTIVE_USER_ID", "$SUBSCRIPT_SEPARATOR", "$\\", "$EGID", "$SUBSEP", "$]", "$ERRNO", "$SYSTEM_FD_MAX", "$^", "$EUID", "$UID", "$^A", "$EVAL_ERROR", "$WARNING", "$^C", "$EXCEPTIONS_BEING_CAUGHT", "$|", "$^CHILD_ERROR_NATIVE", "$EXECUTABLE_NAME", "$~", "$^D", "$EXTENDED_OS_ERROR", "%!", "$^E", "$FORMAT_FORMFEED", "%^H", "$^ENCODING", "$FORMAT_LINE_BREAK_CHARACTERS", "%ENV", "$^F", "$FORMAT_LINES_LEFT", "%INC", "$^H", "$FORMAT_LINES_PER_PAGE", "%OVERLOAD", "$^I", "$FORMAT_NAME", "%SIG", "$^L", "$FORMAT_PAGE_NUMBER", "@+", "$^M", "$FORMAT_TOP_NAME", "@-", "$^N", "$GID", "@_", "$^O", "$INPLACE_EDIT", "@ARGV", "$^OPEN", "$INPUT_LINE_NUMBER", "@INC", "$^P", "$INPUT_RECORD_SEPARATOR", "@LAST_MATCH_START", "$^R", "$LAST_MATCH_END", "$^RE_DEBUG_FLAGS", "$LAST_PAREN_MATCH"];

let itemKindMap = {
	p: vscode.CompletionItemKind.Module,
	s: vscode.CompletionItemKind.Function
};

class PerlCompletionItemProvider implements vscode.CompletionItemProvider {
	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		let items: vscode.CompletionItem[] = [];
		for (var i = 0; i < perlKeywords.length; i++) {
			var item = new vscode.CompletionItem(perlKeywords[i]);
			item.kind = vscode.CompletionItemKind.Keyword;
			items.push(item);
		}
		for (var i = 0; i < perlFunctions.length; i++) {
			var item = new vscode.CompletionItem(perlFunctions[i]);
			item.kind = vscode.CompletionItemKind.Function;
			items.push(item);
		}
		for (var i = 0; i < perlVariables.length; i++) {
			var item = new vscode.CompletionItem(perlVariables[i]);
			item.kind = vscode.CompletionItemKind.Variable;
			items.push(item);
		}
		return new Promise((resolve, reject) => {
			cp.execFile("ctags", ["--languages=perl", "--fields=kn", "--extra=q", "-f", "-", document.fileName], {
				cwd: vscode.workspace.rootPath
			}, (error, stdout, stderr) => {
				if (error) {
					vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString() }`);
					return reject("An error occured while generating tags");
				}

				let lines = stdout.toString().split("\n");

				for (var i = 0; i < lines.length; i++) {
					let match = lines[i].split("\t");

					if (match.length === 5) {
						let item = new vscode.CompletionItem(match[0]);
						item.kind = itemKindMap[match[3]];
						items.push(item);
					}
				}
				return resolve(items);
			});
		});
	}
};

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(PERL_MODE, new PerlDefinitionProvider()));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(PERL_MODE, new PerlDocumentSymbolProvider()));
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(PERL_MODE, new PerlCompletionItemProvider()));

	vscode.languages.setLanguageConfiguration(PERL_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\#\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
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
