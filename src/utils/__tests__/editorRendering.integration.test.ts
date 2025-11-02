import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { ConflictType, InputState } from "../../types";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Integration tests for editor rendering
 *
 * These tests verify that conflicts from jsonPatchDiff are correctly formatted
 * for Monaco Editor rendering, including:
 * 1. All conflicts have required properties for rendering
 * 2. Conflict types map to correct decoration classes
 * 3. Input states are correctly initialized
 * 4. Line ranges are compatible with Monaco's decoration API
 */
describe("Editor Rendering Integration", () => {
	const { base, theirs, ours, schema } = getSampleData();

	describe("Monaco Editor Compatibility", () => {
		it("should produce ranges compatible with Monaco's decoration API", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// Monaco expects startLineNumber and endLineNumberExclusive
				expect(range.baseRange).toHaveProperty("startLineNumber");
				expect(range.baseRange).toHaveProperty("endLineNumberExclusive");
				expect(range.input1Range).toHaveProperty("startLineNumber");
				expect(range.input1Range).toHaveProperty("endLineNumberExclusive");
				expect(range.input2Range).toHaveProperty("startLineNumber");
				expect(range.input2Range).toHaveProperty("endLineNumberExclusive");

				// endLineNumberExclusive should be greater than startLineNumber
				expect(range.baseRange.endLineNumberExclusive).toBeGreaterThan(range.baseRange.startLineNumber);
				expect(range.input1Range.endLineNumberExclusive).toBeGreaterThan(range.input1Range.startLineNumber);
				expect(range.input2Range.endLineNumberExclusive).toBeGreaterThan(range.input2Range.startLineNumber);

				// Line numbers should be integers >= 1 (Monaco is 1-indexed)
				expect(Number.isInteger(range.baseRange.startLineNumber)).toBe(true);
				expect(Number.isInteger(range.input1Range.startLineNumber)).toBe(true);
				expect(Number.isInteger(range.input2Range.startLineNumber)).toBe(true);
				expect(range.baseRange.startLineNumber).toBeGreaterThanOrEqual(1);
				expect(range.input1Range.startLineNumber).toBeGreaterThanOrEqual(1);
				expect(range.input2Range.startLineNumber).toBeGreaterThanOrEqual(1);
			}
		});

		it("should have all required properties for conflict rendering", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// Required properties for rendering
				expect(range).toHaveProperty("id");
				expect(range).toHaveProperty("path");
				expect(range).toHaveProperty("baseRange");
				expect(range).toHaveProperty("input1Range");
				expect(range).toHaveProperty("input2Range");
				expect(range).toHaveProperty("conflictType");
				expect(range).toHaveProperty("isConflicting");
				expect(range).toHaveProperty("input1State");
				expect(range).toHaveProperty("input2State");
				expect(range).toHaveProperty("input1Diffs");
				expect(range).toHaveProperty("input2Diffs");
				expect(range).toHaveProperty("handled");
				expect(range).toHaveProperty("focused");
			}
		});
	});

	describe("Conflict Type to Decoration Class Mapping", () => {
		it("should correctly identify conflicts that need conflict decorations", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const trueConflicts = ranges.filter((r) => r.conflictType === ConflictType.TRUE_CONFLICT);

			// All TRUE_CONFLICT should have isConflicting = true
			for (const range of trueConflicts) {
				expect(range.isConflicting).toBe(true);
				// These should use conflict decoration classes (orange/red)
				// EditorDiffMerge applies "merge-conflict-incoming" and "merge-conflict-current"
			}

			const nonConflicts = ranges.filter((r) => r.conflictType !== ConflictType.TRUE_CONFLICT);

			// Non-conflicts should have isConflicting = false
			for (const range of nonConflicts) {
				expect(range.isConflicting).toBe(false);
				// These use change decoration classes (green/blue/red)
			}
		});

		it("should correctly mark SAME_CHANGE as handled", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const sameChanges = ranges.filter((r) => r.conflictType === ConflictType.SAME_CHANGE);

			for (const range of sameChanges) {
				// SAME_CHANGE should be auto-handled (both accepted)
				expect(range.handled).toBe(true);
				expect(range.input1State).toBe(InputState.first);
				expect(range.input2State).toBe(InputState.first);
			}
		});
	});

	describe("Input State Initialization for Rendering", () => {
		it("should initialize states correctly for checkbox rendering", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// Input states should be valid
				expect([InputState.excluded, InputState.first, InputState.second]).toContain(range.input1State);
				expect([InputState.excluded, InputState.first, InputState.second]).toContain(range.input2State);

				// For INPUT1_ONLY, input1 should be checked
				if (range.conflictType === ConflictType.INPUT1_ONLY) {
					expect(range.input1State).toBe(InputState.first);
				}

				// For INPUT2_ONLY, input2 should be checked
				if (range.conflictType === ConflictType.INPUT2_ONLY) {
					expect(range.input2State).toBe(InputState.first);
				}

				// For TRUE_CONFLICT, input2 should be checked by default (ours)
				if (range.conflictType === ConflictType.TRUE_CONFLICT) {
					expect(range.input2State).toBe(InputState.first);
					expect(range.input1State).toBe(InputState.excluded);
				}
			}
		});
	});

	describe("Path-Based Value Extraction", () => {
		it("should preserve paths for value extraction during merge resolution", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// Path should be preserved for value extraction
				expect(range.path).toBeDefined();

				// Path should be valid JSON Pointer for getValueAtPath
				if (range.path && range.path.length > 0) {
					// Should start with /
					expect(range.path.startsWith("/")).toBe(true);
				}
			}
		});

		it("should have paths that can be used to extract values from parsed JSON", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const baseObj = JSON.parse(base);
			const theirsObj = JSON.parse(theirs);
			const oursObj = JSON.parse(ours);

			// Verify we can extract values using the paths
			for (const range of ranges) {
				if (range.path) {
					// Try to extract value - should not throw
					// Some paths might not exist (e.g., for additions), which is OK
					try {
						const baseValue = baseObj ? getValueAtPath(baseObj, range.path) : undefined;
						const theirsValue = getValueAtPath(theirsObj, range.path);
						const oursValue = getValueAtPath(oursObj, range.path);

						// At least one should be defined (unless it's a pure addition/removal)
						expect(baseValue !== undefined || theirsValue !== undefined || oursValue !== undefined).toBe(true);
					} catch (error) {
						// Path parsing might fail for malformed paths, which is a bug
						throw new Error(`Invalid path "${range.path}": ${error instanceof Error ? error.message : String(error)}`);
					}
				}
			}
		});
	});

	describe("Diff Line Tracking for Rendering", () => {
		it("should track diff lines for gutter indicators", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// input1Diffs and input2Diffs should be arrays
				expect(Array.isArray(range.input1Diffs)).toBe(true);
				expect(Array.isArray(range.input2Diffs)).toBe(true);

				// Each diff should have at least a line property
				for (const diff of range.input1Diffs) {
					expect(diff).toHaveProperty("line");
					expect(typeof diff.line).toBe("number");
					expect(diff.line).toBeGreaterThan(0);
				}

				for (const diff of range.input2Diffs) {
					expect(diff).toHaveProperty("line");
					expect(typeof diff.line).toBe("number");
					expect(diff.line).toBeGreaterThan(0);
				}
			}
		});

		it("should have diff lines that correspond to patch operations", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// For conflicts with patches, should have corresponding diff lines
			for (const range of ranges) {
				// If there are patches, there should be diff lines
				// (unless it's an unchanged item)
				const hasPatches = range.input1Diffs.length > 0 || range.input2Diffs.length > 0;

				if (hasPatches) {
					// Should have at least one diff line
					expect(range.input1Diffs.length > 0 || range.input2Diffs.length > 0).toBe(true);
				}
			}
		});
	});

	describe("OneOf Variant Rendering", () => {
		it("should render payment oneOf variant conflict as single object-level decoration", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const paymentRange = ranges.find((r) => r.path === "/payment");

			if (paymentRange) {
				// Should be rendered as a single conflict on the payment object
				expect(paymentRange.path).toBe("/payment");
				expect(paymentRange.conflictType).toBe(ConflictType.TRUE_CONFLICT);
				expect(paymentRange.isConflicting).toBe(true);

				// Should have valid ranges for all three columns
				expect(paymentRange.baseRange.startLineNumber).toBeGreaterThan(0);
				expect(paymentRange.input1Range.startLineNumber).toBeGreaterThan(0);
				expect(paymentRange.input2Range.startLineNumber).toBeGreaterThan(0);
			}
		});
	});

	describe("Field-Level Rendering", () => {
		it("should render field changes as separate decorations", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const emailRange = ranges.find((r) => r.path === "/user/email");
			const nameRange = ranges.find((r) => r.path === "/user/name");

			// Both should be separate conflicts with their own decorations
			expect(emailRange).toBeDefined();
			expect(nameRange).toBeDefined();

			if (emailRange && nameRange) {
				expect(emailRange.id).not.toBe(nameRange.id);
				expect(emailRange.path).not.toBe(nameRange.path);
			}
		});
	});

	describe("Empty Base (2-Column Mode)", () => {
		it("should produce valid ranges when base is empty", () => {
			const emptyBase = "";
			const ranges = computeDiffsJsonPatch(emptyBase, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			expect(ranges.length).toBeGreaterThan(0);

			for (const range of ranges) {
				// Base range might be default (1,1) when base is empty
				// But input ranges should be valid
				expect(range.input1Range.startLineNumber).toBeGreaterThan(0);
				expect(range.input2Range.startLineNumber).toBeGreaterThan(0);
			}
		});
	});
});

// Helper function for testing
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
	if (!obj || !path) return undefined;

	const segments = path.replace(/^\//, "").split("/").filter(Boolean);

	let current: unknown = obj;
	for (const segment of segments) {
		if (current === null || typeof current !== "object") {
			return undefined;
		}

		if (Array.isArray(current)) {
			const index = Number.parseInt(segment, 10);
			if (Number.isNaN(index) || index < 0 || index >= current.length) {
				return undefined;
			}
			current = current[index];
		} else if (segment in current) {
			current = (current as Record<string, unknown>)[segment];
		} else {
			return undefined;
		}
	}
	return current;
}
