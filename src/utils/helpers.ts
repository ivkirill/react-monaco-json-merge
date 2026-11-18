import isEqual from "fast-deep-equal";
import sortKeys from "sort-keys";

import { type JsonPointerSegment, parseJsonPointerSegments, parseLegacyPathSegments, usesLegacyPathSyntax } from "./jsonPointer";

/**
 * Get value at a path in an object
 * Supports JSON Pointer format: "/path/to/value" or "/array/0/item"
 */
export const getValueAtPath = <T = unknown>(obj: Record<string, unknown> | undefined, path: string): T | undefined => {
	if (!obj) return undefined;

	if (!path || path === "/") {
		return obj as T;
	}

	const normalizedPath: JsonPointerSegment[] = usesLegacyPathSyntax(path)
		? parseLegacyPathSegments(path)
		: parseJsonPointerSegments(path);

	let current: unknown = obj;

	for (const key of normalizedPath) {
		if (!current || typeof current !== "object") {
			return undefined;
		}

		if (typeof key === "number") {
			if (!Array.isArray(current) || key < 0 || key >= current.length) {
				return undefined;
			}
			current = current[key];
		} else if (key in current) {
			current = (current as Record<string, unknown>)[key];
		} else {
			return undefined;
		}
	}
	return current as T;
};

export { isEqual, sortKeys };
