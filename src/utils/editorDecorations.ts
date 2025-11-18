import type * as monaco from "monaco-editor";
import type { ModifiedBaseRange } from "../types";
import { ConflictType as ConflictTypeEnum } from "../types";

/**
 * Configuration for editor decoration colors and styles
 */
export interface DecorationConfig {
	conflictColor: string;
	changeColor: string;
	baseColor: string;
	conflictOverviewColor: string;
	changeOverviewColor: string;
	baseOverviewColor: string;
}

/**
 * Determines CSS classes and overview colors based on conflict type
 */
export interface DecorationClasses {
	input1Class: string;
	input2Class: string;
	baseClass: string;
	input1OverviewColor: string;
	input2OverviewColor: string;
	baseOverviewColor: string;
	input1Symbol: string; // "+" for addition, "-" for deletion, "" for none
	input2Symbol: string; // "+" for addition, "-" for deletion, "" for none
}

/**
 * Determines the CSS classes and colors for decorations based on conflict type
 */
export function getDecorationClasses(conflict: ModifiedBaseRange, isTwoColumnMode: boolean, config: DecorationConfig): DecorationClasses {
	let input1Class = "";
	let input2Class = "";
	let baseClass = "";
	let input1OverviewColor = "";
	let input2OverviewColor = "";
	let baseOverviewColor = "";
	let input1Symbol = "";
	let input2Symbol = "";

	switch (conflict.conflictType) {
		case ConflictTypeEnum.SAME_CHANGE: {
			// Check if this is an item added in both inputs (not in base)
			const isAddedInBothSame =
				conflict.baseRange.startLineNumber === 1 &&
				conflict.baseRange.endLineNumberExclusive === 2 && // Default "not found" range
				conflict.input1Range.startLineNumber !== 1 &&
				conflict.input2Range.startLineNumber !== 1;

			if (isTwoColumnMode) {
				// 2-column mode: input1 should always be red (deletion from input2's perspective)
				if (isAddedInBothSame) {
					// Both added the same - in 2-way mode, input1 should still be red
					input1Class = "merge-2way-deletion"; // Red for deletions in 2-way mode
					input2Class = "merge-same-change"; // Blue for input2 (same addition)
					input1OverviewColor = config.baseOverviewColor;
					input2OverviewColor = config.changeOverviewColor;
					baseOverviewColor = "";
					input1Symbol = "-"; // Deletion symbol
					input2Symbol = "+"; // Addition symbol
				} else {
					// Both made the same change to existing item - input1 should be red
					input1Class = "merge-2way-deletion"; // Red for deletions in 2-way mode
					input2Class = "merge-same-change"; // Blue for ours (input2)
					baseClass = "merge-change-base"; // Keep for consistency (though not used in 2-way mode)
					input1OverviewColor = config.baseOverviewColor;
					input2OverviewColor = config.changeOverviewColor;
					baseOverviewColor = "";
					input1Symbol = "-"; // Deletion symbol
					input2Symbol = ""; // No symbol for same change
				}
			} else {
				// 3-column mode
				if (isAddedInBothSame) {
					// Both inputs added the same item - highlight both in blue (auto-merged)
					input1Class = "merge-same-change"; // Blue for input1 (same addition)
					input2Class = "merge-same-change"; // Blue for input2 (same addition)
					baseClass = ""; // No base highlighting (doesn't exist in base)
					input1OverviewColor = config.changeOverviewColor;
					input2OverviewColor = config.changeOverviewColor;
					baseOverviewColor = "";
					input1Symbol = "+"; // Addition symbol
					input2Symbol = "+"; // Addition symbol
				} else {
					// Both made the same change to existing item:
					// - input2 (ours) should be highlighted in blue (same-change)
					// - input1 (theirs) should be highlighted in red (incoming)
					input1Class = "merge-change-incoming"; // Red for theirs (input1)
					input2Class = "merge-same-change"; // Blue for ours (input2)
					baseClass = "merge-change-base";
					input1OverviewColor = config.changeOverviewColor;
					input2OverviewColor = config.changeOverviewColor;
					baseOverviewColor = config.baseOverviewColor;
					input1Symbol = ""; // No symbol for same change
					input2Symbol = ""; // No symbol for same change
				}
			}
			break;
		}
		case ConflictTypeEnum.INPUT1_ONLY:
			// Only input1 has content (removed in input2)
			// In 2-column mode: highlight input1 as deletion (red)
			// In 3-column mode: highlight input1 and base
			if (isTwoColumnMode) {
				// 2-column: highlight input1 as deletion (red for removed content)
				input1Class = "merge-2way-deletion"; // Red for deletions in 2-way mode
				input2Class = ""; // No highlighting on input2 (doesn't exist)
				input1OverviewColor = config.baseOverviewColor; // Red for removed content
				input2OverviewColor = "";
				input1Symbol = "-"; // Deletion symbol
				input2Symbol = "";
			} else {
				// 3-column: highlight input1 and base
				input1Class = "merge-change-incoming";
				input2Class = "";
				baseClass = "merge-change-base";
				input1OverviewColor = config.conflictOverviewColor; // Orange for incoming changes
				input2OverviewColor = "";
				baseOverviewColor = config.baseOverviewColor;
				input1Symbol = "-"; // Deletion symbol
				input2Symbol = "";
			}
			break;
		case ConflictTypeEnum.INPUT2_ONLY:
			// Only input2 changed (addition in input2)
			// In 2-column mode: only highlight input2 as addition (green)
			// In 3-column mode: highlight input2 and base
			input1Class = ""; // No highlighting on input1 (doesn't exist in 2-way, or unchanged in 3-way)
			input2Class = "merge-change-current"; // Green for additions
			baseClass = isTwoColumnMode ? "" : "merge-change-base";
			input1OverviewColor = "";
			input2OverviewColor = config.changeOverviewColor;
			baseOverviewColor = isTwoColumnMode ? "" : config.baseOverviewColor;
			input1Symbol = "";
			input2Symbol = "+"; // Addition symbol
			break;
		case ConflictTypeEnum.TRUE_CONFLICT: {
			// Check if this is an item added in both inputs (not in base)
			// If so, highlight as additions (orange) instead of conflicts (red)
			const isAddedInBoth =
				conflict.baseRange.startLineNumber === 1 &&
				conflict.baseRange.endLineNumberExclusive === 2 && // Default "not found" range
				conflict.input1Range.startLineNumber !== 1 &&
				conflict.input2Range.startLineNumber !== 1;

			if (isTwoColumnMode) {
				// 2-column mode: input1 should always be red (deletion from input2's perspective)
				if (isAddedInBoth) {
					// Item added in both inputs - input1 should still be red in 2-way mode
					input1Class = "merge-2way-deletion"; // Red for deletions in 2-way mode
					input2Class = "merge-change-current"; // Green for input2 addition
					input1OverviewColor = config.baseOverviewColor;
					input2OverviewColor = config.changeOverviewColor;
					baseOverviewColor = "";
					input1Symbol = "-"; // Deletion symbol
					input2Symbol = "+"; // Addition symbol
				} else {
					// True conflict - input1 should be red in 2-way mode
					input1Class = "merge-2way-deletion"; // Red for deletions in 2-way mode
					input2Class = "merge-conflict-current"; // Orange for conflicts
					baseClass = "merge-conflict-base"; // Keep for consistency (though not used in 2-way mode)
					input1OverviewColor = config.baseOverviewColor;
					input2OverviewColor = config.conflictOverviewColor;
					baseOverviewColor = config.baseOverviewColor; // Keep for consistency (though not used in 2-way mode)
					input1Symbol = "-"; // Deletion symbol
					input2Symbol = "+"; // Addition symbol
				}
			} else {
				// 3-column mode
				if (isAddedInBoth) {
					// Item added in both inputs - highlight as additions (orange/green)
					input1Class = "merge-change-incoming"; // Orange/red for input1 addition
					input2Class = "merge-change-current"; // Green for input2 addition
					baseClass = ""; // No base highlighting
					input1OverviewColor = config.changeOverviewColor;
					input2OverviewColor = config.changeOverviewColor;
					baseOverviewColor = "";
					input1Symbol = "+"; // Addition symbol
					input2Symbol = "+"; // Addition symbol
				} else {
					// True conflict - highlight all three
					input1Class = "merge-conflict-incoming";
					input2Class = "merge-conflict-current";
					baseClass = "merge-conflict-base";
					input1OverviewColor = config.conflictOverviewColor;
					input2OverviewColor = config.conflictOverviewColor;
					baseOverviewColor = config.baseOverviewColor;
					input1Symbol = ""; // No symbol for conflicts
					input2Symbol = ""; // No symbol for conflicts
				}
			}
			break;
		}
	}

	return {
		input1Class,
		input2Class,
		baseClass,
		input1OverviewColor,
		input2OverviewColor,
		baseOverviewColor,
		input1Symbol,
		input2Symbol,
	};
}

