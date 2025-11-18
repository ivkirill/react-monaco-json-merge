import { describe, expect, it } from "vitest";
import { ConflictType } from "../../types";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

describe("2-Way Mode Highlighting", () => {
	describe("Deleted Lines (INPUT1_ONLY)", () => {
		it("should highlight deleted properties in 2-way mode", () => {
			const input1 = JSON.stringify(
				{
					user: {
						name: "Alice",
						email: "alice@example.com",
						language: "en",
					},
				},
				null,
				2,
			);

			const input2 = JSON.stringify(
				{
					user: {
						name: "Alice",
						email: "alice@example.com",
					},
				},
				null,
				2,
			);

			const base = ""; // 2-way mode: no base

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// The conflict is at the /user object level because a property changed
			const userConflict = ranges.find((r) => r.path === "/user");

			expect(userConflict).toBeDefined();
			expect(userConflict?.conflictType).toBe(ConflictType.TRUE_CONFLICT);

			// CRITICAL: input1Diffs should NOT be empty for deleted lines
			expect(userConflict?.input1Diffs).toBeDefined();
			expect(userConflict?.input1Diffs.length).toBeGreaterThan(0);
		});

		it("should highlight deleted array items in 2-way mode", () => {
			const input1 = JSON.stringify(
				{
					items: ["apple", "banana", "cherry"],
				},
				null,
				2,
			);

			const input2 = JSON.stringify(
				{
					items: ["apple", "cherry"],
				},
				null,
				2,
			);

			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// Array deletions may be detected as TRUE_CONFLICT at the item level
			// The important thing is that input1Diffs is populated
			const itemConflict = ranges.find((r) => r.path?.includes("/items"));

			expect(itemConflict).toBeDefined();

			// CRITICAL: input1Diffs should NOT be empty
			expect(itemConflict?.input1Diffs).toBeDefined();
			expect(itemConflict?.input1Diffs.length).toBeGreaterThan(0);
		});

		it("should highlight deleted nested objects in 2-way mode", () => {
			const input1 = JSON.stringify(
				{
					config: {
						theme: "dark",
						notifications: {
							email: true,
							sms: false,
						},
					},
				},
				null,
				2,
			);

			const input2 = JSON.stringify(
				{
					config: {
						theme: "dark",
					},
				},
				null,
				2,
			);

			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// The conflict is at /config level because a property was deleted
			const configConflict = ranges.find((r) => r.path === "/config");

			expect(configConflict).toBeDefined();
			expect(configConflict?.conflictType).toBe(ConflictType.TRUE_CONFLICT);

			// CRITICAL: input1Diffs should NOT be empty
			expect(configConflict?.input1Diffs).toBeDefined();
			expect(configConflict?.input1Diffs.length).toBeGreaterThan(0);
		});
	});

	describe("Added Lines (INPUT2_ONLY)", () => {
		it("should highlight added properties in 2-way mode", () => {
			const input1 = JSON.stringify(
				{
					user: {
						name: "Alice",
					},
				},
				null,
				2,
			);

			const input2 = JSON.stringify(
				{
					user: {
						name: "Alice",
						email: "alice@example.com",
					},
				},
				null,
				2,
			);

			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// The conflict is at /user level because properties differ
			const userConflict = ranges.find((r) => r.path === "/user");

			expect(userConflict).toBeDefined();
			expect(userConflict?.conflictType).toBe(ConflictType.TRUE_CONFLICT);

			// At least input2 should have diffs (it has the new property)
			expect(userConflict?.input2Diffs).toBeDefined();
			expect(userConflict?.input2Diffs.length).toBeGreaterThan(0);
		});
	});

	describe("Modified Lines (TRUE_CONFLICT)", () => {
		it("should highlight modified properties in 2-way mode", () => {
			const input1 = JSON.stringify(
				{
					status: "active",
				},
				null,
				2,
			);

			const input2 = JSON.stringify(
				{
					status: "inactive",
				},
				null,
				2,
			);

			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			const statusConflict = ranges.find((r) => r.path === "/status");

			expect(statusConflict).toBeDefined();
			expect(statusConflict?.conflictType).toBe(ConflictType.TRUE_CONFLICT);

			// Both input1Diffs and input2Diffs should be populated
			expect(statusConflict?.input1Diffs).toBeDefined();
			expect(statusConflict?.input1Diffs.length).toBeGreaterThan(0);
			expect(statusConflict?.input2Diffs).toBeDefined();
			expect(statusConflict?.input2Diffs.length).toBeGreaterThan(0);
		});
	});

	describe("Patch Filtering in 2-Way Mode", () => {
		it("should populate input1Diffs for removed properties", () => {
			const input1 = JSON.stringify({ a: 1, b: 2, c: 3 }, null, 2);
			const input2 = JSON.stringify({ a: 1, c: 3 }, null, 2);
			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// Find any INPUT1_ONLY conflict (property exists in input1 but not input2)
			const input1OnlyConflicts = ranges.filter((r) => r.conflictType === ConflictType.INPUT1_ONLY);

			expect(input1OnlyConflicts.length).toBeGreaterThan(0);

			// For INPUT1_ONLY conflicts, input1Diffs should be populated
			for (const conflict of input1OnlyConflicts) {
				expect(conflict.input1Diffs.length).toBeGreaterThan(0);
			}
		});

		it("should populate input2Diffs for added properties", () => {
			const input1 = JSON.stringify({ a: 1, c: 3 }, null, 2);
			const input2 = JSON.stringify({ a: 1, b: 2, c: 3 }, null, 2);
			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// Find any INPUT2_ONLY conflict (property exists in input2 but not input1)
			const input2OnlyConflicts = ranges.filter((r) => r.conflictType === ConflictType.INPUT2_ONLY);

			expect(input2OnlyConflicts.length).toBeGreaterThan(0);

			// For INPUT2_ONLY conflicts, input2Diffs should be populated
			for (const conflict of input2OnlyConflicts) {
				expect(conflict.input2Diffs.length).toBeGreaterThan(0);
			}
		});

		it("should populate both diffs for modified properties", () => {
			const input1 = JSON.stringify({ status: "active" }, null, 2);
			const input2 = JSON.stringify({ status: "inactive" }, null, 2);
			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			const statusConflict = ranges.find((r) => r.path === "/status");

			expect(statusConflict).toBeDefined();
			expect(statusConflict?.conflictType).toBe(ConflictType.TRUE_CONFLICT);

			// Both input1Diffs and input2Diffs should be populated for conflicts
			expect(statusConflict?.input1Diffs.length).toBeGreaterThan(0);
			expect(statusConflict?.input2Diffs.length).toBeGreaterThan(0);
		});
	});

	describe("Decoration Application in 2-Way Mode", () => {
		it("should apply red highlighting to deleted lines", () => {
			const input1 = JSON.stringify({ lang: "en", theme: "dark" }, null, 2);
			const input2 = JSON.stringify({ theme: "dark" }, null, 2);
			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			const langConflict = ranges.find((r) => r.path === "/lang");

			expect(langConflict).toBeDefined();

			// Verify input states
			expect(langConflict?.input1State).toBe(1); // Should be checked (input1 has it)
			expect(langConflict?.input2State).toBe(0); // Should be unchecked (input2 doesn't have it)

			// Verify line ranges are valid
			expect(langConflict?.input1Range.startLineNumber).toBeGreaterThan(0);
			expect(langConflict?.input1Range.endLineNumberExclusive).toBeGreaterThan(langConflict?.input1Range.startLineNumber);
		});

		it("should apply green highlighting to added lines", () => {
			const input1 = JSON.stringify({ theme: "dark" }, null, 2);
			const input2 = JSON.stringify({ lang: "en", theme: "dark" }, null, 2);
			const base = ""; // 2-way mode

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			const langConflict = ranges.find((r) => r.path === "/lang");

			expect(langConflict).toBeDefined();

			// Verify input states
			expect(langConflict?.input1State).toBe(0); // Should be unchecked (input1 doesn't have it)
			expect(langConflict?.input2State).toBe(1); // Should be checked (input2 has it)

			// Verify line ranges are valid
			expect(langConflict?.input2Range.startLineNumber).toBeGreaterThan(0);
			expect(langConflict?.input2Range.endLineNumberExclusive).toBeGreaterThan(langConflict?.input2Range.startLineNumber);
		});
	});

	describe("Edge Cases in 2-Way Mode", () => {
		it("should handle empty objects correctly", () => {
			const input1 = JSON.stringify({ config: {} }, null, 2);
			const input2 = JSON.stringify({}, null, 2);
			const base = "";

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			const configConflict = ranges.find((r) => r.path === "/config");
			expect(configConflict).toBeDefined();
			expect(configConflict?.conflictType).toBe(ConflictType.INPUT1_ONLY);
		});

		it("should handle empty arrays correctly", () => {
			const input1 = JSON.stringify({ items: [] }, null, 2);
			const input2 = JSON.stringify({}, null, 2);
			const base = "";

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			const itemsConflict = ranges.find((r) => r.path === "/items");
			expect(itemsConflict).toBeDefined();
			expect(itemsConflict?.conflictType).toBe(ConflictType.INPUT1_ONLY);
		});

		it("should handle multiple deletions correctly", () => {
			const input1 = JSON.stringify({ a: 1, b: 2, c: 3, d: 4 }, null, 2);
			const input2 = JSON.stringify({ a: 1, c: 3 }, null, 2);
			const base = "";

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// Should have conflicts for both 'b' and 'd'
			const deletedConflicts = ranges.filter((r) => r.conflictType === ConflictType.INPUT1_ONLY);
			expect(deletedConflicts.length).toBeGreaterThanOrEqual(2);

			// Each should have input1Diffs populated
			for (const conflict of deletedConflicts) {
				expect(conflict.input1Diffs.length).toBeGreaterThan(0);
			}
		});
	});

	describe("Comparison with 3-Way Mode", () => {
		it("should behave differently in 2-way vs 3-way mode for deletions", () => {
			const input1 = JSON.stringify({ a: 1, b: 2 }, null, 2);
			const input2 = JSON.stringify({ a: 1 }, null, 2);

			// 2-way mode
			const twoWayRanges = computeDiffsJsonPatch("", input1, input2);
			const twoWayConflict = twoWayRanges.find((r) => r.path === "/b");

			// 3-way mode (base has the property)
			const base3way = JSON.stringify({ a: 1, b: 2 }, null, 2);
			const threeWayRanges = computeDiffsJsonPatch(base3way, input1, input2);
			const threeWayConflict = threeWayRanges.find((r) => r.path === "/b");

			// In 2-way mode: INPUT1_ONLY (exists in input1, not in input2)
			expect(twoWayConflict?.conflictType).toBe(ConflictType.INPUT1_ONLY);
			expect(twoWayConflict?.input1Diffs.length).toBeGreaterThan(0);

			// In 3-way mode: INPUT2_ONLY (input2 deleted it)
			expect(threeWayConflict?.conflictType).toBe(ConflictType.INPUT2_ONLY);
		});

		it("should handle SAME_CHANGE correctly in 2-way mode", () => {
			const input1 = JSON.stringify({ status: "active" }, null, 2);
			const input2 = JSON.stringify({ status: "active" }, null, 2);
			const base = "";

			const ranges = computeDiffsJsonPatch(base, input1, input2);

			// Should have no conflicts (both are identical)
			expect(ranges.length).toBe(0);
		});
	});
});
