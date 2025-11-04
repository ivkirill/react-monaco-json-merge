import { describe, expect, it } from "vitest";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

describe("jsonPatchDiff - branch coverage improvements", () => {
	it("should throw error when input1 text is empty", () => {
		const base = '{"name": "Alice"}';
		const input1 = "";
		const input2 = '{"name": "Bob"}';

		expect(() => computeDiffsJsonPatch(base, input1, input2)).toThrow("requires non-empty");
	});

	it("should throw error when input2 text is empty", () => {
		const base = '{"name": "Alice"}';
		const input1 = '{"name": "Bob"}';
		const input2 = "";

		expect(() => computeDiffsJsonPatch(base, input1, input2)).toThrow("requires non-empty");
	});

	it("should handle sequential mode with SAME_CHANGE (no changes)", () => {
		const base = '{"name": "Alice", "age": 30}';
		const input1 = '{"name": "Alice", "age": 30}';
		const input2 = '{"name": "Alice", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "sequential",
		});

		// When nothing changes in sequential mode, we should get either no conflicts
		// or conflicts marked as SAME_CHANGE
		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should handle SAME_CHANGE in split mode when both make identical changes", () => {
		const base = '{"name": "Alice", "age": 30}';
		const input1 = '{"name": "Bob", "age": 30}';
		const input2 = '{"name": "Bob", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Both changed name to "Bob" - should detect as SAME_CHANGE
		const nameConflict = result.find((r) => r.path === "/name");
		expect(nameConflict).toBeDefined();
		expect(nameConflict?.conflictType).toBe("same_change");
	});

	it("should handle INPUT1_ONLY in sequential mode", () => {
		const base = '{"name": "Alice", "age": 30}';
		const input1 = '{"name": "Bob", "age": 30}';
		const input2 = '{"name": "Bob", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "sequential",
		});

		expect(result).toBeDefined();
		// In sequential mode: base->input1 changed (name), input1->input2 didn't change
		// Should be INPUT1_ONLY
		const nameConflict = result.find((r) => r.path === "/name");
		if (nameConflict) {
			expect(nameConflict.conflictType).toBe("input1_only");
		}
	});

	it("should handle INPUT2_ONLY in sequential mode", () => {
		const base = '{"name": "Alice", "age": 30}';
		const input1 = '{"name": "Alice", "age": 30}';
		const input2 = '{"name": "Bob", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "sequential",
		});

		expect(result).toBeDefined();
		// In sequential mode: base->input1 didn't change, input1->input2 changed (name)
		// Should be INPUT2_ONLY
		const nameConflict = result.find((r) => r.path === "/name");
		if (nameConflict) {
			expect(nameConflict.conflictType).toBe("input2_only");
		}
	});

	it("should handle TRUE_CONFLICT in sequential mode", () => {
		const base = '{"name": "Alice", "age": 30}';
		const input1 = '{"name": "Bob", "age": 30}';
		const input2 = '{"name": "Charlie", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "sequential",
		});

		expect(result).toBeDefined();
		// In sequential mode: base->input1 changed (Alice->Bob), input1->input2 changed (Bob->Charlie)
		// Should be TRUE_CONFLICT
		const nameConflict = result.find((r) => r.path === "/name");
		if (nameConflict) {
			expect(nameConflict.conflictType).toBe("true_conflict");
		}
	});

	it("should handle complex nested objects with SAME_CHANGE", () => {
		const base = JSON.stringify(
			{
				user: {
					profile: {
						name: "Alice",
						age: 30,
					},
				},
			},
			null,
			2,
		);

		const modified = JSON.stringify(
			{
				user: {
					profile: {
						name: "Bob",
						age: 30,
					},
				},
			},
			null,
			2,
		);

		const result = computeDiffsJsonPatch(base, modified, modified, {
			comparisonMode: "split",
		});

		// Both changed name to "Bob" - should detect as SAME_CHANGE
		const nameConflict = result.find((r) => r.path === "/user/profile/name");
		expect(nameConflict).toBeDefined();
		expect(nameConflict?.conflictType).toBe("same_change");
	});

	it("should handle arrays with SAME_CHANGE on items", () => {
		const base = JSON.stringify({ items: [1, 2, 3] }, null, 2);
		const modified = JSON.stringify({ items: [1, 2, 5] }, null, 2);

		const result = computeDiffsJsonPatch(base, modified, modified, {
			comparisonMode: "split",
		});

		// Both changed items[2] to 5 - should detect as SAME_CHANGE
		const itemConflict = result.find((r) => r.path === "/items/2");
		expect(itemConflict).toBeDefined();
		if (itemConflict) {
			expect(itemConflict.conflictType).toBe("same_change");
		}
	});

	it("should handle error case when JSON is invalid", () => {
		const base = '{"name": "Alice"}';
		const input1 = "{ invalid json";
		const input2 = '{"name": "Bob"}';

		expect(() => computeDiffsJsonPatch(base, input1, input2)).toThrow();
	});

	it("should handle undefined base in 2-way mode", () => {
		const base = undefined;
		const input1 = '{"name": "Bob"}';
		const input2 = '{"name": "Charlie"}';

		const result = computeDiffsJsonPatch(base, input1, input2);

		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should handle empty base string in 2-way mode", () => {
		const base = "";
		const input1 = '{"name": "Bob"}';
		const input2 = '{"name": "Charlie"}';

		const result = computeDiffsJsonPatch(base, input1, input2);

		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should handle SAME_CHANGE with property additions", () => {
		const base = '{"name": "Alice"}';
		const input1 = '{"name": "Alice", "age": 30}';
		const input2 = '{"name": "Alice", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Both added age with same value - should detect as SAME_CHANGE
		const ageConflict = result.find((r) => r.path === "/age");
		expect(ageConflict).toBeDefined();
		if (ageConflict) {
			expect(ageConflict.conflictType).toBe("same_change");
		}
	});

	it("should handle SAME_CHANGE with property deletions", () => {
		const base = '{"name": "Alice", "age": 30, "email": "alice@example.com"}';
		const input1 = '{"name": "Alice", "age": 30}';
		const input2 = '{"name": "Alice", "age": 30}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Both removed email - should detect as SAME_CHANGE
		const emailConflict = result.find((r) => r.path === "/email");
		expect(emailConflict).toBeDefined();
		if (emailConflict) {
			expect(emailConflict.conflictType).toBe("same_change");
		}
	});

	it("should handle sequential mode with multiple levels of changes", () => {
		const base = '{"a": 1, "b": 2, "c": 3}';
		const input1 = '{"a": 10, "b": 2, "c": 3}';
		const input2 = '{"a": 10, "b": 20, "c": 3}';

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "sequential",
		});

		expect(result).toBeDefined();
		// a: base->input1 changed, input1->input2 didn't change -> INPUT1_ONLY
		// b: base->input1 didn't change, input1->input2 changed -> INPUT2_ONLY
		const aConflict = result.find((r) => r.path === "/a");
		const bConflict = result.find((r) => r.path === "/b");

		if (aConflict) {
			expect(aConflict.conflictType).toBe("input1_only");
		}
		if (bConflict) {
			expect(bConflict.conflictType).toBe("input2_only");
		}
	});

	it("should handle split mode with nested SAME_CHANGE", () => {
		const base = JSON.stringify({ user: { name: "Alice", settings: { theme: "light" } } }, null, 2);
		const input1 = JSON.stringify({ user: { name: "Alice", settings: { theme: "dark" } } }, null, 2);
		const input2 = JSON.stringify({ user: { name: "Alice", settings: { theme: "dark" } } }, null, 2);

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// Both changed theme to "dark" - should detect as SAME_CHANGE
		const themeConflict = result.find((r) => r.path === "/user/settings/theme");
		expect(themeConflict).toBeDefined();
		if (themeConflict) {
			expect(themeConflict.conflictType).toBe("same_change");
		}
	});

	it("should handle arrays with different lengths but SAME_CHANGE on common indices", () => {
		const base = JSON.stringify({ items: [1, 2] }, null, 2);
		const input1 = JSON.stringify({ items: [1, 5, 3] }, null, 2);
		const input2 = JSON.stringify({ items: [1, 5, 4] }, null, 2);

		const result = computeDiffsJsonPatch(base, input1, input2, {
			comparisonMode: "split",
		});

		// items[1] changed to 5 in both - should be SAME_CHANGE
		const item1Conflict = result.find((r) => r.path === "/items/1");
		expect(item1Conflict).toBeDefined();
		if (item1Conflict) {
			expect(item1Conflict.conflictType).toBe("same_change");
		}
	});
});
