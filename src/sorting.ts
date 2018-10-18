import * as vscode from "vscode";
import { compareAnything } from "./vs/base/common/comparers";
import { IMatch } from "./vs/base/common/filters";

let IDS = 0;
export class SymbolEntry {
	private id: string;
    private labelHighlights: IMatch[] = [];
    private bearing: vscode.SymbolInformation;

	constructor(
		symbol: vscode.SymbolInformation
	) {
		this.id = (IDS++).toString();
        this.bearing = symbol;
    }

    getSymbol(): vscode.SymbolInformation {
        return this.bearing;
    }

	getLabel(): string {
		return this.bearing.name;
	}
	getResource(): vscode.Uri {
		return this.bearing.location.uri;
    }

	/**
	 * A unique identifier for the entry
	 */
	getId(): string {
		return this.id;
	}

	/**
	 * Allows to set highlight ranges that should show up for the entry label and optionally description if set.
	 */
	setHighlights(labelHighlights: IMatch[]): void {
		this.labelHighlights = labelHighlights;
	}

	/**
	 * Allows to return highlight ranges that should show up for the entry label and description.
	 */
    getHighlights(): IMatch[] {
		return this.labelHighlights;
	}

	static compare(elementA: SymbolEntry, elementB: SymbolEntry, searchValue: string): number {
		const elementAName = elementA.getLabel().toLowerCase();
		const elementBName = elementB.getLabel().toLowerCase();
		if (elementAName === elementBName) {
			return 0;
		}
		return compareEntries(elementA, elementB, searchValue);
	}
}

/**
 * A good default sort implementation for quick open entries respecting highlight information
 * as well as associated resources.
 */
function compareEntries(elementA: SymbolEntry, elementB: SymbolEntry, lookFor: string): number {

	// Give matches with label highlights higher priority over
	// those with only description highlights
	const labelHighlightsA = elementA.getHighlights() || [];
	const labelHighlightsB = elementB.getHighlights() || [];
	if (labelHighlightsA.length && !labelHighlightsB.length) {
		return -1;
	}

	if (!labelHighlightsA.length && labelHighlightsB.length) {
		return 1;
	}

	// Fallback to the full path if labels are identical and we have associated resources
	let nameA = elementA.getLabel();
	let nameB = elementB.getLabel();
	if (nameA === nameB) {
		const resourceA = elementA.getResource();
		const resourceB = elementB.getResource();

		if (resourceA && resourceB) {
			nameA = resourceA.fsPath;
			nameB = resourceB.fsPath;
		}
	}

	return compareAnything(nameA, nameB, lookFor);
}