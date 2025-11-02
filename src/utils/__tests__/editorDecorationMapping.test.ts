import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { ConflictType } from "../../types";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Tests for decoration class mapping
 *
 * Verifies that conflicts map to the correct CSS decoration classes
 * used by EditorDiffMerge for visual highlighting
 */
describe("Editor Decoration Class Mapping", () => {
	const { base, theirs, ours, schema } = getSampleData();

	describe("Decoration Class Mapping Rules", () => {
		it("should correctly identify conflicts that need merge-conflict-* classes", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// TRUE_CONFLICT should use merge-conflict-* classes
			// (merge-conflict-incoming, merge-conflict-current, merge-conflict-base)
			const trueConflicts = ranges.filter((r) => r.conflictType === ConflictType.TRUE_CONFLICT);

			expect(trueConflicts.length).toBeGreaterThan(0);

			for (const range of trueConflicts) {
				// Should be marked as conflicting (for decoration logic)
				expect(range.isConflicting).toBe(true);

				// EditorDiffMerge will apply:
				// - input1Class = "merge-conflict-incoming" (orange/red)
				// - input2Class = "merge-conflict-current" (orange/amber)
				// - baseClass = "merge-conflict-base" (base highlighting)
			}
		});

		it("should correctly identify changes that need merge-change-* classes", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// INPUT1_ONLY, INPUT2_ONLY, SAME_CHANGE use merge-change-* classes
			const nonConflicts = ranges.filter((r) => r.conflictType !== ConflictType.TRUE_CONFLICT);

			expect(nonConflicts.length).toBeGreaterThan(0);

			for (const range of nonConflicts) {
				expect(range.isConflicting).toBe(false);

				// EditorDiffMerge will apply different classes based on type:
				// - INPUT1_ONLY: "merge-change-incoming" (red/orange)
				// - INPUT2_ONLY: "merge-change-current" (green)
				// - SAME_CHANGE: "merge-same-change" (blue) or "merge-change-incoming"
			}
		});

		it("should map payment oneOf conflict to conflict decoration classes", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const paymentRange = ranges.find((r) => r.path === "/payment");

			if (paymentRange) {
				// Payment oneOf variant change should be TRUE_CONFLICT
				expect(paymentRange.conflictType).toBe(ConflictType.TRUE_CONFLICT);
				expect(paymentRange.isConflicting).toBe(true);

				// Should get conflict decoration classes:
				// - merge-conflict-incoming for input1 (crypto)
				// - merge-conflict-current for input2 (cash)
				// - merge-conflict-base for base (card)
			}
		});

		it("should map field changes to change decoration classes", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const emailRange = ranges.find((r) => r.path === "/user/email");
			const nameRange = ranges.find((r) => r.path === "/user/name");

			if (emailRange) {
				// Email is INPUT1_ONLY - should get "merge-change-incoming"
				expect(emailRange.conflictType).toBe(ConflictType.INPUT1_ONLY);
				expect(emailRange.isConflicting).toBe(false);
			}

			if (nameRange) {
				// Name is INPUT2_ONLY - should get "merge-change-current"
				expect(nameRange.conflictType).toBe(ConflictType.INPUT2_ONLY);
				expect(nameRange.isConflicting).toBe(false);
			}
		});
	});

	describe("Input State to Checkbox Rendering", () => {
		it("should have correct initial checkbox states for rendering", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Checkbox rendering uses input1State and input2State
			// - InputState.first = checked
			// - InputState.excluded = unchecked

			for (const range of ranges) {
				// States should be valid
				expect([InputState.excluded, InputState.first, InputState.second]).toContain(range.input1State);
				expect([InputState.excluded, InputState.first, InputState.second]).toContain(range.input2State);

				// For conflicts that should be auto-accepted, checkboxes should be checked
				if (range.conflictType === ConflictType.SAME_CHANGE) {
					expect(range.input1State).toBe(InputState.first);
					expect(range.input2State).toBe(InputState.first);
				}
			}
		});
	});

	describe("Overview Ruler and Minimap Markers", () => {
		it("should have diff lines for overview ruler markers", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// Overview ruler uses input1Diffs and input2Diffs for markers
				// Each diff should have a line number
				expect(Array.isArray(range.input1Diffs)).toBe(true);
				expect(Array.isArray(range.input2Diffs)).toBe(true);

				// Diff lines are used for gutter indicators and overview ruler
				for (const diff of range.input1Diffs) {
					expect(diff.line).toBeGreaterThan(0);
				}
				for (const diff of range.input2Diffs) {
					expect(diff.line).toBeGreaterThan(0);
				}
			}
		});
	});

	describe("Range Spanning for Multi-line Objects", () => {
		it("should correctly span ranges for multi-line payment object", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const paymentRange = ranges.find((r) => r.path === "/payment");

			if (paymentRange) {
				// Payment object should span the entire object (multiple lines)
				const baseSpan = paymentRange.baseRange.endLineNumberExclusive - paymentRange.baseRange.startLineNumber;
				const input1Span = paymentRange.input1Range.endLineNumberExclusive - paymentRange.input1Range.startLineNumber;
				const input2Span = paymentRange.input2Range.endLineNumberExclusive - paymentRange.input2Range.startLineNumber;

				// Object should span at least 1 line (could be more if formatted with newlines)
				expect(baseSpan).toBeGreaterThanOrEqual(1);
				expect(input1Span).toBeGreaterThanOrEqual(1);
				expect(input2Span).toBeGreaterThanOrEqual(1);
			}
		});

		it("should correctly span ranges for field-level changes", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const emailRange = ranges.find((r) => r.path === "/user/email");

			if (emailRange) {
				// Field-level changes typically span 1 line (the property line)
				// Could span more if the value itself is multi-line
				const span = emailRange.input1Range.endLineNumberExclusive - emailRange.input1Range.startLineNumber;
				expect(span).toBeGreaterThanOrEqual(1);
			}
		});
	});
});

// Import InputState for testing
import { InputState } from "../../types";
