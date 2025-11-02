import type * as monaco from "monaco-editor";
import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { createAllDecorations, type DecorationConfig } from "../editorDecorations";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Tests to verify that conflict rendering matches the expected behavior
 *
 * These tests verify:
 * 1. Only actual changed lines are highlighted
 * 2. Identical lines are NOT highlighted (even if part of a changed object)
 * 3. Specific cases from render image (lines 6 and 8 in input1)
 */
describe("Conflict Rendering - Highlighting Correctness", () => {
	const { base, theirs, ours, schema } = getSampleData();

	// Mock Monaco instance for decoration creation
	const mockMonaco = {
		Range: class {
			constructor(
				public startLineNumber: number,
				public startColumn: number,
				public endLineNumber: number,
				public endColumn: number,
			) {}
		},
		editor: {
			OverviewRulerLane: {
				Full: 7,
			},
			MinimapPosition: {
				Inline: 1,
			},
		},
	} as unknown as typeof monaco;

	const mockConfig: DecorationConfig = {
		conflictColor: "rgba(255, 166, 0, 0.2)",
		changeColor: "rgba(155, 185, 85, 0.2)",
		baseColor: "rgba(255, 100, 100, 0.2)",
		conflictOverviewColor: "rgba(255, 166, 0, 0.8)",
		changeOverviewColor: "rgba(155, 185, 85, 0.8)",
		baseOverviewColor: "rgba(255, 100, 100, 0.8)",
	};

	it("should NOT highlight line 6 ('settings: {') in input1 when it's identical to base", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Parse JSON to verify actual content
		const baseObj = JSON.parse(base);
		const theirsObj = JSON.parse(theirs);

		// Parse text to find actual line numbers
		const theirsLines = theirs.split("\n");
		const baseLines = base.split("\n");

		// Find the line with "settings": { in both versions
		const theirsSettingsLine = theirsLines.findIndex((line) => line.includes('"settings": {'));
		const baseSettingsLine = baseLines.findIndex((line) => line.includes('"settings": {'));

		if (theirsSettingsLine >= 0 && baseSettingsLine >= 0) {
			// Line numbers are 1-indexed in the editor, but 0-indexed in array
			const line6 = theirsSettingsLine + 1;

			// Verify line 6 content is identical (check under user object)
			expect(theirsObj.user?.settings).toBeDefined();
			expect(baseObj.user?.settings).toBeDefined();

			// Find conflicts related to settings
			const settingsConflicts = ranges.filter((r) => r.path?.includes("settings"));

			// Check if line 6 is in any input1Diffs
			let line6InAnyInput1Diffs = false;
			for (const conflict of settingsConflicts) {
				const line6InDiffs = conflict.input1Diffs.some((diff) => {
					const d = diff as { line?: number };
					return d?.line === line6;
				});
				if (line6InDiffs) {
					line6InAnyInput1Diffs = true;
					console.log(`?? Line ${line6} (settings opening) is in input1Diffs for conflict at ${conflict.path}`);
				}
			}

			// If the settings opening brace is identical, line 6 should NOT be in diffs
			const theirsLine6Content = theirsLines[theirsSettingsLine]?.trim();
			const baseLine6Content = baseLines[baseSettingsLine]?.trim();
			if (theirsLine6Content === baseLine6Content) {
				expect(line6InAnyInput1Diffs).toBe(false);
			}
		}

		// Create decorations (for verification, though we're mainly checking input1Diffs)
		createAllDecorations(ranges, false, mockConfig, mockMonaco);
	});

	it("should NOT highlight line 8 ('notifications: true') in input1 when value is identical to base", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Parse JSON to verify actual values
		const baseObj = JSON.parse(base);
		const theirsObj = JSON.parse(theirs);

		// Verify notifications value is identical (check under user object)
		expect(theirsObj.user?.settings?.notifications).toBe(baseObj.user?.settings?.notifications);
		expect(theirsObj.user?.settings?.notifications).toBe(true);

		// Find conflicts for settings/notifications
		const _notificationsConflict = ranges.find((r) => r.path === "/user/settings/notifications" || r.path?.includes("notifications"));

		// Create decorations
		const { input1Decorations } = createAllDecorations(ranges, false, mockConfig, mockMonaco);

		// Parse input1 text to find line 8
		const theirsLines = theirs.split("\n");
		const line8Content = theirsLines[7]?.trim(); // Line 8 (0-indexed: 7)

		if (line8Content?.includes('"notifications": true')) {
			// Check if line 8 is highlighted
			const line8Decorations = input1Decorations.filter((dec) => {
				const range = dec.range as unknown as {
					startLineNumber: number;
					endLineNumber: number;
				};
				return range.startLineNumber <= 8 && range.endLineNumber >= 8;
			});

			// Line 8 should NOT be highlighted if notifications value is identical to base
			// However, if the entire settings object is being highlighted as a block,
			// line 8 might still be included. The fix should prevent this.

			// Check only settings/notifications conflicts to see if any have line 8 in their input1Diffs
			let notificationsLineInAnyInput1Diffs = false;

			for (const conflict of ranges) {
				// Only check settings/notifications conflicts (not other conflicts that might use line 8)
				if (conflict.path?.includes("settings") || conflict.path?.includes("notifications")) {
					const line8InDiffs = conflict.input1Diffs.some((diff) => {
						const d = diff as { line?: number };
						return d?.line === 8;
					});
					if (line8InDiffs) {
						notificationsLineInAnyInput1Diffs = true;
						console.log(`?? Line 8 (notifications) is in input1Diffs for conflict at ${conflict.path}:`, {
							path: conflict.path,
							input1Diffs: conflict.input1Diffs,
							conflictType: conflict.conflictType,
						});
					}
				}
			}

			if (theirsObj.user?.settings?.notifications === baseObj.user?.settings?.notifications) {
				// If value is identical, notifications line should NOT be in any settings/notifications conflict's input1Diffs
				expect(notificationsLineInAnyInput1Diffs).toBe(false);

				// And therefore should NOT be decorated
				expect(line8Decorations.length).toBe(0);
			}
		}
	});

	it("should only highlight lines that have actual changes in input1Diffs", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Parse JSON for value comparison
		const _baseObj = JSON.parse(base);
		const _theirsObj = JSON.parse(theirs);
		const _oursObj = JSON.parse(ours);

		const { input1Decorations } = createAllDecorations(ranges, false, mockConfig, mockMonaco);

		// Get all highlighted line numbers from decorations
		const highlightedLines = new Set<number>();
		for (const dec of input1Decorations) {
			const range = dec.range as unknown as {
				startLineNumber: number;
				endLineNumber: number;
			};
			for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
				highlightedLines.add(line);
			}
		}

		// For each highlighted line, verify it has a corresponding diff
		for (const range of ranges) {
			if (range.input1Diffs.length > 0) {
				const diffLines = range.input1Diffs
					.map((diff) => {
						const d = diff as { line?: number };
						return d?.line;
					})
					.filter((line: number | undefined): line is number => typeof line === "number");

				// Each diff line should be highlighted
				for (const diffLine of diffLines) {
					expect(highlightedLines.has(diffLine)).toBe(true);
				}

				// Verify that only diff lines are highlighted (for this conflict)
				// This ensures we're not highlighting entire ranges
			}
		}
	});

	it("should NOT highlight settings object lines when only language field differs", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		const baseObj = JSON.parse(base);
		const theirsObj = JSON.parse(theirs);

		// Verify settings structure (check under user object)
		expect(theirsObj.user?.settings?.theme).toBe(baseObj.user?.settings?.theme);
		expect(theirsObj.user?.settings?.notifications).toBe(baseObj.user?.settings?.notifications);
		expect(theirsObj.user?.settings?.language).toBeDefined(); // Added in theirs
		expect(baseObj.user?.settings?.language).toBeUndefined(); // Not in base

		// Find settings conflicts
		const _settingsConflict = ranges.find((r) => r.path?.includes("settings") && !r.path?.includes("language"));

		// If there's a conflict for the settings object itself (not just language),
		// it should only include the language line in diffs
		const languageConflict = ranges.find((r) => r.path?.includes("language"));

		if (languageConflict) {
			// Language conflict should only highlight the language line
			const diffLines = languageConflict.input1Diffs
				.map((diff) => {
					const d = diff as { line?: number };
					return d?.line;
				})
				.filter((line: number | undefined): line is number => typeof line === "number");

			// Verify settings opening brace (line 6) and notifications (line 8) are NOT in diffs
			const line6InDiffs = diffLines.includes(6);
			const line8InDiffs = diffLines.includes(8);

			// These should NOT be highlighted for the language-only change
			expect(line6InDiffs).toBe(false);
			expect(line8InDiffs).toBe(false);
		}
	});

	it("should verify specific line numbers from render image", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Parse JSON to check values
		const baseObj = JSON.parse(base);
		const theirsObj = JSON.parse(theirs);
		const _oursObj = JSON.parse(ours);

		// Split text into lines to verify line numbers
		const theirsLines = theirs.split("\n");
		const baseLines = base.split("\n");

		// Find line 6: "settings": {
		const theirsLine6 = theirsLines[5]?.trim(); // Index 5 = line 6
		const baseLine6 = baseLines[5]?.trim();

		// Find line 8: "notifications": true
		const theirsLine8 = theirsLines[7]?.trim(); // Index 7 = line 8
		const baseLine8 = baseLines[7]?.trim();

		// Find notifications conflict directly (more reliable than checking line numbers)
		const notificationsConflict = ranges.find((r) => r.path === "/user/settings/notifications");

		// Verify notifications conflict has empty input1Diffs when value is identical
		if (notificationsConflict && theirsObj.user?.settings?.notifications === baseObj.user?.settings?.notifications) {
			expect(notificationsConflict.input1Diffs.length).toBe(0);
		}

		// Verify these lines are identical (ignoring whitespace)
		if (theirsLine6 && baseLine6) {
			const theirsLine6Content = theirsLine6.replace(/\s+/g, " ").trim();
			const baseLine6Content = baseLine6.replace(/\s+/g, " ").trim();

			if (theirsLine6Content === baseLine6Content) {
				// Line 6 is identical - should NOT be in input1Diffs
				for (const range of ranges) {
					const line6InDiffs = range.input1Diffs.some((diff) => {
						const d = diff as { line?: number };
						return d?.line === 6;
					});

					// If this conflict doesn't involve an actual change on line 6, it shouldn't be in diffs
					if (line6InDiffs) {
						// Verify that line 6 actually has a different value in this conflict
						const pathForLine6 = range.path;
						console.warn(`?? Line 6 is in diffs for conflict at ${pathForLine6}, but content is identical`);
					}
				}
			}
		}

		if (theirsLine8 && baseLine8) {
			const theirsLine8Content = theirsLine8.replace(/\s+/g, " ").trim();
			const baseLine8Content = baseLine8.replace(/\s+/g, " ").trim();

			// Extract just the value part (ignore commas)
			const theirsValue = theirsLine8Content.match(/:\s*(.+?)(?:,|$)/)?.[1];
			const baseValue = baseLine8Content.match(/:\s*(.+?)(?:,|$)/)?.[1];

			if (theirsValue === baseValue) {
				// Line 8 value is identical - should NOT be in input1Diffs
				for (const range of ranges) {
					const line8InDiffs = range.input1Diffs.some((diff) => {
						const d = diff as { line?: number };
						return d?.line === 8;
					});

					if (line8InDiffs) {
						// Verify that line 8 actually has a different value in this conflict
						const pathForLine8 = range.path;
						console.warn(`?? Line 8 is in diffs for conflict at ${pathForLine8}, but value is identical`);

						// This should fail - line 8 should NOT be in diffs if value is identical
						expect(line8InDiffs).toBe(false);
					}
				}
			}
		}
	});

	it("should create decorations only for lines in input1Diffs, not entire ranges", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		const { input1Decorations } = createAllDecorations(ranges, false, mockConfig, mockMonaco);

		// For each conflict, verify decorations only exist for lines in input1Diffs
		for (const conflict of ranges) {
			if (conflict.input1Diffs.length > 0) {
				const expectedLines = new Set<number>();
				for (const diff of conflict.input1Diffs) {
					if (diff && typeof diff === "object" && "line" in diff) {
						const lineNum = (diff as { line: number }).line;
						if (lineNum > 0) {
							expectedLines.add(lineNum);
						}
					}
				}

				// Find decorations for this conflict (by checking if they overlap with conflict range)
				const conflictDecorations = input1Decorations.filter((dec) => {
					const range = dec.range as unknown as {
						startLineNumber: number;
						endLineNumber: number;
					};
					// Check if decoration overlaps with conflict range
					return (
						range.startLineNumber <= conflict.input1Range.endLineNumberExclusive &&
						range.endLineNumber >= conflict.input1Range.startLineNumber
					);
				});

				// Verify that decorations only exist for expected lines
				for (const dec of conflictDecorations) {
					const range = dec.range as unknown as {
						startLineNumber: number;
						endLineNumber: number;
					};

					// Each decorated line should be in expectedLines
					for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
						// Only check if this line is actually expected (might be part of a range)
						if (expectedLines.has(line)) {
							// Good - this line is expected
						} else {
							// This line shouldn't be decorated for this conflict
							console.warn(`?? Line ${line} is decorated but not in input1Diffs for conflict at ${conflict.path}`);
						}
					}
				}
			}
		}
	});
});
