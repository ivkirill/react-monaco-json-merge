import isEqual from "fast-deep-equal";
import sortKeys from "sort-keys";

import { getChild, parseJsonPointer } from "./jsonPointer";

/** Legacy dot/bracket syntax still accepted by getValueAtPath: "user.name", "items[1].type" */
const parseLegacySegments = (path: string): string[] =>
	path.replace(/^\//, "").replace(/\[/g, ".").replace(/\]/g, "").split(/[./#]/).filter(Boolean);

const resolveSegments = (root: unknown, segments: readonly string[]): unknown =>
	segments.reduce<unknown>((current, segment) => getChild(current, segment), root);

/** Paths written in legacy dot/bracket style; they never mean a valid RFC 6901 pointer on their own */
const LEGACY_SYNTAX_PATTERN = /[.[\]]/;

/**
 * Get value at a path in an object.
 * RFC 6901 is authoritative. Only when a pointer misses and the path uses legacy dot/bracket
 * syntax ("/user.settings/theme", "items[1].type") is the legacy form tried.
 */
export const getValueAtPath = <T = unknown>(obj: Record<string, unknown> | undefined, path: string): T | undefined => {
	if (!obj) return undefined;

	const pointerSegments = parseJsonPointer(path);
	if (pointerSegments !== null) {
		const pointerValue = resolveSegments(obj, pointerSegments);
		if (pointerValue !== undefined || !LEGACY_SYNTAX_PATTERN.test(path)) {
			return pointerValue as T | undefined;
		}
	}

	return resolveSegments(obj, parseLegacySegments(path)) as T | undefined;
};

export { isEqual, sortKeys };
