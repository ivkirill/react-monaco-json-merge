import type { Node } from "jsonc-parser";

const ARRAY_INDEX_PATTERN = /^(0|[1-9]\d*)$/;
const INVALID_TILDE_PATTERN = /~(?![01])/;

/** RFC 6902 token for the position after the last array element (append) */
export const JSON_POINTER_APPEND_TOKEN = "-";

/**
 * Split an RFC 6901 JSON Pointer into decoded segments.
 * "" is the root; "/" is the single empty-string key. Segments stay strings: whether one is an
 * array index is decided by the container it addresses, so an object key "200" is never an index.
 * @returns Decoded segments, or null when the path is not a valid pointer
 */
export function parseJsonPointer(path: string): string[] | null {
	if (path === "") {
		return [];
	}
	if (!path.startsWith("/")) {
		return null;
	}

	const segments = path.slice(1).split("/");
	const decoded: string[] = [];
	for (const raw of segments) {
		if (INVALID_TILDE_PATTERN.test(raw)) {
			return null;
		}
		decoded.push(raw.replace(/~1/g, "/").replace(/~0/g, "~"));
	}
	return decoded;
}

/** Build an RFC 6901 pointer from decoded segments. Root is "". */
export function joinJsonPointer(segments: readonly string[]): string {
	return segments.map((segment) => `/${segment.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/** Pointer to the first segment of a path, used to group patches by top-level property. Root is "". */
export function firstSegmentPointer(path: string): string {
	return joinJsonPointer((parseJsonPointer(path) ?? []).slice(0, 1));
}

/** RFC 6901 array index: no sign, no leading zeros. Returns null for anything else. */
export function parseArrayIndex(segment: string): number | null {
	return ARRAY_INDEX_PATTERN.test(segment) ? Number(segment) : null;
}

/** Own enumerable property. JSON-parsed objects have only enumerable own keys; ES2020 lib lacks Object.hasOwn. */
export function hasOwnKey(container: object, key: string): boolean {
	return Object.prototype.propertyIsEnumerable.call(container, key);
}

/**
 * Own-property write. Plain assignment would call the inherited `__proto__` setter for a key
 * named "__proto__" coming from user JSON.
 */
export function defineOwnKey(container: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(container, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Read one child. Arrays need a canonical index; objects only expose their own keys. */
export function getChild(container: unknown, segment: string): unknown {
	if (Array.isArray(container)) {
		const index = parseArrayIndex(segment);
		return index !== null && index < container.length ? container[index] : undefined;
	}
	if (typeof container === "object" && container !== null && hasOwnKey(container, segment)) {
		return (container as Record<string, unknown>)[segment];
	}
	return undefined;
}

/**
 * Locate the parse-tree node for decoded segments.
 * Written against the jsonc-parser tree directly, so no segment is coerced to a number.
 */
export function findNodeByPointer(root: Node, segments: readonly string[]): Node | undefined {
	let node: Node | undefined = root;
	for (const segment of segments) {
		if (node?.type === "array") {
			const index = parseArrayIndex(segment);
			node = index === null ? undefined : node.children?.[index];
		} else if (node?.type === "object") {
			node = findPropertyValueNode(node, segment);
		} else {
			return undefined;
		}
	}
	return node;
}

function findPropertyValueNode(objectNode: Node, key: string): Node | undefined {
	// Last occurrence wins, matching JSON.parse for duplicate keys
	let found: Node | undefined;
	for (const property of objectNode.children ?? []) {
		if (property.children?.[0]?.value === key) {
			found = property.children[1];
		}
	}
	return found;
}
