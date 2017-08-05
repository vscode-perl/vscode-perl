# Perl for Visual Studio Code

This extension aims to bring code intelligence for the perl language to [Visual Studio Code](https://code.visualstudio.com/), mainly through the use of [Exuberant Ctags](http://ctags.sourceforge.net/).

Formatting is also supported with use of [Perl::Tidy](https://metacpan.org/pod/distribution/Perl-Tidy/lib/Perl/Tidy.pod).

This extension is current moddeled after how I work with perl, so your mileage may wary.

# Exuberant Ctags

By default the extension will look for a `ctags` executable in your path, you can specify a diffrent executable with the setting `perl.ctags.executable`

## Installation

### OS X

You can install ctags with the package manager [homebrew](http://brew.sh/).

```sh
brew install ctags
```

### Windows

You can install ctags with the package manager [chocolatey](https://chocolatey.org/)

```sh
choco install ctags
```

### Linux

You can install ctags with you prefered package manager.

```sh
apt-get install ctags
```

# Perl::Tidy

Install `Perl::Tidy` and make sure it's avaliable on your `PATH` or specify it's location in the `perl.perltidy` setting. If you are using docker you can specify in the setting `perl.perltidyContainer` the name of a container in which you have installed `Perl::Tidy`.
