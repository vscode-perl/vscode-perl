import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const PERL_MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };

const PERL_CONFIG: vscode.LanguageConfiguration = {
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
            { open: "|", close: "|" },
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
            { open: "|", close: "|", notIn: ["string"] },
            { open: "\"", close: "\"", notIn: ["string"] },
            { open: "'", close: "'", notIn: ["string", "comment"] }
        ]
    }
};

let extraTags = {
    "use": "--regex-perl=\/^[ \\t]*use[ \\t]+['\"]*([A-Za-z][A-Za-z0-9:]+)['\" \\t]*;\/\\1\/u,use,uses\/",
    "require": "--regex-perl=\/^[ \\t]*require[ \\t]+['\"]*([A-Za-z][A-Za-z0-9:]+)['\" \\t]*\/\\1\/r,require,requires\/",
    "variable": "--regex-perl=\/^[ \\t]*my[ \\t(]+([$@%][A-Za-z][A-Za-z0-9:]+)[ \\t)]*\/\\1\/v,variable\/"
};

let fileRegexp = /^(.*),\d+$/;
let tagsFile = "tags";

function makeTags() {
    cp.execFile("ctags", ["-R", "-n", "--languages=perl", "--perl-kinds=ps", "--fields=k", "-f", tagsFile], {
        cwd: vscode.workspace.rootPath
    }, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
        }
        console.log("Tags generated.");
    });
};

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

function getPackageBefore(document: vscode.TextDocument, range: vscode.Range): string {
    let separatorRange = getRangeBefore(range, 2);
    let separator = document.getText(separatorRange);
    let pkg = "";

    while (separator === "::") {
        range = document.getWordRangeAtPosition(getPointBefore(separatorRange, 1));
        pkg = document.getText(range) + separator + pkg;
        separatorRange = getRangeBefore(range, 2);
        separator = document.getText(separatorRange);
    }

    return pkg.replace(/::$/, "");
}

function getMatchLocation(line: string): vscode.Location {
    let match = line.split("\t");
    let name = match[0];
    let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

    let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, match[1]));
    let pos = new vscode.Position(lineNo, 0);

    return new vscode.Location(uri, pos);
}

class PerlDefinitionProvider implements vscode.DefinitionProvider, vscode.HoverProvider {
    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
        let wordRange = document.getWordRangeAtPosition(position);
        if (typeof wordRange === "undefined") {
            console.error("No word at pos!");
            return null;
        }

        return new Promise((resolve, reject) => {
            let word = document.getText(wordRange);
            let pkg = getPackageBefore(document, wordRange);
            // console.log(pkg);

            let fileName = document.fileName;
            // console.log(`Looking for "${word}" in "${fileName}"`);

            let tags = path.join(vscode.workspace.rootPath, tagsFile);
            let stream = fs.createReadStream(tags);
            let matches: string[] = [];
            let pkgMatch: string;

            stream.on("data", (chunk: Buffer) => {
                let lines = chunk.toString().split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.startsWith(`${word}\t`)) {
                        matches.push(line);
                    } else if (line.startsWith(`${pkg}\t`)) {
                        let split = line.split("\t");
                        if (split[3] === "p") {
                            fileName = split[1];
                        }
                    } else if (line.startsWith(`${pkg}::${word}\t`)) {
                        pkgMatch = line;
                    }
                }
            });

            stream.on("error", (error: Buffer) => {
                console.error("error", error.toString());
                vscode.window.showErrorMessage(`An error occured while reading tags: ${error.toString()}`);
            });

