# Perl for Visual Studio Code

This extension aims to bring code intelligence for the Perl language to [Visual Studio Code](https://code.visualstudio.com/), mainly through the use of [Exuberant Ctags](http://ctags.sourceforge.net/).

Formatting is also supported with use of [Perl::Tidy](https://metacpan.org/pod/distribution/Perl-Tidy/lib/Perl/Tidy.pod).

This extension is current modeled after how I work with Perl, so your mileage may vary.

# How To Use

Follow the instructions below to install `ctags`, and then open a file with the language mode `perl`. If the file is in a workspace, a `.vstags` file will be created automatically and updated on save. if you open a file when not in a workspace tags will be generated on the fly but some functionality will not be enabled. You can also force generation of tags with the command "Perl: Generate Tags" (ex. after a git checkout).

# Exuberant Ctags

By default the extension will look for a `ctags` executable in your path, you can specify a different executable with the setting `perl.ctags.executable`

## Installation

### macOS

You can install ctags with the package manager [homebrew](https://brew.sh/):

```sh
brew install ctags
```

…or with [MacPorts](https://www.macports.org):

```sh
sudo port install ctags
```

### Windows

You can install ctags with the package manager [chocolatey](https://chocolatey.org/)

```sh
choco install ctags
```

### Linux

You can install ctags with your prefered package manager.

```sh
# Debian-based systems (Ubuntu, Mint, etc.)
apt-get install exuberant-ctags

# Red Hat-based systems (Red Hat, Fedora, CentOS)
yum install ctags
```

# Perl::Tidy

Install `Perl::Tidy` and make sure it's available on your `PATH` or specify it's location in the `perl.perltidy` setting. If the value for `perl.perltidy` is left empty, no formatting will be applied.

If you are using docker you can specify in the setting `perl.perltidyContainer` the name of a container in which you have installed `Perl::Tidy`.

The arguments to perltidy are specified with the `perl.perltidyArgs` setting. This is an array in which each element is a string to be passed to perltidy as a command-line argument (including the leading dash). The default is not to pass any arguments.