/**
 * Extracts unique line numbers from diff arrays
 */
function extractUniqueLines(diffs: unknown[]): number[] {
	const uniqueLines = new Set<number>();
	for (const diff of diffs) {
		if (diff && typeof diff === "object" && "line" in diff) {
			const lineNum = (diff as { line: number }).line;
			if (lineNum > 0) {
				uniqueLines.add(lineNum);
			}
		}
	}
	return Array.from(uniqueLines).sort((a, b) => a - b);
}

/**
 * Creates Monaco editor decorations for input1 (theirs) panel
 */
export function createInput1Decorations(
	conflict: ModifiedBaseRange,
	classes: DecorationClasses,
	monacoInstance: typeof monaco,
): monaco.editor.IModelDeltaDecoration[] {
	const decorations: monaco.editor.IModelDeltaDecoration[] = [];

	// Check if we should highlight this conflict
	if (classes.input1Class) {
		// Only highlight specific lines from input1Diffs, not the entire range
		// This ensures we don't highlight lines with identical/unchanged properties
		// HOWEVER: For INPUT1_ONLY (deletions), input1Diffs may be empty, so we need to highlight the entire range
		if (conflict.input1Diffs.length > 0) {
			const uniqueLines = extractUniqueLines(conflict.input1Diffs);

			// Create a decoration for each unique line that actually changed
			for (const lineNum of uniqueLines) {
				decorations.push({
					range: new monacoInstance.Range(lineNum, 1, lineNum, Number.MAX_SAFE_INTEGER),
					options: {
						isWholeLine: true,
						className: classes.input1Class,
						linesDecorationsClassName:
							classes.input1Symbol && classes.input1Symbol !== ""
								? `diff-symbol diff-symbol-${classes.input1Symbol === "+" ? "plus" : "minus"}`
								: undefined,
						overviewRuler: classes.input1OverviewColor
							? {
									color: classes.input1OverviewColor,
									position: monacoInstance.editor.OverviewRulerLane.Full,
								}
							: undefined,
						minimap: classes.input1OverviewColor
							? {
									color: classes.input1OverviewColor,
									position: monacoInstance.editor.MinimapPosition.Inline,
								}
							: undefined,
					},
				});
			}
		} else if (conflict.conflictType === ConflictTypeEnum.INPUT1_ONLY) {
			// For INPUT1_ONLY (deletions in 2-way mode), highlight the entire range
			// since input1Diffs may be empty but we still want to show the deleted content
			const startLine = conflict.input1Range.startLineNumber;
			const endLine = conflict.input1Range.endLineNumberExclusive - 1;

			for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
				decorations.push({
					range: new monacoInstance.Range(lineNum, 1, lineNum, Number.MAX_SAFE_INTEGER),
					options: {
						isWholeLine: true,
						className: classes.input1Class,
						linesDecorationsClassName:
							classes.input1Symbol && classes.input1Symbol !== ""
								? `diff-symbol diff-symbol-${classes.input1Symbol === "+" ? "plus" : "minus"}`
								: undefined,
						overviewRuler: classes.input1OverviewColor
							? {
									color: classes.input1OverviewColor,
									position: monacoInstance.editor.OverviewRulerLane.Full,
								}
							: undefined,
						minimap: classes.input1OverviewColor
							? {
									color: classes.input1OverviewColor,
									position: monacoInstance.editor.MinimapPosition.Inline,
								}
							: undefined,
					},
				});
			}
		}
	}

	return decorations;
}

