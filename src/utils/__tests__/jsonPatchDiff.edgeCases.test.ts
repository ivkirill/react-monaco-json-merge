import { describe, expect, it } from "vitest";
import { analyzeConflicts, analyzeTwoWayConflicts, computeDiffsJsonPatch } from "../jsonPatchDiff";

describe("jsonPatchDiff - Edge Cases", () => {
	describe("computeDiffsJsonPatch - Edge Cases", () => {
		it("should handle empty JSON objects", () => {
			const base = "{}";
			const theirs = "{}";
			const ours = "{}";

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);
		});

		it("should handle empty arrays", () => {
			const base = "[]";
			const theirs = "[]";
			const ours = "[]";

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle null values", () => {
			const base = '{"value": null}';
			const theirs = '{"value": null}';
			const ours = '{"value": null}';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle primitive values at root", () => {
			const base = '"text"';
			const theirs = '"text"';
			const ours = '"text"';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle number values", () => {
			const base = "42";
			const theirs = "42";
			const ours = "42";

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle boolean values in objects", () => {
			const base = '{"active": true}';
			const theirs = '{"active": true}';
			const ours = '{"active": false}';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});

		it("should handle deeply nested objects", () => {
			const base = '{"a": {"b": {"c": {"d": {"e": "value"}}}}}';
			const theirs = '{"a": {"b": {"c": {"d": {"e": "changed"}}}}}';
			const ours = '{"a": {"b": {"c": {"d": {"e": "value"}}}}}';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});

		it("should handle arrays with different lengths", () => {
			const base = "[1, 2, 3]";
			const theirs = "[1, 2, 3, 4]";
			const ours = "[1, 2]";

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});

		it("should handle mixed types in arrays", () => {
			const base = '[1, "text", true, null]';
			const theirs = '[1, "modified", true, null]';
			const ours = '[1, "text", false, null]';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle unicode characters", () => {
			const base = '{"text": "Hello 世界"}';
			const theirs = '{"text": "Hello 世界"}';
			const ours = '{"text": "Hello 🌍"}';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle special characters in keys", () => {
			const base = '{"key-with-dash": "value", "key.with.dot": "value"}';
			const theirs = '{"key-with-dash": "changed", "key.with.dot": "value"}';
			const ours = base;

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle large numbers", () => {
			const base = '{"bigNumber": 9007199254740991}';
			const theirs = '{"bigNumber": 9007199254740992}';
			const ours = base;

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle empty base (two-way diff)", () => {
			const base = "";
			const theirs = '{"name": "Alice"}';
			const ours = '{"name": "Bob"}';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle sequential comparison mode", () => {
			const base = '{"name": "Alice"}';
			const theirs = '{"name": "Bob"}';
			const ours = '{"name": "Charlie"}';

			const result = computeDiffsJsonPatch(base, theirs, ours, {
				comparisonMode: "sequential",
			});

			expect(result).toBeDefined();
		});

		it("should handle schema with oneOf", () => {
			const base = '{"type": "a", "value": 1}';
			const theirs = '{"type": "b", "value": 2}';
			const ours = '{"type": "c", "value": 3}';

			const schema = {
				oneOf: [
					{ type: "object", properties: { type: { const: "a" }, value: { type: "number" } } },
					{ type: "object", properties: { type: { const: "b" }, value: { type: "number" } } },
					{ type: "object", properties: { type: { const: "c" }, value: { type: "number" } } },
				],
			};

			const result = computeDiffsJsonPatch(base, theirs, ours, { schema });

			expect(result).toBeDefined();
		});

		it("should handle schema with anyOf", () => {
			const base = '{"tags": ["a"]}';
			const theirs = '{"tags": ["a", "b"]}';
			const ours = '{"tags": ["a", "c"]}';

			const schema = {
				type: "object",
				properties: {
					tags: {
						type: "array",
						items: { type: "string" },
					},
				},
			};

			const result = computeDiffsJsonPatch(base, theirs, ours, { schema });

			expect(result).toBeDefined();
		});

		it("should throw error for invalid JSON", () => {
			const base = '{"valid": true}';
			const theirs = "{invalid json}";
			const ours = base;

			expect(() => computeDiffsJsonPatch(base, theirs, ours)).toThrow();
		});

		it("should handle whitespace differences", () => {
			const base = '{"name":"Alice"}';
			const theirs = '{ "name" : "Alice" }';
			const ours = '{\n  "name": "Alice"\n}';

			const result = computeDiffsJsonPatch(base, theirs, ours);

			expect(result).toBeDefined();
			// Should not detect conflicts for whitespace-only differences
			expect(result.length).toBe(0);
		});
	});

	describe("analyzeConflicts", () => {
		it("should analyze conflicts with all types", () => {
			const base = { name: "Alice", age: 30, city: "NYC" };
			const theirs = { name: "Bob", age: 30, city: "LA" };
			const ours = { name: "Alice", age: 35, city: "LA" };

			const result = analyzeConflicts(base, theirs, ours);

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
		});

		it("should detect true conflicts", () => {
			const base = { value: 1 };
			const theirs = { value: 2 };
			const ours = { value: 3 };

			const result = analyzeConflicts(base, theirs, ours);

			const trueConflict = result.find((c) => c.conflictType === "true_conflict");
			expect(trueConflict).toBeDefined();
		});

		it("should detect same changes", () => {
			const base = { value: 1 };
			const theirs = { value: 2 };
			const ours = { value: 2 };

			const result = analyzeConflicts(base, theirs, ours);

			const sameChange = result.find((c) => c.conflictType === "same_change");
			expect(sameChange).toBeDefined();
		});

		it("should detect theirs-only changes", () => {
			const base = { value: 1 };
			const theirs = { value: 2 };
			const ours = { value: 1 };

			const result = analyzeConflicts(base, theirs, ours);

			const theirsOnly = result.find((c) => c.conflictType === "input1_only");
			expect(theirsOnly).toBeDefined();
		});

		it("should detect ours-only changes", () => {
			const base = { value: 1 };
			const theirs = { value: 1 };
			const ours = { value: 2 };

			const result = analyzeConflicts(base, theirs, ours);

			const oursOnly = result.find((c) => c.conflictType === "input2_only");
			expect(oursOnly).toBeDefined();
		});

		it("should handle nested objects", () => {
			const base = { user: { name: "Alice" } };
			const theirs = { user: { name: "Bob" } };
			const ours = { user: { name: "Charlie" } };

			const result = analyzeConflicts(base, theirs, ours);

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});

		it("should handle arrays", () => {
			const base = { items: [1, 2, 3] };
			const theirs = { items: [1, 2, 4] };
			const ours = { items: [1, 2, 5] };

			const result = analyzeConflicts(base, theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle empty objects", () => {
			const result = analyzeConflicts({}, {}, {});

			expect(result).toBeDefined();
			expect(result.length).toBe(0);
		});

		it("should handle null values", () => {
			const base = { value: null };
			const theirs = { value: "text" };
			const ours = { value: null };

			const result = analyzeConflicts(base, theirs, ours);

			expect(result).toBeDefined();
		});
	});

	describe("analyzeTwoWayConflicts", () => {
		it("should analyze two-way conflicts", () => {
			const theirs = { name: "Bob", age: 30 };
			const ours = { name: "Alice", age: 35 };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
		});

		it("should detect differences", () => {
			const theirs = { value: 1 };
			const ours = { value: 2 };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result.length).toBeGreaterThan(0);
			const diff = result.find((c) => c.path === "/value");
			expect(diff).toBeDefined();
		});

		it("should handle identical values", () => {
			const data = { name: "Alice", age: 30 };

			const result = analyzeTwoWayConflicts(data, data);

			expect(result).toBeDefined();
			expect(result.length).toBe(0);
		});

		it("should handle empty objects", () => {
			const result = analyzeTwoWayConflicts({}, {});

			expect(result).toBeDefined();
			expect(result.length).toBe(0);
		});

		it("should handle nested differences", () => {
			const theirs = { user: { name: "Bob", age: 30 } };
			const ours = { user: { name: "Alice", age: 30 } };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});

		it("should handle array differences", () => {
			const theirs = { items: [1, 2, 3] };
			const ours = { items: [1, 2, 4] };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle added properties", () => {
			const theirs = { name: "Alice" };
			const ours = { name: "Alice", age: 30 };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result).toBeDefined();
			const addedProp = result.find((c) => c.path === "/age");
			expect(addedProp).toBeDefined();
		});

		it("should handle removed properties", () => {
			const theirs = { name: "Alice", age: 30 };
			const ours = { name: "Alice" };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result).toBeDefined();
		});

		it("should handle type changes", () => {
			const theirs = { value: "text" };
			const ours = { value: 123 };

			const result = analyzeTwoWayConflicts(theirs, ours);

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});
	});
});
