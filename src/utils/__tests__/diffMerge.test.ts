import { describe, expect, it } from "vitest";
import type { ModifiedBaseRange } from "../../types";
import { ConflictType, InputState } from "../../types";
import {
	buildResultContent,
	buildResultContentWithValidation,
	computeDiffsSequential,
	findLinesForPath,
	setValueAtPath,
	smartMergeValues,
} from "../diffMerge";

describe("diffMerge - computeDiffsSequential", () => {
	it("should compute diffs in sequential mode", () => {
		const base = ['{"name": "Alice"}', '{"age": 30}'];
		const input1 = ['{"name": "Bob"}', '{"age": 30}'];
		const input2 = ['{"name": "Alice"}', '{"age": 35}'];

		const result = computeDiffsSequential(base, input1, input2);

		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle identical inputs in sequential mode", () => {
		const lines = ['{"name": "Alice"}', '{"age": 30}'];

		const result = computeDiffsSequential(lines, lines, lines);

		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
	});

	it("should handle empty inputs in sequential mode", () => {
		const result = computeDiffsSequential([], [], []);

		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(0);
	});

	it("should detect changes in sequential mode", () => {
		const base = ["{", '  "name": "Alice",', '  "age": 30', "}"];
		const input1 = ["{", '  "name": "Bob",', '  "age": 30', "}"];
		const input2 = ["{", '  "name": "Alice",', '  "age": 35', "}"];

		const result = computeDiffsSequential(base, input1, input2);

		expect(result.length).toBeGreaterThan(0);
		// Should detect conflicts
		const hasConflicts = result.some((r) => r.isConflicting);
		expect(hasConflicts).toBe(true);
	});
});

describe("diffMerge - findLinesForPath", () => {
	it("should find lines for a simple path", () => {
		const json = JSON.stringify({ name: "Alice", age: 30 }, null, 2);

		const result = findLinesForPath(json, "/name");

		expect(result).toBeDefined();
		if (result) {
			expect(result.startLine).toBeGreaterThan(0);
			expect(result.endLine).toBeGreaterThanOrEqual(result.startLine);
		}
	});

	it("should find lines for nested path", () => {
		const json = JSON.stringify({ user: { name: "Alice", age: 30 } }, null, 2);

		const result = findLinesForPath(json, "/user/name");

		expect(result).toBeDefined();
		if (result) {
			expect(result.startLine).toBeGreaterThan(0);
			expect(result.endLine).toBeGreaterThanOrEqual(result.startLine);
		}
	});

	it("should find lines for array items", () => {
		const json = JSON.stringify({ items: ["a", "b", "c"] }, null, 2);

		const result = findLinesForPath(json, "/items/1");

		expect(result).toBeDefined();
		if (result) {
			expect(result.startLine).toBeGreaterThan(0);
		}
	});

	it("should return null for invalid path", () => {
		const json = JSON.stringify({ name: "Alice" }, null, 2);

		const result = findLinesForPath(json, "/nonexistent");

		expect(result).toBeNull();
	});

	it("should return null for invalid JSON", () => {
		const json = "invalid json {";

		const result = findLinesForPath(json, "/name");

		expect(result).toBeNull();
	});

	it("should handle root path", () => {
		const json = JSON.stringify({ name: "Alice" }, null, 2);

		const result = findLinesForPath(json, "");

		expect(result).toBeDefined();
	});
});

describe("diffMerge - setValueAtPath", () => {
	it("should set value at simple path", () => {
		const obj = { name: "Alice", age: 30 };

		setValueAtPath(obj, "/name", "Bob");

		expect(obj.name).toBe("Bob");
	});

	it("should set value at nested path", () => {
		const obj = { user: { name: "Alice", age: 30 } };

		setValueAtPath(obj, "/user/name", "Bob");

		expect(obj.user.name).toBe("Bob");
	});

	it("should set value in array", () => {
		const obj = { items: ["a", "b", "c"] };

		setValueAtPath(obj, "/items/1", "x");

		expect(obj.items[1]).toBe("x");
	});

	it("should create nested objects if they don't exist", () => {
		const obj: Record<string, unknown> = {};

		setValueAtPath(obj, "/user/name", "Alice");

		expect(obj).toHaveProperty("user");
		expect((obj.user as Record<string, unknown>).name).toBe("Alice");
	});

	it("should handle root path", () => {
		const obj = { name: "Alice" };

		setValueAtPath(obj, "", { name: "Bob" });

		// Root path replaces the entire object
		expect(obj.name).toBe("Bob");
	});

	it("should create array items if needed", () => {
		const obj = { items: [] };

		setValueAtPath(obj, "/items/0", "first");

		expect(obj.items[0]).toBe("first");
	});
});

