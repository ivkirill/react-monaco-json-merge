import isEqual from "fast-deep-equal";
import sortKeys from "sort-keys";

/**
 * Get value at a path in an object
 * Supports JSON Pointer format: "/path/to/value" or "/array/0/item"
 */
export const getValueAtPath = <T = unknown>(obj: Record<string, unknown> | undefined, path: string): T | undefined => {
	if (!obj) return undefined;

	// Normalize path to array of keys
	const normalizedPath = path
		.replace(/^\//, "") // remove leading slash
		.replace(/\[/g, ".") // convert [0] to .0
		.replace(/\]/g, "") // remove ]
		.split(/[./#]/) // split by dot, slash, or hash
		.filter(Boolean); // remove empty strings

	let current: unknown = obj;

	for (const key of normalizedPath) {
		if (!current || typeof current !== "object") {
			return undefined;
		}

		// Handle arrays with numeric indices
		if (Array.isArray(current)) {
			const index = Number.parseInt(key, 10);
			if (Number.isNaN(index) || index < 0 || index >= current.length) {
				return undefined;
			}
			current = current[index];
		}
		// Handle objects
		else if (key in current) {
			current = (current as Record<string, unknown>)[key];
		}
		// Property doesn't exist
		else {
			return undefined;
		}
	}
	return current as T;
};

export { isEqual, sortKeys };
