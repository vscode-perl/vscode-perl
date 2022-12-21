import * as path from 'path';
import * as vscode from 'vscode';

import {Ctags, SYMBOL_KINDS} from './ctags';
import {SymbolEntry} from './sorting';
import * as utils from './utils';
import * as filters from './vs/base/common/filters';

export class PerlSymbolProvider implements vscode.DocumentSymbolProvider,
                                           vscode.WorkspaceSymbolProvider {
  tags: Ctags;

  constructor(tags: Ctags) {
    this.tags = tags;
  }

  getMaxSymbolResults(): number {
    let config = vscode.workspace.getConfiguration('perl');
    return config.get('maxSymbolResults', 500);
  }

  public async provideDocumentSymbols(
      document: vscode.TextDocument,
      token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
    let result = await this.tags.generateFileTags(document);
    if (result instanceof Error) {
      console.error('error', result);
      throw result;
    }

    let lines = result.data.split('\n');
    let symbols: vscode.DocumentSymbol[] = [];

    for (let i = 0; i < lines.length; i++) {
      let match = lines[i].split('\t');

      if (match.length === 4) {
        let name = match[0];
        let kind = SYMBOL_KINDS[match[3].replace(/[^\w]/g, '')];

        if (typeof kind === 'undefined') {
          console.error('Unknown symbol kind:', match[3]);
          kind = vscode.SymbolKind.Variable;
        }

        let lineNo = parseInt(match[2].replace(/[^\d]/g, '')) - 1;
        let selection = document.lineAt(lineNo).range;
        let range = document.lineAt(lineNo).rangeIncludingLineBreak;
        let info =
            new vscode.DocumentSymbol(name, name, kind, range, selection);

        symbols.push(info);
      }
    }

    return symbols;
  }

  public async provideWorkspaceSymbols(
      query: string,
      token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
    if (query.length < 2) {
      return [];
    }

    var validSymbols: vscode.SymbolInformation[] = [];
    let regxQuery = new RegExp(query.split('').join('.*?'), 'i');
    let projectTags = await this.tags.readProjectTags();
    for (const tags of projectTags) {
      if (tags instanceof Error) {
        vscode.window.showErrorMessage(
            `An error occured while reading tags: '${tags}'`);
        continue;
      }

      let lines = tags.data.split('\n');
      let last = lines.length - 1;
      let match: string[];

      for (let i = 0; i <= last; i++) {
        match = lines[i].split('\t');

        if (match.length === 4 && match[0] !== '') {
          let name = match[0];
          let kind = SYMBOL_KINDS[match[3].replace(/[^\w]/g, '')];
          if (typeof kind === 'undefined') {
            console.error('Unknown symbol kind:', match[3]);
            kind = vscode.SymbolKind.Variable;
          }

          if (regxQuery.test(name)) {
            let lineNo = parseInt(match[2].replace(/[^\d]/g, '')) - 1;

            let range = new vscode.Range(lineNo, 0, lineNo, 0);

            let file = match[1].replace(/^\.\\/, '');
            let filePath = path.join(vscode.workspace.rootPath || '', file);
            let uri = vscode.Uri.file(filePath);

            let info = new vscode.SymbolInformation(name, kind, range, uri);

            validSymbols.push(info);
          }
        }
      }
    }
    let fuzzyMatches = validSymbols.map(symbol => {
      let entry = new SymbolEntry(symbol);
      let highlights = filters.matchesFuzzy(query, entry.getLabel()) || [];
      entry.setHighlights(highlights);
      return entry;
    });
    fuzzyMatches.sort((a, b) => SymbolEntry.compare(a, b, query));

    const maxResults = this.getMaxSymbolResults();
    let symbols: vscode.SymbolInformation[] = [];
    fuzzyMatches.forEach(entry => {
      if (symbols.length < maxResults) {
        symbols.push(entry.getSymbol());
      } else {
        return;
      }
    });
    return symbols;
  }
}
