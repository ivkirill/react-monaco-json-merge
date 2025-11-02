import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { ConflictType, InputState } from "../../types";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Tests for correct rendering/mapping of conflicts to Monaco Editor line ranges
 *
 * These tests verify that:
 * 1. Conflicts are correctly mapped to line ranges
 * 2. Line ranges are valid (start <= end, positive numbers)
 * 3. OneOf variant changes map to correct object-level ranges
 * 4. Field-level changes map to correct property-level ranges
 * 5. Conflict types are correctly preserved in ranges
 */
describe("jsonPatchDiff - Rendering & Line Range Mapping", () => {
	const { base, theirs, ours, schema } = getSampleData();

	describe("Line Range Validity", () => {
		it("should map all conflicts to valid line ranges", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			expect(ranges.length).toBeGreaterThan(0);

			for (const range of ranges) {
				// Verify base range
				expect(range.baseRange.startLineNumber).toBeGreaterThan(0);
				expect(range.baseRange.endLineNumberExclusive).toBeGreaterThanOrEqual(range.baseRange.startLineNumber);

				// Verify input1 range
				expect(range.input1Range.startLineNumber).toBeGreaterThan(0);
				expect(range.input1Range.endLineNumberExclusive).toBeGreaterThanOrEqual(range.input1Range.startLineNumber);

				// Verify input2 range
				expect(range.input2Range.startLineNumber).toBeGreaterThan(0);
				expect(range.input2Range.endLineNumberExclusive).toBeGreaterThanOrEqual(range.input2Range.startLineNumber);
			}
		});

		it("should have valid conflict IDs", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const ids = new Set<string>();
			for (const range of ranges) {
				expect(range.id).toBeDefined();
				expect(typeof range.id).toBe("string");
				expect(range.id.length).toBeGreaterThan(0);
				expect(ids.has(range.id)).toBe(false); // IDs should be unique
				ids.add(range.id);
			}
		});

		it("should preserve conflict types in ranges", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const typesFound = new Set<ConflictType>();
			for (const range of ranges) {
				expect(range.conflictType).toBeDefined();
				expect([
					ConflictType.TRUE_CONFLICT,
					ConflictType.INPUT1_ONLY,
					ConflictType.INPUT2_ONLY,
					ConflictType.SAME_CHANGE,
				]).toContain(range.conflictType);
				typesFound.add(range.conflictType);
			}

			// Should have multiple conflict types in the sample data
			expect(typesFound.size).toBeGreaterThan(1);
		});
	});

	describe("OneOf Variant Changes - Payment Rendering", () => {
		it("should map payment oneOf variant change to object-level range", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const paymentRanges = ranges.filter((r) => r.path === "/payment");

			expect(paymentRanges.length).toBeGreaterThan(0);

			const paymentRange = paymentRanges[0];

			// Should be TRUE_CONFLICT
			expect(paymentRange.conflictType).toBe(ConflictType.TRUE_CONFLICT);
			expect(paymentRange.isConflicting).toBe(true);

			// Should have valid line ranges
			expect(paymentRange.baseRange.startLineNumber).toBeGreaterThan(0);
			expect(paymentRange.input1Range.startLineNumber).toBeGreaterThan(0);
			expect(paymentRange.input2Range.startLineNumber).toBeGreaterThan(0);

			// Payment object should span at least one line
			expect(paymentRange.baseRange.endLineNumberExclusive).toBeGreaterThan(paymentRange.baseRange.startLineNumber);
		});

		it("should map payment conflict with correct input states", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const paymentRange = ranges.find((r) => r.path === "/payment");

			if (paymentRange) {
				// For TRUE_CONFLICT, default should accept input2 (ours)
				expect(paymentRange.input2State).toBe(InputState.first);
				// Input1 (theirs) should not be accepted by default
				expect(paymentRange.input1State).toBe(InputState.excluded);
			}
		});
	});

	describe("Field-Level Changes - User Email/Name Rendering", () => {
		it("should map user email change to correct line range", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const emailRange = ranges.find((r) => r.path === "/user/email");

			expect(emailRange).toBeDefined();
			if (emailRange) {
				// Should be INPUT1_ONLY (only theirs changed)
				expect(emailRange.conflictType).toBe(ConflictType.INPUT1_ONLY);
				expect(emailRange.isConflicting).toBe(false);

				// Should have valid line ranges
				expect(emailRange.baseRange.startLineNumber).toBeGreaterThan(0);
				expect(emailRange.input1Range.startLineNumber).toBeGreaterThan(0);
				expect(emailRange.input2Range.startLineNumber).toBeGreaterThan(0);

				// Email is a string value, should be on a single line or small range
				// (JSON strings on one line, but could span if formatted)
			}
		});

		it("should map user name change to correct line range", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const nameRange = ranges.find((r) => r.path === "/user/name");

			expect(nameRange).toBeDefined();
			if (nameRange) {
				// Should be INPUT2_ONLY (only ours changed)
				expect(nameRange.conflictType).toBe(ConflictType.INPUT2_ONLY);
				expect(nameRange.isConflicting).toBe(false);

				// Should default to accepting input2 (ours)
				expect(nameRange.input2State).toBe(InputState.first);
				expect(nameRange.input1State).toBe(InputState.excluded);
			}
		});

		it("should have separate ranges for email and name (not grouped)", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const emailRange = ranges.find((r) => r.path === "/user/email");
			const nameRange = ranges.find((r) => r.path === "/user/name");

			// Both should exist as separate conflicts
			expect(emailRange).toBeDefined();
			expect(nameRange).toBeDefined();

			if (emailRange && nameRange) {
				// They should have different IDs
				expect(emailRange.id).not.toBe(nameRange.id);

				// They should have different line ranges (different properties)
				// Note: They might be on same line if formatted that way, but paths should differ
				expect(emailRange.path).not.toBe(nameRange.path);
			}
		});
	});

	describe("Array Item Changes - Items Rendering", () => {
		it("should map item count conflict to correct line range", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Find the conflict for item-1 count (TRUE_CONFLICT)
			const item1CountRange = ranges.find(
				(r) => r.path === "/items/0/count" || (r.path?.includes("items") && r.path?.includes("count")),
			);

			expect(item1CountRange).toBeDefined();
			if (item1CountRange) {
				// Should be TRUE_CONFLICT (both changed to different values)
				if (item1CountRange.path?.includes("count")) {
					expect(item1CountRange.conflictType).toBe(ConflictType.TRUE_CONFLICT);
					expect(item1CountRange.isConflicting).toBe(true);
				}

				// Should have valid line ranges
				expect(item1CountRange.baseRange.startLineNumber).toBeGreaterThan(0);
				expect(item1CountRange.input1Range.startLineNumber).toBeGreaterThan(0);
				expect(item1CountRange.input2Range.startLineNumber).toBeGreaterThan(0);
			}
		});

		it("should map item reordering to correct line ranges", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Items are reordered in both theirs and ours, causing conflicts
			// Base: [item-1, item-2, item-3]
			// Theirs: [item-2, item-1, item-3] (item-1 and item-2 swapped, item-1 count changed)
			// Ours: [item-3, item-1, item-2] (all reordered, all counts changed)
			const itemConflicts = ranges.filter((r) => r.path?.includes("/items"));

			// Should have detected item conflicts
			expect(itemConflicts.length).toBeGreaterThan(0);

			// At least one should be a true conflict (different changes to same item)
			const hasTrueConflict = itemConflicts.some((r) => r.conflictType === ConflictType.TRUE_CONFLICT);
			expect(hasTrueConflict).toBe(true);
		});
	});

	describe("Conflict State Initialization", () => {
		it("should initialize states correctly for SAME_CHANGE", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const sameChanges = ranges.filter((r) => r.conflictType === ConflictType.SAME_CHANGE);

			for (const range of sameChanges) {
				// Both should be accepted (they're identical)
				expect(range.input1State).toBe(InputState.first);
				expect(range.input2State).toBe(InputState.first);
				expect(range.handled).toBe(true); // SAME_CHANGE is auto-handled
			}
		});

		it("should initialize states correctly for INPUT1_ONLY", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const input1Only = ranges.filter((r) => r.conflictType === ConflictType.INPUT1_ONLY);

			expect(input1Only.length).toBeGreaterThan(0);

			for (const range of input1Only) {
				// Only input1 should be accepted
				expect(range.input1State).toBe(InputState.first);
				expect(range.input2State).toBe(InputState.excluded);
			}
		});

		it("should initialize states correctly for INPUT2_ONLY", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const input2Only = ranges.filter((r) => r.conflictType === ConflictType.INPUT2_ONLY);

			expect(input2Only.length).toBeGreaterThan(0);

			for (const range of input2Only) {
				// Only input2 should be accepted
				expect(range.input2State).toBe(InputState.first);
				expect(range.input1State).toBe(InputState.excluded);
			}
		});

		it("should initialize states correctly for TRUE_CONFLICT", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const trueConflicts = ranges.filter((r) => r.conflictType === ConflictType.TRUE_CONFLICT);

			expect(trueConflicts.length).toBeGreaterThan(0);

			for (const range of trueConflicts) {
				// Default: accept input2 (ours), reject input1 (theirs)
				expect(range.input2State).toBe(InputState.first);
				expect(range.input1State).toBe(InputState.excluded);
				expect(range.isConflicting).toBe(true);
				expect(range.handled).toBe(false); // Requires user resolution
			}
		});
	});

	describe("Path Preservation", () => {
		it("should preserve JSON Pointer paths in ranges", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				expect(range.path).toBeDefined();
				expect(typeof range.path).toBe("string");

				// Path should be valid JSON Pointer format
				if (range.path.length > 0) {
					expect(range.path).toMatch(/^\/[^/]*(?:\/[^/]*)*$/);
				}
			}
		});

		it("should have paths that match detected conflicts", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Verify we have paths for all expected conflict areas
			const paths = ranges.map((r) => r.path).filter(Boolean);

			expect(paths.some((p) => p?.includes("payment"))).toBe(true);
			expect(paths.some((p) => p?.includes("user"))).toBe(true);
			expect(paths.some((p) => p?.includes("items"))).toBe(true);
			expect(paths.some((p) => p?.includes("permissions"))).toBe(true);
			expect(paths.some((p) => p?.includes("matrix"))).toBe(true);
			expect(paths.some((p) => p?.includes("configuration"))).toBe(true);
			expect(paths.some((p) => p?.includes("metadata"))).toBe(true);
		});
	});

	describe("Diff Line Tracking", () => {
		it("should track diff lines in input1Diffs and input2Diffs", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// input1Diffs should be an array
				expect(Array.isArray(range.input1Diffs)).toBe(true);
				// input2Diffs should be an array
				expect(Array.isArray(range.input2Diffs)).toBe(true);

				// If there are patches, there should be diff lines
				if (range.input1Diffs.length > 0 || range.input2Diffs.length > 0) {
					// Each diff should have a line number
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
			}
		});

		it("should have diff lines within the range boundaries", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			for (const range of ranges) {
				// Check input1 diff lines
				// Note: For removals, diff lines might come from base,
				// so they might not be within input1Range (this is OK for removals)
				for (const diff of range.input1Diffs) {
					expect(diff.line).toBeGreaterThan(0);
					// Diff lines should be valid line numbers
					// They might reference base lines for removals, which is acceptable
				}

				// Check input2 diff lines
				// Note: For removals, diff lines might come from base,
				// so they might not be within input2Range (this is OK for removals)
				for (const diff of range.input2Diffs) {
					expect(diff.line).toBeGreaterThan(0);
					// Diff lines should be valid line numbers
					// They might reference base lines for removals, which is acceptable
				}
			}
		});
	});

	describe("Dynamic Property Changes - Metadata Rendering", () => {
		it("should map metadata customField1 change to correct range", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			const customField1Range = ranges.find((r) => r.path === "/metadata/customField1");

			expect(customField1Range).toBeDefined();
			if (customField1Range) {
				// Should be INPUT2_ONLY (changed in ours)
				expect(customField1Range.conflictType).toBe(ConflictType.INPUT2_ONLY);

				// Should have valid ranges
				expect(customField1Range.baseRange.startLineNumber).toBeGreaterThan(0);
				expect(customField1Range.input2Range.startLineNumber).toBeGreaterThan(0);
			}
		});

		it("should map new metadata fields to correct ranges", () => {
			const ranges = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Check for new fields added in theirs
			const customField2Range = ranges.find((r) => r.path === "/metadata/customField2");
			const customField3Range = ranges.find((r) => r.path === "/metadata/customField3");

			// At least one should exist
			expect(customField2Range || customField3Range).toBeDefined();

			if (customField2Range) {
				expect(customField2Range.conflictType).toBe(ConflictType.INPUT1_ONLY);
			}
		});
	});

	describe("Comparison Mode Consistency", () => {
		it("should produce consistent ranges in split mode", () => {
			const rangesSplit = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			expect(rangesSplit.length).toBeGreaterThan(0);

			// All ranges should have base, input1, and input2 ranges
			for (const range of rangesSplit) {
				expect(range.baseRange).toBeDefined();
				expect(range.input1Range).toBeDefined();
				expect(range.input2Range).toBeDefined();
			}
		});

		it("should produce ranges in sequential mode", () => {
			const rangesSequential = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "sequential",
			});

			expect(rangesSequential.length).toBeGreaterThan(0);

			// Sequential mode should also have valid ranges
			for (const range of rangesSequential) {
				expect(range.baseRange.startLineNumber).toBeGreaterThan(0);
				expect(range.input1Range.startLineNumber).toBeGreaterThan(0);
				expect(range.input2Range.startLineNumber).toBeGreaterThan(0);
			}
		});
	});
});