            stream.on("end", () => {
                fileName = fileName.replace(vscode.workspace.rootPath, ".");
                if (pkgMatch) {
                    return resolve(getMatchLocation(pkgMatch));
                }
                for (let i = 0; i < matches.length; i++) {
                    let match = matches[i].split("\t");

                    if (fileName === match[1] || (i + 1 === matches.length)) {
                        return resolve(getMatchLocation(matches[i]));
                    }
                }
                console.log("Could not find tag");
                return reject("Could not find tag.");
            });
        });
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
        return this.provideDefinition(document, position, token)
            .then(location => {
                return new Promise((resolve, reject) => {
                    fs.readFile(location.uri.fsPath, (err, data) => {
                        if (err) {
                            reject(err);
                        }
                        let lines = data.toString().split(/\r?\n/);
                        let value = '';

                        let end = Math.min(lines.length, location.range.end.line + 5);
                        let index = location.range.start.line;
                        while (index < end) {
                            value += lines[index] + '\n';
                            index++;
                        }

                        let hover = new vscode.Hover({ language: 'perl', value: value, });
                        resolve(hover);
                    })
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
            cp.execFile("ctags", ["--languages=perl", "-n", "--fields=k", "-f", "-", document.fileName], {
                cwd: vscode.workspace.rootPath
            }, (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
                    return reject("An error occured while generating tags");
                }

                let lines = stdout.toString().split("\n");
                let symbols: vscode.SymbolInformation[] = [];

                for (let i = 0; i < lines.length; i++) {
                    let match = lines[i].split("\t");

                    if (match.length === 4) {
                        let name = match[0];
                        let kind = symbolKindMap[match[3].replace(/[^\w]/g, "")];
                        if (typeof kind === "undefined") {
                            console.error("Unknown symbol kind:", match[3]);
                            kind = vscode.SymbolKind.Variable;
                        }
                        let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

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

class PerlWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    public provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            let symbols: vscode.SymbolInformation[] = [];
            let tags = path.join(vscode.workspace.rootPath, tagsFile);
            let stream = fs.createReadStream(tags);

            stream.on("data", (chunk: Buffer) => {
                let lines = chunk.toString().split("\n");
                for (let i = 0; i < lines.length; i++) {
                    let match = lines[i].split("\t");

                    if (match.length === 4) {
                        let name = match[0];
                        let kind = symbolKindMap[match[3].replace(/[^\w]/g, "")];
                        if (typeof kind === "undefined") {
                            console.error("Unknown symbol kind:", match[3]);
                            kind = vscode.SymbolKind.Variable;
                        }
                        let lineNo = parseInt(match[2].replace(/[^\d]/g, "")) - 1;

                        let range = new vscode.Range(lineNo, 0, lineNo, 0);

                        let file = match[1].replace(/^\.\\/, "");
                        let uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, file));

                        let info = new vscode.SymbolInformation(name, kind, range, uri);

                        symbols.push(info);
                    }
                }
            });

            stream.on("error", (error: Buffer) => {
                return resolve(symbols);
            });

            stream.on("end", () => {
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
    s: vscode.CompletionItemKind.Function,
    r: vscode.CompletionItemKind.Reference,
    v: vscode.CompletionItemKind.Variable
};

interface FileCompletionItems {
    [index: string]: vscode.CompletionItem[];
}

interface FilePackageMap {
    [index: string]: string;
}

class PerlCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        let range = document.getWordRangeAtPosition(position);
        let pkg = getPackageBefore(document, range);
        let separator = document.getText(getRangeBefore(range, 2));

        let isMethod = (separator === "->");
        // console.log("isMethod: ", isMethod);

        // let currentFile = document.uri.fsPath.replace(vscode.workspace.rootPath, ".");
        // console.log(currentFile);

        let word: RegExpExecArray;
        let text = document.getText();
        let words = {};
        while (word = PERL_CONFIG.wordPattern.exec(text)) {
            words[word[0]] = true;
        }

        let currentWord = document.getText(range);
        delete words[currentWord];

        let items: vscode.CompletionItem[] = [];
        for (let i = 0; i < perlKeywords.length; i++) {
            delete words[perlKeywords[i]];
            let item = new vscode.CompletionItem(perlKeywords[i]);
            item.kind = vscode.CompletionItemKind.Keyword;
            item.detail = "perl keyword";
            items.push(item);
        }
        for (let i = 0; i < perlFunctions.length; i++) {
            delete words[perlFunctions[i]];
            let item = new vscode.CompletionItem(perlFunctions[i]);
            item.kind = vscode.CompletionItemKind.Function;
            item.detail = "perl function";
            items.push(item);
        }
        for (let i = 0; i < perlVariables.length; i++) {
            delete words[perlVariables[i]];
            let item = new vscode.CompletionItem(perlVariables[i]);
            item.kind = vscode.CompletionItemKind.Variable;
            item.detail = "perl variable";
            items.push(item);
        }

        return new Promise((resolve, reject) => {
            cp.execFile("ctags", ["--languages=perl", "-n", extraTags["use"], "--fields=k", "-f", "-", document.fileName], {
                cwd: vscode.workspace.rootPath
            }, (error, stdout, stderr) => {
                let usedPackages: string[] = [];

                if (error) {
                    vscode.window.showErrorMessage(`An error occured while generating tags: ${stderr.toString()}`);
                    return "An error occured while generating tags";
                }

                // console.log(stdout);

                let lines = stdout.toString().split("\n");

                for (let i = 0; i < lines.length; i++) {
                    let match = lines[i].split("\t");
                    if (match.length === 4) {
                        let kind = match[3].replace(/[^\w]/g, "");
                        if (kind === "u" || kind === "p") {
                            usedPackages.push(match[0]);
                        }
                    }
                }

                let methodFiles: FilePackageMap = {};
                let filePackage: FilePackageMap = {};
                let fileItems: FileCompletionItems = {};
                let packageItems: vscode.CompletionItem[] = [];

                let tags = path.join(vscode.workspace.rootPath, tagsFile);
                let stream = fs.createReadStream(tags);
                stream.on("data", (chunk: Buffer) => {
                    let lines = chunk.toString().split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        let match = lines[i].split("\t");

                        if (match.length === 4) {
                            fileItems[match[1]] = fileItems[match[1]] || [];

                            let item = new vscode.CompletionItem(match[0]);
                            item.kind = itemKindMap[match[3].replace(/[^\w]/g, "")];
                            item.detail = match[1];

                            if (match[3].replace(/[^\w]/g, "") === "p") {
                                filePackage[match[0]] = match[1];
                                packageItems.push(item);
                            } else {
                                fileItems[match[1]].push(item);

                                if (match[0] === "new") {
                                    methodFiles[match[1]] = "1";
                                }
                            }

                        }
                    }
                });

                stream.on("error", (error: Buffer) => {
                    console.error("error", error.toString());
                    vscode.window.showErrorMessage(`An error occured while reading tags: ${error.toString()}`);
                    return resolve(items);
                });

                stream.on("end", () => {
                    if (filePackage[pkg]) {
                        let file = filePackage[pkg];
                        if (fileItems[file]) {
                            fileItems[file].forEach(item => {
                                delete words[item.label];

                                item.insertText = item.label;
                                item.label = `${pkg}::${item.label}`;
                                items.push(item);
                            });
                        }
                    } else if (isMethod) {
                        let keys = Object.keys(methodFiles);
                        for (let i = 0; i < keys.length; i++) {
                            fileItems[keys[i]].forEach(item => {
                                delete words[item.label];
                                items.push(item);
                            });
                        }
                    } else {
                        packageItems.forEach(item => {
                            delete words[item.label];
                            items.push(item);
                        });
                        usedPackages.forEach(usedPkg => {
                            let file = filePackage[usedPkg];
                            if (fileItems[file]) {
                                fileItems[file].forEach(item => {
                                    delete words[item.label];

                                    item.label = `${usedPkg}::${item.label}`;
                                    items.push(item);
                                });
                            }
                        });
                    }

                    let keys = Object.keys(words);
                    // console.log(keys.length);
                    for (let i = 0; i < keys.length; i++) {
                        let item = new vscode.CompletionItem(keys[i]);
                        item.kind = vscode.CompletionItemKind.Text;
                        items.push(item);
                    }

                    return resolve(items);
                });
            });
        });
    }
};


class PerlDocumentRangeFormattingEditProvider implements vscode.DocumentRangeFormattingEditProvider {
    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            if (range.start.line !== range.end.line) {
                range = range.with(
                    range.start.with(range.start.line, 0),
                    range.end.with(range.end.line, Number.MAX_VALUE)
                );
            }

            let newText = "";
            let child = cp.spawn("perltidy.bat", ["-q", "-et=4", "-t", "-ce", "-l=0", "-bar", "-naws", "-blbs=2", "-mbl=2"]); // , "-otr"
            child.stdin.write(document.getText(range));
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
                newText = newText.slice(0, -2); // remove trailing newline
                resolve([new vscode.TextEdit(range, newText)]);
            });
        });
    }
}

export function activate(context: vscode.ExtensionContext) {

    vscode.languages.setLanguageConfiguration(PERL_MODE.language, PERL_CONFIG);

    let definitions = new PerlDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(PERL_MODE, definitions));
    context.subscriptions.push(vscode.languages.registerHoverProvider(PERL_MODE, definitions));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(PERL_MODE, new PerlCompletionItemProvider()));

    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(PERL_MODE, new PerlDocumentSymbolProvider()));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new PerlWorkspaceSymbolProvider()));

    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(PERL_MODE, new PerlDocumentRangeFormattingEditProvider()));

    vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId === "perl") {
            makeTags();
        }
    });

    makeTags();
}
