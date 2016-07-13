import * as vscode from "vscode";

export const MODE: vscode.DocumentFilter = { language: "perl", scheme: "file" };

export const CONFIG: vscode.LanguageConfiguration = {
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

export const KEYWORDS: string[] = ["__DATA__", "else", "lock", "qw", "__END__", "elsif", "lt", "qx", "__FILE__", "eq", "m", "s", "__LINE__", "exp", "ne", "sub", "__PACKAGE__", "for", "no", "tr", "and", "foreach", "or", "unless", "cmp", "ge", "package", "until", "continue", "gt", "q", "while", "CORE", "if", "qq", "xor", "do", "le", "qr", "y"];

export const FUNCTIONS: string[] = ["-A", "END", "length", "setpgrp", "-B", "endgrent", "link", "setpriority", "-b", "endhostent", "listen", "setprotoent", "-C", "endnetent", "local", "setpwent", "-c", "endprotoent", "localtime", "setservent", "-d", "endpwent", "log", "setsockopt", "-e", "endservent", "lstat", "shift", "-f", "eof", "map", "shmctl", "-g", "eval", "mkdir", "shmget", "-k", "exec", "msgctl", "shmread", "-l", "exists", "msgget", "shmwrite", "-M", "exit", "msgrcv", "shutdown", "-O", "fcntl", "msgsnd", "sin", "-o", "fileno", "my", "sleep", "-p", "flock", "next", "socket", "-r", "fork", "not", "socketpair", "-R", "format", "oct", "sort", "-S", "formline", "open", "splice", "-s", "getc", "opendir", "split", "-T", "getgrent", "ord", "sprintf", "-t", "getgrgid", "our", "sqrt", "-u", "getgrnam", "pack", "srand", "-w", "gethostbyaddr", "pipe", "stat", "-W", "gethostbyname", "pop", "state", "-X", "gethostent", "pos", "study", "-x", "getlogin", "print", "substr", "-z", "getnetbyaddr", "printf", "symlink", "abs", "getnetbyname", "prototype", "syscall", "accept", "getnetent", "push", "sysopen", "alarm", "getpeername", "quotemeta", "sysread", "atan2", "getpgrp", "rand", "sysseek", "AUTOLOAD", "getppid", "read", "system", "BEGIN", "getpriority", "readdir", "syswrite", "bind", "getprotobyname", "readline", "tell", "binmode", "getprotobynumber", "readlink", "telldir", "bless", "getprotoent", "readpipe", "tie", "break", "getpwent", "recv", "tied", "caller", "getpwnam", "redo", "time", "chdir", "getpwuid", "ref", "times", "CHECK", "getservbyname", "rename", "truncate", "chmod", "getservbyport", "require", "uc", "chomp", "getservent", "reset", "ucfirst", "chop", "getsockname", "return", "umask", "chown", "getsockopt", "reverse", "undef", "chr", "glob", "rewinddir", "UNITCHECK", "chroot", "gmtime", "rindex", "unlink", "close", "goto", "rmdir", "unpack", "closedir", "grep", "say", "unshift", "connect", "hex", "scalar", "untie", "cos", "index", "seek", "use", "crypt", "INIT", "seekdir", "utime", "dbmclose", "int", "select", "values", "dbmopen", "ioctl", "semctl", "vec", "defined", "join", "semget", "wait", "delete", "keys", "semop", "waitpid", "DESTROY", "kill", "send", "wantarray", "die", "last", "setgrent", "warn", "dump", "lc", "sethostent", "write", "each", "lcfirst", "setnetent"];

export const VARIABLES: string[] = ["$!", "$^RE_TRIE_MAXBUF", "$LAST_REGEXP_CODE_RESULT", "$\"", "$^S", "$LIST_SEPARATOR", "$#", "$^T", "$MATCH", "$$", "$^TAINT", "$MULTILINE_MATCHING", "$%", "$^UNICODE", "$NR", "$&", "$^UTF8LOCALE", "$OFMT", "$'", "$^V", "$OFS", "$(", "$^W", "$ORS", "$)", "$^WARNING_BITS", "$OS_ERROR", "$*", "$^WIDE_SYSTEM_CALLS", "$OSNAME", "$+", "$^X", "$OUTPUT_AUTO_FLUSH", "$,", "$_", "$OUTPUT_FIELD_SEPARATOR", "$-", "$`", "$OUTPUT_RECORD_SEPARATOR", "$.", "$a", "$PERL_VERSION", "$/", "$ACCUMULATOR", "$PERLDB", "$0", "$ARG", "$PID", "$:", "$ARGV", "$POSTMATCH", "$;", "$b", "$PREMATCH", "$<", "$BASETIME", "$PROCESS_ID", "$=", "$CHILD_ERROR", "$PROGRAM_NAME", "$>", "$COMPILING", "$REAL_GROUP_ID", "$?", "$DEBUGGING", "$REAL_USER_ID", "$@", "$EFFECTIVE_GROUP_ID", "$RS", "$[", "$EFFECTIVE_USER_ID", "$SUBSCRIPT_SEPARATOR", "$\\", "$EGID", "$SUBSEP", "$]", "$ERRNO", "$SYSTEM_FD_MAX", "$^", "$EUID", "$UID", "$^A", "$EVAL_ERROR", "$WARNING", "$^C", "$EXCEPTIONS_BEING_CAUGHT", "$|", "$^CHILD_ERROR_NATIVE", "$EXECUTABLE_NAME", "$~", "$^D", "$EXTENDED_OS_ERROR", "%!", "$^E", "$FORMAT_FORMFEED", "%^H", "$^ENCODING", "$FORMAT_LINE_BREAK_CHARACTERS", "%ENV", "$^F", "$FORMAT_LINES_LEFT", "%INC", "$^H", "$FORMAT_LINES_PER_PAGE", "%OVERLOAD", "$^I", "$FORMAT_NAME", "%SIG", "$^L", "$FORMAT_PAGE_NUMBER", "@+", "$^M", "$FORMAT_TOP_NAME", "@-", "$^N", "$GID", "@_", "$^O", "$INPLACE_EDIT", "@ARGV", "$^OPEN", "$INPUT_LINE_NUMBER", "@INC", "$^P", "$INPUT_RECORD_SEPARATOR", "@LAST_MATCH_START", "$^R", "$LAST_MATCH_END", "$^RE_DEBUG_FLAGS", "$LAST_PAREN_MATCH"];

