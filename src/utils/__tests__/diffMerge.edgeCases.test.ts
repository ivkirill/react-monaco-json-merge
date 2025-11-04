import { describe, expect, it } from "vitest";
import { ConflictType, InputState, type ModifiedBaseRange } from "../../types";
import {
	buildResultContentWithValidation,
	computeLineConflictType,
	findLinesForPath,
	setValueAtPath,
	smartMergeValues,
} from "../diffMerge";

describe("diffMerge - setValueAtPath edge cases", () => {
	it("should handle root path assignment with valid objects", () => {
		const obj = { a: 1, b: 2 };
		const value = { c: 3, d: 4 };

		setValueAtPath(obj, "/", value);

		// Object.assign merges properties, so we expect all properties
		expect(obj).toEqual({ a: 1, b: 2, c: 3, d: 4 });
	});

	it("should throw error when assigning non-object to root", () => {
		const obj = { a: 1 };
		const value = "string";

		expect(() => setValueAtPath(obj, "/", value)).toThrow("Cannot assign root value");
	});

	it("should throw error when assigning array to root object", () => {
		const obj = { a: 1 };
		const value = [1, 2, 3];

		expect(() => setValueAtPath(obj, "/", value)).toThrow("Cannot assign root value");
	});

	it("should throw error when path expects array but gets object", () => {
		const obj = { items: { not: "array" } };

		expect(() => setValueAtPath(obj, "/items/0", "value")).toThrow("expects array but got");
	});

	it("should throw error when path expects object but gets array", () => {
		const obj = { items: [1, 2, 3] };

		expect(() => setValueAtPath(obj, "/items/prop", "value")).toThrow("expects object but got");
	});

	it("should create nested objects if they don't exist", () => {
		const obj = {};

		setValueAtPath(obj, "/a/b/c", "value");

		expect(obj).toEqual({ a: { b: { c: "value" } } });
	});

	it("should handle array index paths", () => {
		const obj = { items: [1, 2, 3] };

		setValueAtPath(obj, "/items/1", 99);

		expect(obj).toEqual({ items: [1, 99, 3] });
	});

	it("should throw error when setting property on null", () => {
		const obj = { nested: null };

		expect(() => setValueAtPath(obj, "/nested/prop", "value")).toThrow("expects object but got");
	});

	it("should throw error when array index in middle of path is invalid", () => {
		const obj = { items: { not: "array" } };

		expect(() => setValueAtPath(obj, "/items/0/prop", "value")).toThrow("expects array but got");
	});
});

