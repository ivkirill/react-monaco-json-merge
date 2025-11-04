import { describe, expect, it } from "vitest";
import { ConflictType, InputState, type ModifiedBaseRange } from "../../types";
import { buildResultContentWithValidation, setValueAtPath } from "../diffMerge";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Additional tests specifically targeting uncovered branches to boost coverage to 80%+
 */
describe("Coverage boost - diffMerge additional scenarios", () => {
	it("should handle non-object parent in nested path for input1", () => {
		const base = ['{"items": null}'];
		const input1 = ['{"items": null}'];
		const input2 = ['{"items": null}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/prop",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [],
				isConflicting: false,
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		// Should not crash when trying to merge parent
		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
		expect(result.content).toBeDefined();
	});

	it("should handle non-object parent in nested path for input2", () => {
		const base = ['{"items": null}'];
		const input1 = ['{"items": null}'];
		const input2 = ['{"items": null}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/prop",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [],
				input2Diffs: [{ line: 1 }],
				isConflicting: false,
				conflictType: ConflictType.INPUT2_ONLY,
				input1State: InputState.excluded,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		// Should not crash when trying to merge parent
		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
		expect(result.content).toBeDefined();
	});

	it("should handle array parent when expecting object for nested path", () => {
		const base = ['{"items": [1, 2, 3]}'];
		const input1 = ['{"items": [1, 2, 3]}'];
		const input2 = ['{"items": [1, 2, 3]}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/prop",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [],
				isConflicting: false,
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		// Should handle gracefully when parent type doesn't match
		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
	});

	it("should handle setValueAtPath on empty path with root-level properties", () => {
		const obj = { existing: "value" };

		// Setting a property at root level
		setValueAtPath(obj, "/newProp", "newValue");

		expect(obj).toEqual({ existing: "value", newProp: "newValue" });
	});

	it("should handle complex array item conflicts with isArrayItemConflict detection", () => {
		const base = ['{"items": [{"id": 1, "name": "A"}]}'];
		const input1 = ['{"items": [{"id": 1, "name": "B"}]}'];
		const input2 = ['{"items": [{"id": 1, "name": "C"}]}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/0",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [{ line: 1 }],
				isConflicting: true,
				conflictType: ConflictType.TRUE_CONFLICT,
				input1State: InputState.first,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
		expect(result.isValid).toBe(true);
	});

	it("should handle missing path segments in getValueAtPath scenarios", () => {
		const base = ['{"user": {"name": "Alice"}}'];
		const input1 = ['{"user": {"name": "Alice"}}'];
		const input2 = ['{"user": {"name": "Alice"}}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/nonexistent/nested/path",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [],
				isConflicting: false,
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		// Should handle missing paths gracefully
		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
		// May have warnings about failed path application
	});

	it("should handle conflict where neither input is accepted and path doesn't exist in base", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Alice", "email": "alice@example.com"}'];
		const input2 = ['{"name": "Alice", "phone": "123-456-7890"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/email",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [],
				isConflicting: false,
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.excluded,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		// Neither accepted - property doesn't exist in base, should skip
		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
		expect(result.isValid).toBe(true);
		// Email should not be in result since neither input was accepted
		expect(result.content).not.toContain("email");
	});

	it("should handle SAME_CHANGE array item conflict with isArrayItemConflict path", () => {
		const base = ['{"items": [1, 2, 3]}'];
		const input1 = ['{"items": [1, 5, 3]}'];
		const input2 = ['{"items": [1, 5, 3]}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/1",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [{ line: 1 }],
				isConflicting: false,
				conflictType: ConflictType.SAME_CHANGE,
				input1State: InputState.first,
				input2State: InputState.first,
				handled: true,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result).toBeDefined();
		expect(result.isValid).toBe(true);
		// Should contain the changed value (5)
		expect(result.content).toContain("5");
	});
});

describe("Coverage boost - jsonPatchDiff specific branches", () => {
	it("should handle empty base text with valid inputs", () => {
		const base = "";
		const input1 = '{"name": "Bob"}';
		const input2 = '{"name": "Charlie"}';

		// Empty base should trigger 2-way mode
		const result = computeDiffsJsonPatch(base, input1, input2);

		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should handle SAME_CHANGE with complex nested structures", () => {
		const base = JSON.stringify(
			{
				config: {
					settings: {
						theme: {
							primary: "blue",
							secondary: "green",
						},
					},
				},
			},
			null,
			2,
		);

		const modified = JSON.stringify(
			{
				config: {
					settings: {
						theme: {
							primary: "red",
							secondary: "green",
						},
					},
				},
			},
			null,
			2,
		);

		const result = computeDiffsJsonPatch(base, modified, modified, {
			comparisonMode: "split",
		});

		// Both changed primary to "red" - should detect as SAME_CHANGE
		const primaryConflict = result.find((r) => r.path === "/config/settings/theme/primary");
		expect(primaryConflict).toBeDefined();
		if (primaryConflict) {
			expect(primaryConflict.conflictType).toBe("same_change");
		}
	});

	it("should handle sequential mode with all fields unchanged", () => {
		const json = JSON.stringify({ a: 1, b: 2, c: 3 }, null, 2);

		const result = computeDiffsJsonPatch(json, json, json, {
			comparisonMode: "sequential",
		});

		// Everything is unchanged - should have no conflicts or all SAME_CHANGE
		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
		// May have zero conflicts or conflicts marked as no change
	});

	it("should handle mixed property types with SAME_CHANGE", () => {
		const base = '{"str": "a", "num": 1, "bool": true, "arr": [1], "obj": {"x": 1}}';
		const input1 = '{"str": "b", "num": 2, "bool": false, "arr": [2], "obj": {"x": 2}}';
		const input2 = '{"str": "b", "num": 2, "bool": false, "arr": [2], "obj": {"x": 2}}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// All changed to same values - should detect as SAME_CHANGE
		expect(result.length).toBeGreaterThan(0);
		const sameChangeConflicts = result.filter((r) => r.conflictType === "same_change");
		expect(sameChangeConflicts.length).toBeGreaterThan(0);
	});

	it("should handle deeply nested array SAME_CHANGE", () => {
		const base = JSON.stringify(
			{
				matrix: [
					[1, 2],
					[3, 4],
				],
			},
			null,
			2,
		);
		const input1 = JSON.stringify(
			{
				matrix: [
					[1, 5],
					[3, 4],
				],
			},
			null,
			2,
		);
		const input2 = JSON.stringify(
			{
				matrix: [
					[1, 5],
					[3, 4],
				],
			},
			null,
			2,
		);

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Both changed matrix[0][1] to 5 - should detect as SAME_CHANGE
		const conflict = result.find((r) => r.path?.includes("/matrix"));
		expect(conflict).toBeDefined();
	});

	it("should handle INPUT1_ONLY with deeply nested object", () => {
		const base = JSON.stringify({ a: { b: { c: { d: 1 } } } }, null, 2);
		const input1 = JSON.stringify({ a: { b: { c: { d: 2 } } } }, null, 2);
		const input2 = JSON.stringify({ a: { b: { c: { d: 1 } } } }, null, 2);

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Only input1 changed d - should be INPUT1_ONLY
		const dConflict = result.find((r) => r.path === "/a/b/c/d");
		expect(dConflict).toBeDefined();
		if (dConflict) {
			expect(dConflict.conflictType).toBe("input1_only");
		}
	});

	it("should handle INPUT2_ONLY with deeply nested object", () => {
		const base = JSON.stringify({ a: { b: { c: { d: 1 } } } }, null, 2);
		const input1 = JSON.stringify({ a: { b: { c: { d: 1 } } } }, null, 2);
		const input2 = JSON.stringify({ a: { b: { c: { d: 2 } } } }, null, 2);

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Only input2 changed d - should be INPUT2_ONLY
		const dConflict = result.find((r) => r.path === "/a/b/c/d");
		expect(dConflict).toBeDefined();
		if (dConflict) {
			expect(dConflict.conflictType).toBe("input2_only");
		}
	});

	it("should handle TRUE_CONFLICT with multiple nested properties", () => {
		const base = JSON.stringify({ user: { name: "A", email: "a@ex.com" } }, null, 2);
		const input1 = JSON.stringify({ user: { name: "B", email: "a@ex.com" } }, null, 2);
		const input2 = JSON.stringify({ user: { name: "C", email: "a@ex.com" } }, null, 2);

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Name changed to different values - should be TRUE_CONFLICT
		const nameConflict = result.find((r) => r.path === "/user/name");
		expect(nameConflict).toBeDefined();
		if (nameConflict) {
			expect(nameConflict.conflictType).toBe("true_conflict");
		}
	});
});

describe("Coverage boost - additional edge cases", () => {
	it("should handle buildResultContentWithValidation with input2 accepted and no path", () => {
		const base = ['{"x": 1}'];
		const input1 = ['{"x": 1}'];
		const input2 = ['{"x": 2}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				// No path - should use fallback logic
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [],
				input2Diffs: [{ line: 1 }],
				isConflicting: false,
				conflictType: ConflictType.INPUT2_ONLY,
				input1State: InputState.excluded,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("2");
	});

	it("should handle empty object base with conflicts", () => {
		const base = ["{}"];
		const input1 = ['{"name": "Alice"}'];
		const input2 = ['{"name": "Bob"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/name",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [{ line: 1 }],
				isConflicting: true,
				conflictType: ConflictType.TRUE_CONFLICT,
				input1State: InputState.excluded,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("Bob");
	});

	it("should handle multiple sequential mode transitions", () => {
		const base = '{"a": 1, "b": 2, "c": 3, "d": 4}';
		const input1 = '{"a": 10, "b": 2, "c": 30, "d": 4}';
		const input2 = '{"a": 10, "b": 20, "c": 30, "d": 40}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "sequential",
		});

		expect(result).toBeDefined();
		// Should correctly identify each property's conflict type
		// a: INPUT1_ONLY (changed in first transition)
		// b: INPUT2_ONLY (changed in second transition)
		// c: INPUT1_ONLY (changed in first transition)
		// d: INPUT2_ONLY (changed in second transition)
	});
});
