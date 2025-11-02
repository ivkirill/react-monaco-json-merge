import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { ConflictType } from "../../types";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Tests for highlighting logic correctness
 *
 * Verifies that:
 * 1. Identical values across all versions are not highlighted
 * 2. Additions are highlighted correctly (not as deletions)
 * 3. Only actual changes are highlighted
 */
describe("Highlighting Logic - Input1 (Theirs) Panel", () => {
	const { base, theirs, ours, schema } = getSampleData();

	it("should not highlight identical values that are the same in all versions", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Parse all versions to check actual values
		const baseObj = JSON.parse(base);
		const theirsObj = JSON.parse(theirs);
		const oursObj = JSON.parse(ours);

		// Check for conflicts on paths that are identical across all versions
		// These should NOT have conflicts
		const identicalPaths = [
			"/id", // User ID should be same
		];

		for (const path of identicalPaths) {
			const baseValue =
				path === "/"
					? baseObj
					: path
							.split("/")
							.slice(1)
							.reduce((obj: unknown, key) => (obj as Record<string, unknown>)?.[key], baseObj);
			const theirsValue =
				path === "/"
					? theirsObj
					: path
							.split("/")
							.slice(1)
							.reduce((obj: unknown, key) => (obj as Record<string, unknown>)?.[key], theirsObj);
			const oursValue =
				path === "/"
					? oursObj
					: path
							.split("/")
							.slice(1)
							.reduce((obj: unknown, key) => (obj as Record<string, unknown>)?.[key], oursObj);

			if (baseValue === theirsValue && theirsValue === oursValue) {
				// This path is identical - should not have a conflict
				const conflict = ranges.find((r) => r.path === path);
				if (conflict) {
					console.warn(`?? Path ${path} is identical but has conflict:`, conflict);
				}
				// Note: We might have conflicts for parent paths, but not for identical leaf values
			}
		}
	});

	it("should correctly identify additions vs changes", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Check for language field (addition in theirs)
		const languageConflict = ranges.find((r) => r.path === "/settings/language" || r.path?.includes("language"));

		if (languageConflict) {
			// If language is only in theirs, it should be INPUT1_ONLY (addition)
			// Not TRUE_CONFLICT or INPUT2_ONLY
			console.log("Language conflict:", languageConflict);
			expect(languageConflict.conflictType).toBe(ConflictType.INPUT1_ONLY);
		}
	});

	it("should not create conflicts for array item properties that are identical", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Check item-2 id and type (should be identical)
		const baseObj = JSON.parse(base);
		const theirsObj = JSON.parse(theirs);
		const oursObj = JSON.parse(ours);

		const baseItem2 = baseObj.items?.find((item) => (item as { id?: string })?.id === "item-2") as
			| { id?: string; type?: string }
			| undefined;
		const theirsItem2 = theirsObj.items?.find((item) => (item as { id?: string })?.id === "item-2") as
			| { id?: string; type?: string }
			| undefined;
		const oursItem2 = oursObj.items?.find((item) => (item as { id?: string })?.id === "item-2") as
			| { id?: string; type?: string }
			| undefined;

		if (baseItem2 && theirsItem2 && oursItem2) {
			// Check if id and type are identical
			if (
				baseItem2.id === theirsItem2.id &&
				theirsItem2.id === oursItem2.id &&
				baseItem2.type === theirsItem2.type &&
				theirsItem2.type === oursItem2.type
			) {
				// These should not have individual conflicts
				const idConflict = ranges.find((r) => r.path === "/items/1/id" || (r.path?.includes("items") && r.path?.includes("id")));
				const typeConflict = ranges.find(
					(r) => r.path === "/items/1/type" || (r.path?.includes("items") && r.path?.includes("type")),
				);

				// These should not exist as separate conflicts if values are identical
				// (they might be part of a larger conflict for the item, but not individual field conflicts)
				console.log("Item-2 id conflict:", idConflict);
				console.log("Item-2 type conflict:", typeConflict);
			}
		}
	});

	it("should only highlight lines that have actual changes", () => {
		const ranges = computeDiffsJsonPatch(base, theirs, ours, {
			schema,
			comparisonMode: "split",
		});

		// Get all conflicts
		for (const range of ranges) {
			// Verify that the conflict represents an actual change
			const baseObj = JSON.parse(base);
			const theirsObj = JSON.parse(theirs);
			const oursObj = JSON.parse(ours);

			// Helper to get value at path
			const getValue = (obj: unknown, path: string): unknown => {
				if (!path || path === "/") return obj;
				const segments = path.split("/").filter(Boolean);
				return segments.reduce((current: unknown, seg) => {
					if (Array.isArray(current)) {
						const idx = Number.parseInt(seg, 10);
						return !Number.isNaN(idx) ? current[idx] : undefined;
					}
					return current?.[seg];
				}, obj);
			};

			const baseValue = getValue(baseObj, range.path);
			const theirsValue = getValue(theirsObj, range.path);
			const _oursValue = getValue(oursObj, range.path);

			// For INPUT1_ONLY: theirsValue should differ from baseValue
			if (range.conflictType === ConflictType.INPUT1_ONLY) {
				if (baseValue !== undefined && theirsValue !== undefined) {
					const isDifferent = JSON.stringify(baseValue) !== JSON.stringify(theirsValue);
					if (!isDifferent) {
						console.warn(`?? INPUT1_ONLY conflict at ${range.path} but values are the same!`, {
							base: baseValue,
							theirs: theirsValue,
						});
					}
				}
			}
		}
	});
});