/**
 * Creates Monaco editor decorations for input2 (ours) panel
 */
export function createInput2Decorations(
	conflict: ModifiedBaseRange,
	classes: DecorationClasses,
	monacoInstance: typeof monaco,
): monaco.editor.IModelDeltaDecoration[] {
	const decorations: monaco.editor.IModelDeltaDecoration[] = [];

	// Only highlight specific lines from input2Diffs, not the entire range
	// This ensures we don't highlight lines with identical/unchanged properties
	if (conflict.input2Diffs.length > 0 && classes.input2Class) {
		const uniqueLines = extractUniqueLines(conflict.input2Diffs);

		// Create a decoration for each unique line that actually changed
		for (const lineNum of uniqueLines) {
			decorations.push({
				range: new monacoInstance.Range(lineNum, 1, lineNum, Number.MAX_SAFE_INTEGER),
				options: {
					isWholeLine: true,
					className: classes.input2Class,
					linesDecorationsClassName:
						classes.input2Symbol && classes.input2Symbol !== ""
							? `diff-symbol diff-symbol-${classes.input2Symbol === "+" ? "plus" : "minus"}`
							: undefined,
					overviewRuler: classes.input2OverviewColor
						? {
								color: classes.input2OverviewColor,
								position: monacoInstance.editor.OverviewRulerLane.Full,
							}
						: undefined,
					minimap: classes.input2OverviewColor
						? {
								color: classes.input2OverviewColor,
								position: monacoInstance.editor.MinimapPosition.Inline,
							}
						: undefined,
				},
			});
		}
	}

	return decorations;
}

