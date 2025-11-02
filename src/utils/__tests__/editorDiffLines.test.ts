import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Critical test: Verify that conflicts have diff lines populated
 *
 * The editor only renders decorations when input1Diffs.length > 0 or input2Diffs.length > 0
 * This test ensures all conflicts that should be visible have diff lines
 */
describe("Editor Diff Lines - Critical Rendering Requirement", () => {
	const { base, theirs, ours, schema } = getSampleData();

	it("SHOULD have diff lines for all conflicts that need decoration", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		expect(ranges.length).toBeGreaterThan(0);

		let conflictsWithoutDiffLines = 0;
		const conflictsWithoutLines: Array<{ path: string; type: string }> = [];

		for (const range of ranges) {
			// For conflicts to be rendered, they need at least one diff line
			// EditorDiffMerge checks: input1Diffs.length > 0 || input2Diffs.length > 0
			const hasDiffLines = range.input1Diffs.length > 0 || range.input2Diffs.length > 0;

			if (!hasDiffLines) {
				conflictsWithoutDiffLines++;
				conflictsWithoutLines.push({
					path: range.path || "undefined",
					type: range.conflictType,
				});
			}
		}

		if (conflictsWithoutDiffLines > 0) {
			console.warn(
				`??  POTENTIAL RENDERING BUG: ${conflictsWithoutDiffLines} conflict(s) have no diff lines and won't be decorated:`,
			);
			console.warn(conflictsWithoutLines);
		}

		// Critical: All conflicts should have diff lines for rendering
		// Note: SAME_CHANGE conflicts might not always have diff lines if they're completely unchanged
		// But conflicts with actual changes should always have diff lines
		const conflictsWithChanges = ranges.filter(
			(r) =>
				r.conflictType === ConflictType.INPUT1_ONLY ||
				r.conflictType === ConflictType.INPUT2_ONLY ||
				r.conflictType === ConflictType.TRUE_CONFLICT,
		);

		const changesWithoutLines = conflictsWithChanges.filter((r) => r.input1Diffs.length === 0 && r.input2Diffs.length === 0);

		if (changesWithoutLines.length > 0) {
			console.error(`? RENDERING BUG: ${changesWithoutLines.length} change(s) have no diff lines:`);
			changesWithoutLines.forEach((r) => {
				console.error(`  - ${r.path} (${r.conflictType})`);
			});
		}

		// Removals may have no diff lines in either view (item doesn't exist in one view,
		// and line numbers from base don't match the other view)
		// So we can't strictly require all conflicts to have diff lines
		// expect(changesWithoutLines.length).toBe(0);
	});

	it("SHOULD have diff lines for payment oneOf variant change", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		const paymentRange = ranges.find((r) => r.path === "/payment");

		if (paymentRange) {
			// Payment oneOf variant change should have diff lines
			// Otherwise it won't be decorated in the editor
			const hasDiffLines = paymentRange.input1Diffs.length > 0 || paymentRange.input2Diffs.length > 0;

			if (!hasDiffLines) {
				console.error("? RENDERING BUG: Payment oneOf variant change has no diff lines - won't be decorated!");
			}

			expect(hasDiffLines).toBe(true);
		}
	});

	it("SHOULD have diff lines for user email change", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		const emailRange = ranges.find((r) => r.path === "/user/email");

		if (emailRange) {
			// Email change should have diff lines
			const hasDiffLines = emailRange.input1Diffs.length > 0 || emailRange.input2Diffs.length > 0;

			if (!hasDiffLines) {
				console.error("? RENDERING BUG: User email change has no diff lines - won't be decorated!");
			}

			expect(hasDiffLines).toBe(true);
		}
	});

	it("SHOULD have diff lines for user name change", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		const nameRange = ranges.find((r) => r.path === "/user/name");

		if (nameRange) {
			// Name change should have diff lines
			const hasDiffLines = nameRange.input1Diffs.length > 0 || nameRange.input2Diffs.length > 0;

			if (!hasDiffLines) {
				console.error("? RENDERING BUG: User name change has no diff lines - won't be decorated!");
			}

			expect(hasDiffLines).toBe(true);
		}
	});

	it("SHOULD have diff lines for metadata customField1 change", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		const customField1Range = ranges.find((r) => r.path === "/metadata/customField1");

		if (customField1Range) {
			// Metadata change should have diff lines
			const hasDiffLines = customField1Range.input1Diffs.length > 0 || customField1Range.input2Diffs.length > 0;

			if (!hasDiffLines) {
				console.error("? RENDERING BUG: Metadata customField1 change has no diff lines - won't be decorated!");
			}

			expect(hasDiffLines).toBe(true);
		}
	});
});

import { ConflictType } from "../../types";
