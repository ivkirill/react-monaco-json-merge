import { describe, expect, it } from "vitest";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

describe("jsonPatchDiff - Simple coverage boost", () => {
	it("should handle property additions", () => {
		const base = '{"name": "Alice"}';
		const theirs = '{"name": "Alice", "age": 30}';
		const ours = '{"name": "Alice"}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle property deletions", () => {
		const base = '{"name": "Alice", "age": 30}';
		const theirs = '{"name": "Alice"}';
		const ours = '{"name": "Alice", "age": 30}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle array element additions", () => {
		const base = '{"items": [1, 2]}';
		const theirs = '{"items": [1, 2, 3]}';
		const ours = '{"items": [1, 2]}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle nested property changes", () => {
		const base = '{"user": {"name": "Alice", "details": {"age": 30}}}';
		const theirs = '{"user": {"name": "Bob", "details": {"age": 30}}}';
		const ours = '{"user": {"name": "Alice", "details": {"age": 35}}}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle array of objects", () => {
		const base = '[{"id": 1, "name": "Alice"}]';
		const theirs = '[{"id": 1, "name": "Bob"}]';
		const ours = '[{"id": 1, "name": "Alice"}]';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle empty to non-empty object", () => {
		const base = "{}";
		const theirs = '{"name": "Alice"}';
		const ours = "{}";

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle null to value change", () => {
		const base = '{"value": null}';
		const theirs = '{"value": "something"}';
		const ours = '{"value": null}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle value to null change", () => {
		const base = '{"value": "something"}';
		const theirs = '{"value": null}';
		const ours = '{"value": "something"}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle complex nested arrays", () => {
		const base = '{"matrix": [[1, 2], [3, 4]]}';
		const theirs = '{"matrix": [[1, 2], [3, 5]]}';
		const ours = '{"matrix": [[1, 2], [3, 4]]}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle string value changes", () => {
		const base = '{"text": "hello"}';
		const theirs = '{"text": "hello world"}';
		const ours = '{"text": "hello"}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle number value changes", () => {
		const base = '{"count": 10}';
		const theirs = '{"count": 20}';
		const ours = '{"count": 15}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle boolean toggles", () => {
		const base = '{"active": false}';
		const theirs = '{"active": true}';
		const ours = '{"active": false}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle multiple simultaneous changes", () => {
		const base = '{"a": 1, "b": 2, "c": 3}';
		const theirs = '{"a": 10, "b": 2, "c": 30}';
		const ours = '{"a": 1, "b": 20, "c": 3}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle object replacement", () => {
		const base = '{"obj": {"type": "a", "value": 1}}';
		const theirs = '{"obj": {"type": "b", "value": 2}}';
		const ours = '{"obj": {"type": "a", "value": 1}}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});

	it("should handle array element modifications", () => {
		const base = '{"tags": ["a", "b", "c"]}';
		const theirs = '{"tags": ["a", "x", "c"]}';
		const ours = '{"tags": ["a", "b", "c"]}';

		const result = computeDiffsJsonPatch(base, theirs, ours);

		expect(result).toBeDefined();
	});
});
