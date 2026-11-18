import { describe, expect, it } from "vitest";
import { ConflictType } from "../../types";
import { getValueAtPath } from "../helpers";
import { computeDiffsJsonPatch, getNodeLines } from "../jsonPatchDiff";
import { joinJsonPointer, parseJsonPointerSegments } from "../jsonPointer";

describe("jsonPointer", () => {
	it("decodes ~1 to slash in property keys", () => {
		expect(parseJsonPointerSegments("/byPlatform/fb/set/~1name")).toEqual(["byPlatform", "fb", "set", "/name"]);
	});

	it("round-trips escaped segments via joinJsonPointer", () => {
		const pointer = joinJsonPointer(["byPlatform", "fb", "set", "/name"]);
		expect(pointer).toBe("/byPlatform/fb/set/~1name");
		expect(parseJsonPointerSegments(pointer)).toEqual(["byPlatform", "fb", "set", "/name"]);
	});
});

describe("getNodeLines with RFC-escaped keys (byPlatform)", () => {
	const document = {
		byPlatform: {
			fb: {
				set: {
					"/name": "[fb stand edit] [diff bp]",
				},
			},
		},
	};
	const text = JSON.stringify(document, null, 2);

	it("finds the line for /byPlatform/fb/set/~1name", () => {
		const lines = getNodeLines(text, "/byPlatform/fb/set/~1name");
		expect(lines).not.toEqual({ start: 1, end: 1 });
		expect(text.split("\n")[lines.start - 1]).toContain("/name");
	});

	it("getValueAtPath reads the value through escaped pointer", () => {
		const value = getValueAtPath(document, "/byPlatform/fb/set/~1name");
		expect(value).toBe("[fb stand edit] [diff bp]");
	});
});

describe("computeDiffsJsonPatch highlights byPlatform set keys", () => {
	const theirsObj = {
		byPlatform: { fb: { set: { "/name": "[fb stand edit]" } } },
	};
	const oursObj = {
		byPlatform: { fb: { set: { "/name": "[fb stand edit] [diff bp]" } } },
	};
	const theirs = JSON.stringify(theirsObj, null, 2);
	const ours = JSON.stringify(oursObj, null, 2);

	it("maps diff lines for escaped pointer paths", () => {
		const ranges = computeDiffsJsonPatch("", theirs, ours);
		expect(ranges.length).toBeGreaterThan(0);

		const withDiffLines = ranges.find((range) => range.input1Diffs.length > 0 || range.input2Diffs.length > 0);
		expect(withDiffLines).toBeDefined();
		expect(withDiffLines?.conflictType).toBe(ConflictType.TRUE_CONFLICT);
		expect(withDiffLines?.input1Range.startLineNumber).not.toBe(1);
		expect(withDiffLines?.input2Range.startLineNumber).not.toBe(1);
	});
});
