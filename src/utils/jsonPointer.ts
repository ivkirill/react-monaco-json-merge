import { escapePathComponent, unescapePathComponent } from "fast-json-patch";

export type JsonPointerSegment = string | number;

/**
 * Split an RFC 6902 JSON Pointer into decoded path segments.
 * `~1` → `/`, `~0` → `~`; numeric segments become array indices.
 */
export function parseJsonPointerSegments(path: string): JsonPointerSegment[] {
	if (!path || path === "/") {
		return [];
	}

	const withoutLeading = path.startsWith("/") ? path.slice(1) : path;
	if (withoutLeading === "") {
		return [];
	}

	return withoutLeading.split("/").map((rawSegment) => {
		const decoded = unescapePathComponent(rawSegment);
		const numericValue = Number.parseInt(decoded, 10);
		if (!Number.isNaN(numericValue) && String(numericValue) === decoded) {
			return numericValue;
		}
		return decoded;
	});
}

/** Build a JSON Pointer from decoded property path segments (re-escapes as needed). */
export function joinJsonPointer(decodedSegments: Array<string | number>): string {
	if (decodedSegments.length === 0) {
		return "/";
	}
	return `/${decodedSegments.map((segment) => escapePathComponent(String(segment))).join("/")}`;
}

/**
 * Non–JSON Pointer path syntax used by legacy callers (dots, brackets without RFC escape).
 */
export function usesLegacyPathSyntax(path: string): boolean {
	if (!path || path === "/") {
		return false;
	}
	if (!path.startsWith("/")) {
		return true;
	}
	// "/user.settings/theme" and "/items[0]/id" are not RFC pointers from fast-json-patch.
	return path.includes("[") || path.includes(".");
}

export function parseLegacyPathSegments(path: string): JsonPointerSegment[] {
	const normalizedPath = path.replace(/^\//, "").replace(/\[/g, ".").replace(/\]/g, "").split(/[./#]/).filter(Boolean);

	return normalizedPath.map((key) => {
		const index = Number.parseInt(key, 10);
		if (!Number.isNaN(index) && String(index) === key) {
			return index;
		}
		return key;
	});
}