/**
 * Creates Monaco editor decorations for base panel
 */
export function createBaseDecorations(
	conflict: ModifiedBaseRange,
	classes: DecorationClasses,
	monacoInstance: typeof monaco,
): monaco.editor.IModelDeltaDecoration[] {
	const decorations: monaco.editor.IModelDeltaDecoration[] = [];

	// Color base changes - always highlight when there's any change
	// Skip highlighting if baseRange is the default {1, 2} - this means the item doesn't exist in base
	const isDefaultRange = conflict.baseRange.startLineNumber === 1 && conflict.baseRange.endLineNumberExclusive === 2;

	if ((conflict.input1Diffs.length > 0 || conflict.input2Diffs.length > 0) && !isDefaultRange) {
		decorations.push({
			range: new monacoInstance.Range(
				conflict.baseRange.startLineNumber,
				1,
				conflict.baseRange.endLineNumberExclusive - 1,
				Number.MAX_SAFE_INTEGER,
			),
			options: {
				isWholeLine: true,
				className: classes.baseClass,
				overviewRuler: {
					color: classes.baseOverviewColor,
					position: monacoInstance.editor.OverviewRulerLane.Full,
				},
				minimap: {
					color: classes.baseOverviewColor,
					position: monacoInstance.editor.MinimapPosition.Inline,
				},
			},
		});
	}

	return decorations;
}

/**
 * Creates all decorations for a conflict (input1, input2, and base)
 */
export function createConflictDecorations(
	conflict: ModifiedBaseRange,
	isTwoColumnMode: boolean,
	config: DecorationConfig,
	monacoInstance: typeof monaco,
): {
	input1Decorations: monaco.editor.IModelDeltaDecoration[];
	input2Decorations: monaco.editor.IModelDeltaDecoration[];
	baseDecorations: monaco.editor.IModelDeltaDecoration[];
} {
	const classes = getDecorationClasses(conflict, isTwoColumnMode, config);

	return {
		input1Decorations: createInput1Decorations(conflict, classes, monacoInstance),
		input2Decorations: createInput2Decorations(conflict, classes, monacoInstance),
		baseDecorations: createBaseDecorations(conflict, classes, monacoInstance),
	};
}

/**
 * Creates decorations for all conflicts
 */
export function createAllDecorations(
	conflicts: ModifiedBaseRange[],
	isTwoColumnMode: boolean,
	config: DecorationConfig,
	monacoInstance: typeof monaco,
): {
	input1Decorations: monaco.editor.IModelDeltaDecoration[];
	input2Decorations: monaco.editor.IModelDeltaDecoration[];
	baseDecorations: monaco.editor.IModelDeltaDecoration[];
} {
	const input1Decorations: monaco.editor.IModelDeltaDecoration[] = [];
	const input2Decorations: monaco.editor.IModelDeltaDecoration[] = [];
	const baseDecorations: monaco.editor.IModelDeltaDecoration[] = [];

	for (const conflict of conflicts) {
		const decorations = createConflictDecorations(conflict, isTwoColumnMode, config, monacoInstance);
		input1Decorations.push(...decorations.input1Decorations);
		input2Decorations.push(...decorations.input2Decorations);
		baseDecorations.push(...decorations.baseDecorations);
	}

	return {
		input1Decorations,
		input2Decorations,
		baseDecorations,
	};
}