describe("diffMerge - smartMergeValues edge cases", () => {
	it("should return value when both values are identical", () => {
		const value1 = { a: 1, b: 2 };
		const value2 = { a: 1, b: 2 };

		const result = smartMergeValues(value1, value2);

		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("should merge objects with disjoint properties", () => {
		const value1 = { a: 1 };
		const value2 = { b: 2 };

		const result = smartMergeValues(value1, value2);

		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("should return null when schema disallows additional properties", () => {
		const value1 = { a: 1 };
		const value2 = { a: 1, b: 2 };
		const schema = {
			type: "object" as const,
			properties: {
				a: { type: "number" as const },
			},
			additionalProperties: false,
		};

		const result = smartMergeValues(value1, value2, schema, "/");

		expect(result).toBeNull();
	});

	it("should merge when additionalProperties is a schema object", () => {
		const value1 = { a: 1 };
		const value2 = { a: 1, b: "test" };
		const schema = {
			type: "object" as const,
			properties: {
				a: { type: "number" as const },
			},
			additionalProperties: {
				type: "string" as const,
			},
		};

		const result = smartMergeValues(value1, value2, schema, "/");

		expect(result).toEqual({ a: 1, b: "test" });
	});

	it("should recursively merge nested objects", () => {
		const value1 = { user: { name: "Alice", age: 30 } };
		const value2 = { user: { name: "Alice", email: "alice@example.com" } };

		const result = smartMergeValues(value1, value2);

		expect(result).toEqual({
			user: {
				name: "Alice",
				age: 30,
				email: "alice@example.com",
			},
		});
	});

	it("should return null when nested merge fails", () => {
		const value1 = { user: { name: "Alice" } };
		const value2 = { user: { name: "Bob" } };

		const result = smartMergeValues(value1, value2);

		expect(result).toBeNull();
	});

	it("should return null for arrays", () => {
		const value1 = [1, 2, 3];
		const value2 = [1, 2, 4];

		const result = smartMergeValues(value1, value2);

		expect(result).toBeNull();
	});

	it("should return null for different primitive types", () => {
		const value1 = "string";
		const value2 = 123;

		const result = smartMergeValues(value1, value2);

		expect(result).toBeNull();
	});

	it("should handle null values", () => {
		const value1 = { a: 1 };
		const value2 = null;

		const result = smartMergeValues(value1, value2);

		expect(result).toBeNull();
	});
});

describe("diffMerge - findLinesForPath edge cases", () => {
	it("should return null for invalid JSON", () => {
		const json = "{ invalid json";

		const result = findLinesForPath(json, "/name");

		expect(result).toBeNull();
	});

	it("should return null for empty tree", () => {
		const json = "";

		const result = findLinesForPath(json, "/name");

		expect(result).toBeNull();
	});

	it("should handle deeply nested paths", () => {
		const json = JSON.stringify({ a: { b: { c: { d: "value" } } } }, null, 2);

		const result = findLinesForPath(json, "/a/b/c/d");

		expect(result).toBeDefined();
		if (result) {
			expect(result.startLine).toBeGreaterThan(0);
		}
	});

	it("should handle array paths with multiple indices", () => {
		const json = JSON.stringify(
			{
				matrix: [
					[1, 2],
					[3, 4],
				],
			},
			null,
			2,
		);

		const result = findLinesForPath(json, "/matrix/1");

		expect(result).toBeDefined();
	});
});

describe("diffMerge - buildResultContentWithValidation edge cases", () => {
	it("should handle conflicts without paths", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Charlie"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
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
		expect(result.content).toBeDefined();
	});

	it("should handle INPUT2_ONLY without path", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Alice"}'];
		const input2 = ['{"name": "Bob"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
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
		expect(result.content).toContain("Bob");
	});

	it("should handle INPUT1_ONLY without path", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Alice"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
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

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("Bob");
	});

	it("should handle SAME_CHANGE without path", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Bob"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
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

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("Bob");
	});

	it("should handle invalid JSON input gracefully", () => {
		const base = ["{ invalid json"];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Charlie"}'];

		const conflicts: ModifiedBaseRange[] = [];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(false);
		expect(result.validationError).toBeDefined();
	});

	it("should start with input2 when base is empty", () => {
		const base = ["{}"];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Charlie", "age": 30}'];

		const conflicts: ModifiedBaseRange[] = [];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("Charlie");
		expect(result.content).toContain("30");
	});

	it("should handle array item conflicts with path matching", () => {
		const base = ['{"items": [{"id": 1, "name": "A"}]}'];
		const input1 = ['{"items": [{"id": 1, "name": "B"}]}'];
		const input2 = ['{"items": [{"id": 1, "name": "C"}]}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/items/0/name",
				baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
				input1Diffs: [{ line: 1 }],
				input2Diffs: [{ line: 1 }],
				isConflicting: true,
				conflictType: ConflictType.TRUE_CONFLICT,
				input1State: InputState.first,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("B");
	});

	it("should handle SAME_CHANGE with both inputs accepted", () => {
		const base = ['{"name": "Alice", "age": 30}'];
		const input1 = ['{"name": "Bob", "age": 30}'];
		const input2 = ['{"name": "Bob", "age": 30}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/name",
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

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("Bob");
	});

	it("should handle TRUE_CONFLICT with smart merge success", () => {
		const base = ['{"user": {"name": "Alice"}}'];
		const input1 = ['{"user": {"name": "Alice", "age": 30}}'];
		const input2 = ['{"user": {"name": "Alice", "email": "alice@example.com"}}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/user",
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

		expect(result.isValid).toBe(true);
		expect(result.warnings).toBeDefined();
		expect(result.warnings?.some((w) => w.includes("Smart-merged"))).toBe(true);
		expect(result.content).toContain("age");
		expect(result.content).toContain("email");
	});

	it("should handle TRUE_CONFLICT with smart merge failure", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Charlie"}'];

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
				input1State: InputState.first,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.warnings).toBeDefined();
		expect(result.warnings?.some((w) => w.includes("Merge failed"))).toBe(true);
		// Should default to input2 when merge fails
		expect(result.content).toContain("Charlie");
	});

	it("should handle nested properties with parent merging for input1", () => {
		const base = ['{"user": {"name": "Alice", "age": 30}}'];
		const input1 = ['{"user": {"name": "Bob", "age": 30, "email": "bob@example.com"}}'];
		const input2 = ['{"user": {"name": "Alice", "age": 30}}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/user/email",
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

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("bob@example.com");
	});

	it("should handle nested properties with parent merging for input2", () => {
		const base = ['{"user": {"name": "Alice", "age": 30}}'];
		const input1 = ['{"user": {"name": "Alice", "age": 30}}'];
		const input2 = ['{"user": {"name": "Bob", "age": 30, "email": "bob@example.com"}}'];

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

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("bob@example.com");
	});

	it("should handle neither input accepted (keep base value)", () => {
		const base = ['{"name": "Alice", "age": 30}'];
		const input1 = ['{"name": "Bob", "age": 30}'];
		const input2 = ['{"name": "Charlie", "age": 30}'];

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
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.content).toContain("Alice");
	});

	it("should add conflict issues for TRUE_CONFLICT with both inputs accepted", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Charlie"}'];

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
				input1State: InputState.first,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		expect(result.isValid).toBe(true);
		expect(result.conflictIssues).toBeDefined();
		expect(result.conflictIssues?.some((issue) => issue.type === "warning")).toBe(true);
	});

	it("should handle value application errors gracefully", () => {
		const base = ['{"name": "Alice"}'];
		const input1 = ['{"name": "Bob"}'];
		const input2 = ['{"name": "Charlie"}'];

		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				path: "/invalid/nested/path/that/does/not/exist",
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

		const result = buildResultContentWithValidation(base, input1, input2, conflicts);

		// Should not crash, and the result should be defined
		expect(result).toBeDefined();
		// Warnings may or may not be present depending on error handling
		expect(result.content).toBeDefined();
	});
});

describe("diffMerge - computeLineConflictType", () => {
	it("should detect SAME_CHANGE when both changed to same value", () => {
		const result = computeLineConflictType("base", "changed", "changed");

		expect(result.conflictType).toBe(ConflictType.SAME_CHANGE);
		expect(result.input1Changed).toBe(true);
		expect(result.input2Changed).toBe(true);
	});

	it("should detect TRUE_CONFLICT when both changed to different values", () => {
		const result = computeLineConflictType("base", "input1", "input2");

		expect(result.conflictType).toBe(ConflictType.TRUE_CONFLICT);
		expect(result.input1Changed).toBe(true);
		expect(result.input2Changed).toBe(true);
	});

	it("should detect INPUT1_ONLY when only input1 changed", () => {
		const result = computeLineConflictType("base", "changed", "base");

		expect(result.conflictType).toBe(ConflictType.INPUT1_ONLY);
		expect(result.input1Changed).toBe(true);
		expect(result.input2Changed).toBe(false);
	});

	it("should detect INPUT2_ONLY when only input2 changed", () => {
		const result = computeLineConflictType("base", "base", "changed");

		expect(result.conflictType).toBe(ConflictType.INPUT2_ONLY);
		expect(result.input1Changed).toBe(false);
		expect(result.input2Changed).toBe(true);
	});

	it("should detect INPUT2_ONLY when neither changed", () => {
		const result = computeLineConflictType("same", "same", "same");

		expect(result.conflictType).toBe(ConflictType.INPUT2_ONLY);
		expect(result.input1Changed).toBe(false);
		expect(result.input2Changed).toBe(false);
	});
});