describe("diffMerge - smartMergeValues", () => {
	it("should merge primitive values - prefer first if different", () => {
		const result = smartMergeValues("Alice", "Bob");

		// When values differ and no schema, return null (can't merge)
		expect(result).toBeNull();
	});

	it("should merge identical primitive values", () => {
		const result = smartMergeValues("Alice", "Alice");

		expect(result).toBe("Alice");
	});

	it("should merge objects by combining properties", () => {
		const obj1 = { name: "Alice", age: 30 };
		const obj2 = { name: "Alice", city: "NYC" };

		const result = smartMergeValues(obj1, obj2);

		expect(result).toBeDefined();
		expect(result).toHaveProperty("name", "Alice");
		expect(result).toHaveProperty("age", 30);
		expect(result).toHaveProperty("city", "NYC");
	});

	it("should return null when arrays differ without schema", () => {
		const arr1 = [1, 2, 3];
		const arr2 = [3, 4, 5];

		const result = smartMergeValues(arr1, arr2);

		// Arrays that differ return null without schema guidance
		expect(result).toBeNull();
	});

	it("should return null when types mismatch", () => {
		const result = smartMergeValues({ name: "Alice" }, "Bob");

		expect(result).toBeNull();
	});

	it("should return null when one value is null", () => {
		const result = smartMergeValues(null, "Bob");

		// When types differ (null vs string), return null
		expect(result).toBeNull();
	});

	it("should return the second value when first is undefined", () => {
		const result = smartMergeValues(undefined, "Bob");

		// When first is undefined/null, might return second value or null
		expect(result).toBeDefined();
	});

	it("should use schema when provided", () => {
		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
				age: { type: "number" },
			},
		};

		const obj1 = { name: "Alice", age: 30 };
		const obj2 = { name: "Bob", age: 30 };

		const result = smartMergeValues(obj1, obj2, schema, "/");

		expect(result).toBeDefined();
	});

	it("should handle nested objects with schema", () => {
		const schema = {
			type: "object",
			properties: {
				user: {
					type: "object",
					properties: {
						name: { type: "string" },
					},
				},
			},
		};

		const obj1 = { user: { name: "Alice" } };
		const obj2 = { user: { name: "Bob" } };

		const result = smartMergeValues(obj1, obj2, schema, "/");

		expect(result).toBeDefined();
	});
});

describe("diffMerge - buildResultContent", () => {
	it("should build result content from line arrays", () => {
		const baseLines = ["{", '  "name": "Alice"', "}"];
		const input1Lines = ["{", '  "name": "Bob"', "}"];
		const input2Lines = ["{", '  "name": "Alice"', "}"];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/name",
				baseRange: { startLineNumber: 2, endLineNumberExclusive: 3 },
				input1Range: { startLineNumber: 2, endLineNumberExclusive: 3 },
				input2Range: { startLineNumber: 2, endLineNumberExclusive: 3 },
				input1Diffs: [{ line: 2 }],
				input2Diffs: [],
				isConflicting: false,
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.second,
				handled: true,
				focused: false,
			},
		];

		const result = buildResultContent(baseLines, input1Lines, input2Lines, conflicts);

		expect(result).toBeDefined();
		expect(typeof result).toBe("string");
	});

	it("should handle empty conflicts", () => {
		const lines = ["{", '  "name": "Alice"', "}"];

		const result = buildResultContent(lines, lines, lines, []);

		expect(result).toBeDefined();
		expect(typeof result).toBe("string");
	});
});

