import { compare } from "fast-json-patch";
import { describe, expect, it } from "vitest";
import type { JSONSchema } from "../../types";
import { findLinesForPath, setValueAtPath } from "../diffMerge";
import { getValueAtPath } from "../helpers";
import { getNodeLines, getSchemaAtPath } from "../jsonPatchDiff";
import { joinJsonPointer, parseJsonPointer } from "../jsonPointer";

describe("parseJsonPointer / joinJsonPointer", () => {
	it("decodes ~1 and ~0 in that order", () => {
		expect(parseJsonPointer("/a~1b/c~0d/~01")).toEqual(["a/b", "c~d", "~1"]);
	});

	it("rejects invalid tilde escapes and paths without a leading slash", () => {
		expect(parseJsonPointer("/a~2")).toBeNull();
		expect(parseJsonPointer("/a~")).toBeNull();
		expect(parseJsonPointer("a/b")).toBeNull();
	});

	it('treats "" as root and "/" as the empty-string key', () => {
		expect(parseJsonPointer("")).toEqual([]);
		expect(parseJsonPointer("/")).toEqual([""]);
	});

	it("keeps numeric-looking segments as strings", () => {
		expect(parseJsonPointer("/items/0/200")).toEqual(["items", "0", "200"]);
	});

	it("round-trips through joinJsonPointer", () => {
		const segments = ["a/b", "c~d", "200"];
		expect(parseJsonPointer(joinJsonPointer(segments))).toEqual(segments);
	});
});

describe("getValueAtPath with RFC 6901 keys", () => {
	it("reads an object key that looks numeric", () => {
		const obj = { responses: { "200": { description: "ok" } } };
		expect(getValueAtPath(obj, "/responses/200")).toEqual({ description: "ok" });
	});

	it("reads a key containing a dot", () => {
		expect(getValueAtPath({ "a.b": { c: 1 } }, "/a.b/c")).toBe(1);
	});

	it("reads a key containing an escaped slash", () => {
		expect(getValueAtPath({ "a/b": 1 }, "/a~1b")).toBe(1);
	});

	it("does not expose array length or inherited properties", () => {
		expect(getValueAtPath({ items: [1, 2] }, "/items/length")).toBeUndefined();
		expect(getValueAtPath({}, "/constructor")).toBeUndefined();
	});

	it("rejects leading-zero array indices", () => {
		expect(getValueAtPath({ items: ["a", "b"] }, "/items/01")).toBeUndefined();
	});
});

describe("setValueAtPath with RFC 6901 keys", () => {
	it("updates an existing numeric object key", () => {
		const obj: Record<string, unknown> = { ids: { "123": 1 } };
		setValueAtPath(obj, "/ids/123", 2);
		expect(obj).toEqual({ ids: { "123": 2 } });
	});

	it("refuses to create a numeric key inside an object", () => {
		const obj: Record<string, unknown> = { ids: {} };
		expect(() => setValueAtPath(obj, "/ids/123", 2)).toThrow("expects array but got object");
	});

	it("rejects negative indices without touching the array", () => {
		const obj = { items: [1, 2] };
		expect(() => setValueAtPath(obj, "/items/-1", 9)).toThrow("expects object but got array");
		expect(obj.items).toEqual([1, 2]);
	});

	it("rejects an index past the end of the array", () => {
		const obj = { items: [1] };
		expect(() => setValueAtPath(obj, "/items/5", 9)).toThrow("out of bounds");
	});

	it("appends with the RFC 6902 '-' token", () => {
		const obj = { items: [1] };
		setValueAtPath(obj, "/items/-", 2);
		expect(obj.items).toEqual([1, 2]);
	});

	it("does not pollute the prototype through __proto__", () => {
		const obj: Record<string, unknown> = {};
		setValueAtPath(obj, "/__proto__/polluted", true);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("writes a key containing an escaped slash", () => {
		const obj: Record<string, unknown> = {};
		setValueAtPath(obj, "/a~1b", 1);
		expect(obj).toEqual({ "a/b": 1 });
	});
});

describe("line lookup with RFC 6901 keys", () => {
	const json = JSON.stringify({ paths: { "/users": { "200": { ok: true } } } }, null, 2);

	it("findLinesForPath finds an escaped key with a numeric child", () => {
		const lines = findLinesForPath(json, "/paths/~1users/200");
		expect(lines).not.toBeNull();
		const line = json.split("\n")[(lines?.startLine ?? 1) - 1];
		expect(line).toContain("{");
	});

	it("getNodeLines finds an object key that looks numeric", () => {
		const lines = getNodeLines(json, "/paths/~1users/200");
		expect(lines.start).toBeGreaterThan(1);
	});
});

describe("getSchemaAtPath with numeric property names", () => {
	const schema: JSONSchema = {
		type: "object",
		properties: {
			responses: {
				type: "object",
				properties: {
					"200": { type: "string" },
				},
			},
		},
	};

	it("resolves a declared property named like an index instead of falling into items", () => {
		expect(getSchemaAtPath(schema, "/responses/200")).toEqual({ type: "string" });
	});
});

describe("empty-string key end to end", () => {
	it("compare emits '/' for key '' and the value resolves back to that key", () => {
		const base = { "": 1, other: 0 };
		const ours = { "": 2, other: 0 };
		const [operation] = compare(base, ours);

		expect(operation?.path).toBe("/");
		expect(getValueAtPath(base, operation?.path ?? "")).toBe(1);
	});

	it("applying a '/' patch writes the key '' and leaves the root intact", () => {
		const target: Record<string, unknown> = { "": 1, other: 0 };
		setValueAtPath(target, "/", 2);
		expect(target).toEqual({ "": 2, other: 0 });
	});
});