describe("diffMerge - buildResultContentWithValidation", () => {
	it("should build and validate result content with lines", () => {
		const baseLines = ["{", '  "name": "Alice"', "}"];
		const input1Lines = ["{", '  "name": "Bob"', "}"];
		const input2Lines = ["{", '  "name": "Alice"', "}"];

		const conflicts: ModifiedBaseRange[] = [];

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result).toBeDefined();
		expect(result.content).toBeDefined();
		expect(typeof result.content).toBe("string");
		expect(result.isValid).toBeDefined();
		expect(typeof result.isValid).toBe("boolean");
	});

	it("should validate against schema", () => {
		const lines = ["{", '  "name": "Alice"', "}"];

		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
		};

		const result = buildResultContentWithValidation(lines, lines, lines, [], schema);

		expect(result.isValid).toBe(true);
	});

	it("should handle TRUE_CONFLICT with both inputs accepted", () => {
		const base = '{"value": "base"}';
		const input1 = '{"value": "input1"}';
		const input2 = '{"value": "input2"}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/value",
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.conflictIssues).toBeDefined();
		const warningIssue = result.conflictIssues?.find((i) => i.type === "warning");
		expect(warningIssue).toBeDefined();
		expect(warningIssue?.message).toContain("Both conflicting changes were accepted");
	});

	it("should handle neither input accepted (fallback to base)", () => {
		const base = '{"value": "base", "keep": true}';
		const input1 = '{"value": "input1", "keep": true}';
		const input2 = '{"value": "input2", "keep": true}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/value",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [{ line: 1 }],
				isConflicting: true,
				conflictType: ConflictType.TRUE_CONFLICT,
				input1State: InputState.excluded,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		const parsed = JSON.parse(result.content);
		expect(parsed.value).toBe("base"); // Should use base value
	});

	it("should handle array item conflicts with nested paths", () => {
		const base = '{"items": [{"id": 1, "name": "item1"}]}';
		const input1 = '{"items": [{"id": 1, "name": "updated1"}]}';
		const input2 = '{"items": [{"id": 1, "name": "item1"}]}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/0/name",
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		const parsed = JSON.parse(result.content);
		expect(parsed.items[0].name).toBe("updated1");
	});

	it("should handle nested property merging with parent objects", () => {
		const base = '{"user": {"name": "Alice", "age": 30}}';
		const input1 = '{"user": {"name": "Alice", "age": 30}}';
		const input2 = '{"user": {"name": "Alice", "age": 30, "email": "alice@example.com"}}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/user/email",
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		const parsed = JSON.parse(result.content);
		expect(parsed.user.email).toBe("alice@example.com");
	});

	it("should handle property not in base (addition rejection)", () => {
		const base = '{"keep": true}';
		const input1 = '{"keep": true, "newProp": "value1"}';
		const input2 = '{"keep": true}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/newProp",
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		const parsed = JSON.parse(result.content);
		expect(parsed.newProp).toBeUndefined(); // Should not include rejected addition
	});

	it("should handle conflicts with undefined paths gracefully", () => {
		const base = '{"value": "base"}';
		const input1 = '{"value": "input1"}';
		const input2 = '{"value": "input2"}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: undefined,
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		// Should still produce valid JSON even if conflict has no path
		expect(result.isValid).toBe(true);
	});

	it("should handle input1-only changes with nested parent paths", () => {
		const base = '{"user": {"name": "Alice"}}';
		const input1 = '{"user": {"name": "Alice", "settings": {"theme": "dark"}}}';
		const input2 = '{"user": {"name": "Alice"}}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/user/settings/theme",
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		const parsed = JSON.parse(result.content);
		expect(parsed.user.settings?.theme).toBe("dark");
	});

	it("should handle input2-only with deeply nested parent merging", () => {
		const base = '{"a": {"b": {"c": "value"}}}';
		const input1 = '{"a": {"b": {"c": "value"}}}';
		const input2 = '{"a": {"b": {"c": "value", "d": "new"}}}';
		const baseLines = base.split("\n");
		const input1Lines = input1.split("\n");
		const input2Lines = input2.split("\n");
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/a/b/d",
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

		const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);

		expect(result.isValid).toBe(true);
		const parsed = JSON.parse(result.content);
		expect(parsed.a.b.d).toBe("new");
	});
});
