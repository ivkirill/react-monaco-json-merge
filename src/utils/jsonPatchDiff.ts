import { compare, type Operation as JsonPatchOperation } from "fast-json-patch";
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import type { JSONSchema } from "../types";
import { ConflictType, InputState, type ModifiedBaseRange } from "../types";
import { getValueAtPath, isEqual, sortKeys } from "./helpers";
import { chooseSubschemaSync, getSchemaVariants, getSubschemaKeyword, hasSchemaVariants } from "./schema";

/**
 * Represents a conflict analysis result for a JSON path
 */
export interface ConflictAnalysis {
	path: string; // JSON Pointer path
	baseValue: unknown;
	input1Value: unknown; // Theirs value
	input2Value: unknown; // Ours value
	conflictType: ConflictType;
	patches1?: JsonPatchOperation[]; // Optional: patches from base to input1
	patches2?: JsonPatchOperation[]; // Optional: patches from base to input2
}

/**
 * Format JSON with sorted keys (objects only, arrays unchanged)
 * @param json - JSON object to format
 * @returns Formatted JSON string with 2-space indentation
 */
export function formatJsonForComparison(json: unknown): string {
	// sortKeys only sorts object keys, arrays remain unchanged
	if (typeof json === "object" && json !== null && !Array.isArray(json)) {
		const sorted = sortKeys(json as Record<string, unknown>, { deep: true });
		return JSON.stringify(sorted, null, 2);
	}
	return JSON.stringify(json, null, 2);
}

/**
 * Determine conflict type based on semantic comparison of values
 * @param base - Base value
 * @param input1 - Input1 (theirs) value
 * @param input2 - Input2 (ours) value
 * @returns Conflict type
 */
export function determineConflictType(base: unknown, input1: unknown, input2: unknown): ConflictType {
	// Use fast-deep-equal for semantic comparison (already in toolbox)
	const input1Changed = !isEqual(base, input1);
	const input2Changed = !isEqual(base, input2);

	if (input1Changed && input2Changed) {
		// Both changed - are they semantically equal?
		if (isEqual(input1, input2)) {
			return ConflictType.SAME_CHANGE;
		}
		return ConflictType.TRUE_CONFLICT;
	}

	if (input1Changed) return ConflictType.INPUT1_ONLY;
	if (input2Changed) return ConflictType.INPUT2_ONLY;

	return ConflictType.SAME_CHANGE; // No change
}

/**
 * Get line numbers for a JSON node at a given path
 * @param text - Formatted JSON text
 * @param path - JSON Pointer path
 * @returns Start and end line numbers (1-indexed), or {1, 1} if not found
 */
export function getNodeLines(text: string, path: string): { start: number; end: number } {
	try {
		const root = parseTree(text);
		if (!root) {
			return { start: 1, end: 1 };
		}

		// Convert path segments to proper types (numbers for array indices, strings for object keys)
		const pathSegments = path
			.split("/")
			.filter(Boolean)
			.map((segment) => {
				// Check if segment is a numeric array index
				const numericValue = Number.parseInt(segment, 10);
				return !Number.isNaN(numericValue) && String(numericValue) === segment ? numericValue : segment;
			});

		const node = pathSegments.length === 0 ? root : findNodeAtLocation(root, pathSegments);

		if (!node) {
			return { start: 1, end: 1 };
		}

		const result = {
			start: getLineNumber(text, node.offset),
			end: getLineNumber(text, node.offset + node.length),
		};
		return result;
	} catch (_error) {
		return { start: 1, end: 1 };
	}
}

/**
 * Convert character offset to line number
 * @param text - Text content
 * @param offset - Character offset
 * @returns Line number (1-indexed)
 */
function getLineNumber(text: string, offset: number): number {
	return text.substring(0, offset).split("\n").length;
}

/**
 * Group JSON Patch operations by their root path
 * @param patches1 - Patches from base to input1
 * @param patches2 - Patches from base to input2
 * @returns Map of root paths to their patches
 */
function groupPatchesByRootPath(
	patches1: JsonPatchOperation[],
	patches2: JsonPatchOperation[],
): Map<string, { patches1: JsonPatchOperation[]; patches2: JsonPatchOperation[] }> {
	const pathGroups = new Map<string, { patches1: JsonPatchOperation[]; patches2: JsonPatchOperation[] }>();

	// Helper to get root path (first segment)
	const getRootPath = (path: string): string => {
		const segments = path.split("/").filter(Boolean);
		return segments.length > 0 ? `/${segments[0]}` : "/";
	};

	// Group patches1
	for (const patch of patches1) {
		const rootPath = getRootPath(patch.path);
		if (!pathGroups.has(rootPath)) {
			pathGroups.set(rootPath, { patches1: [], patches2: [] });
		}
		const group = pathGroups.get(rootPath);
		if (group) {
			group.patches1.push(patch);
		}
	}

	// Group patches2
	for (const patch of patches2) {
		const rootPath = getRootPath(patch.path);
		if (!pathGroups.has(rootPath)) {
			pathGroups.set(rootPath, { patches1: [], patches2: [] });
		}
		const group = pathGroups.get(rootPath);
		if (group) {
			group.patches2.push(patch);
		}
	}

	return pathGroups;
}

/**
 * Schema-aware patch grouping for 3-way merge
 * Groups patches by array item identity (using schema anchors) instead of just path
 */
function groupPatchesWithSchema(
	patches1: JsonPatchOperation[],
	patches2: JsonPatchOperation[],
	base: unknown,
	input1: unknown,
	input2: unknown,
	schema: JSONSchema,
): Map<string, { patches1: JsonPatchOperation[]; patches2: JsonPatchOperation[] }> {
	const pathGroups = new Map<string, { patches1: JsonPatchOperation[]; patches2: JsonPatchOperation[] }>();

	// Separate array patches from non-array patches
	const arrayPatchGroups1 = new Map<string, JsonPatchOperation[]>();
	const arrayPatchGroups2 = new Map<string, JsonPatchOperation[]>();
	const nonArrayPatches1: JsonPatchOperation[] = [];
	const nonArrayPatches2: JsonPatchOperation[] = [];

	// Group patches by array path
	for (const patch of patches1) {
		const arrayItemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*)\/(\d+)(?:\/|$)/);
		if (arrayItemMatch) {
			const arrayPath = arrayItemMatch[1];
			if (!arrayPatchGroups1.has(arrayPath)) {
				arrayPatchGroups1.set(arrayPath, []);
			}
			const group1 = arrayPatchGroups1.get(arrayPath);
			if (group1) {
				group1.push(patch);
			}
		} else {
			nonArrayPatches1.push(patch);
		}
	}

	for (const patch of patches2) {
		const arrayItemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*)\/(\d+)(?:\/|$)/);
		if (arrayItemMatch) {
			const arrayPath = arrayItemMatch[1];
			if (!arrayPatchGroups2.has(arrayPath)) {
				arrayPatchGroups2.set(arrayPath, []);
			}
			const group2 = arrayPatchGroups2.get(arrayPath);
			if (group2) {
				group2.push(patch);
			}
		} else {
			nonArrayPatches2.push(patch);
		}
	}

	// Get all unique array paths
	const allArrayPaths = new Set<string>([...arrayPatchGroups1.keys(), ...arrayPatchGroups2.keys()]);

	// Process each array with schema-aware matching
	for (const arrayPath of allArrayPaths) {
		const baseArray = getValueAtPath(base as Record<string, unknown>, arrayPath);
		const input1Array = getValueAtPath(input1 as Record<string, unknown>, arrayPath);
		const input2Array = getValueAtPath(input2 as Record<string, unknown>, arrayPath);

		if (!Array.isArray(baseArray) || !Array.isArray(input1Array) || !Array.isArray(input2Array)) {
			// Not arrays - fall back to index-based grouping
			const patches1 = arrayPatchGroups1.get(arrayPath) || [];
			const patches2 = arrayPatchGroups2.get(arrayPath) || [];
			for (const patch of patches1) {
				const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
				if (itemMatch) {
					const itemPath = itemMatch[1];
					if (!pathGroups.has(itemPath)) {
						pathGroups.set(itemPath, { patches1: [], patches2: [] });
					}
					const itemGroup1 = pathGroups.get(itemPath);
					if (itemGroup1) {
						itemGroup1.patches1.push(patch);
					}
				}
			}
			for (const patch of patches2) {
				const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
				if (itemMatch) {
					const itemPath = itemMatch[1];
					if (!pathGroups.has(itemPath)) {
						pathGroups.set(itemPath, { patches1: [], patches2: [] });
					}
					const itemGroup2 = pathGroups.get(itemPath);
					if (itemGroup2) {
						itemGroup2.patches2.push(patch);
					}
				}
			}
			continue;
		}

		// Get schema for array items
		const arraySchema = getSchemaAtPath(schema, arrayPath, base);
		const itemSchemaRaw = arraySchema?.items
			? Array.isArray(arraySchema.items) && arraySchema.items[0]
				? arraySchema.items[0]
				: !Array.isArray(arraySchema.items)
					? arraySchema.items
					: null
			: null;
		// Ensure itemSchema is a valid JSONSchema (not true)
		const itemSchema = itemSchemaRaw && typeof itemSchemaRaw === "object" ? itemSchemaRaw : null;

		if (itemSchema) {
			// Use 3-way schema matching
			const matches = matchArrayItemsById(baseArray, input1Array, input2Array, itemSchema);

			if (matches.size > 0) {
				// Create mappings from index to key
				const baseKeysByIndex = new Map<number, string | number>();
				const input1KeysByIndex = new Map<number, string | number>();
				const input2KeysByIndex = new Map<number, string | number>();

				for (const [key, indices] of matches.entries()) {
					if (indices.base !== undefined) baseKeysByIndex.set(indices.base, key);
					if (indices.input1 !== undefined) input1KeysByIndex.set(indices.input1, key);
					if (indices.input2 !== undefined) input2KeysByIndex.set(indices.input2, key);
				}

				// Group patches by matched item
				const patches1 = arrayPatchGroups1.get(arrayPath) || [];
				const patches2 = arrayPatchGroups2.get(arrayPath) || [];

				for (const patch of patches1) {
					const itemIndexMatch = patch.path.match(/^\/[^/]+(?:\/[^/]+)*\/(\d+)(?:\/|$)/);
					if (itemIndexMatch) {
						const index = Number.parseInt(itemIndexMatch[1], 10);
						const key = input1KeysByIndex.get(index);
						if (key !== undefined) {
							const groupKey = `${arrayPath}#${key}`;
							if (!pathGroups.has(groupKey)) {
								pathGroups.set(groupKey, { patches1: [], patches2: [] });
							}
							const groupKey1 = pathGroups.get(groupKey);
							if (groupKey1) {
								groupKey1.patches1.push(patch);
							}
						}
					}
				}

				for (const patch of patches2) {
					const itemIndexMatch = patch.path.match(/^\/[^/]+(?:\/[^/]+)*\/(\d+)(?:\/|$)/);
					if (itemIndexMatch) {
						const index = Number.parseInt(itemIndexMatch[1], 10);
						const key = input2KeysByIndex.get(index);
						if (key !== undefined) {
							const groupKey = `${arrayPath}#${key}`;
							if (!pathGroups.has(groupKey)) {
								pathGroups.set(groupKey, { patches1: [], patches2: [] });
							}
							const groupKey2 = pathGroups.get(groupKey);
							if (groupKey2) {
								groupKey2.patches2.push(patch);
							}
						}
					}
				}
				continue;
			}
		}

		// No schema or no matches - fall back to index-based grouping
		const patches1 = arrayPatchGroups1.get(arrayPath) || [];
		const patches2 = arrayPatchGroups2.get(arrayPath) || [];
		for (const patch of patches1) {
			const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
			if (itemMatch) {
				const itemPath = itemMatch[1];
				if (!pathGroups.has(itemPath)) {
					pathGroups.set(itemPath, { patches1: [], patches2: [] });
				}
				const groupItem1 = pathGroups.get(itemPath);
				if (groupItem1) {
					groupItem1.patches1.push(patch);
				}
			}
		}
		for (const patch of patches2) {
			const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
			if (itemMatch) {
				const itemPath = itemMatch[1];
				if (!pathGroups.has(itemPath)) {
					pathGroups.set(itemPath, { patches1: [], patches2: [] });
				}
				const groupItem2 = pathGroups.get(itemPath);
				if (groupItem2) {
					groupItem2.patches2.push(patch);
				}
			}
		}
	}

	// Helper: Check if a path is a child of a potential oneOf object
	const getOneOfObjectPath = (patchPath: string, schema?: JSONSchema): string | null => {
		if (!schema) return null;
		const segments = patchPath.split("/").filter(Boolean);
		if (segments.length < 2) return null; // Need at least object/property

		// Check if parent object (e.g., /payment for /payment/type) has oneOf schema
		const parentPath = `/${segments[0]}`;
		const parentSchema = getSchemaAtPath(schema, parentPath);
		if (parentSchema && hasSchemaVariants(parentSchema)) {
			return parentPath;
		}
		return null;
	};

	// Process non-array patches
	// Strategy:
	// 1. First, group patches that belong to oneOf objects together
	// 2. Then, group remaining patches by full path for individual field conflicts

	// First pass: Collect all patches
	const allNonArrayPatches1 = [...nonArrayPatches1];
	const allNonArrayPatches2 = [...nonArrayPatches2];

	// Second pass: Group by oneOf object paths first
	const oneOfObjectPaths = new Set<string>();
	for (const patch of allNonArrayPatches1) {
		const oneOfPath = getOneOfObjectPath(patch.path, schema);
		if (oneOfPath) {
			oneOfObjectPaths.add(oneOfPath);
		}
	}
	for (const patch of allNonArrayPatches2) {
		const oneOfPath = getOneOfObjectPath(patch.path, schema);
		if (oneOfPath) {
			oneOfObjectPaths.add(oneOfPath);
		}
	}

	// Group patches for oneOf objects
	for (const oneOfPath of oneOfObjectPaths) {
		if (!pathGroups.has(oneOfPath)) {
			pathGroups.set(oneOfPath, { patches1: [], patches2: [] });
		}
	}

	// Third pass: Distribute patches
	for (const patch of allNonArrayPatches1) {
		const patchPath = patch.path;
		const oneOfPath = getOneOfObjectPath(patchPath, schema);

		if (oneOfPath) {
			// Belongs to a oneOf object - group under object path
			const group = pathGroups.get(oneOfPath);
			if (group) {
				group.patches1.push(patch);
			}
		} else {
			// Regular field change - use full path for separate conflicts
			if (!pathGroups.has(patchPath)) {
				pathGroups.set(patchPath, { patches1: [], patches2: [] });
			}
			const group = pathGroups.get(patchPath);
			if (group) {
				group.patches1.push(patch);
			}
		}
	}

	for (const patch of allNonArrayPatches2) {
		const patchPath = patch.path;
		const oneOfPath = getOneOfObjectPath(patchPath, schema);

		if (oneOfPath) {
			// Belongs to a oneOf object - group under object path
			const group = pathGroups.get(oneOfPath);
			if (group) {
				group.patches2.push(patch);
			}
		} else {
			// Regular field change - use full path for separate conflicts
			if (!pathGroups.has(patchPath)) {
				pathGroups.set(patchPath, { patches1: [], patches2: [] });
			}
			const group = pathGroups.get(patchPath);
			if (group) {
				group.patches2.push(patch);
			}
		}
	}

	return pathGroups;
}

/**
 * Analyze conflicts using JSON Patches (RFC 6902)
 *
 * This function uses semantic JSON comparison, NOT line-based text comparison:
 * 1. Generates JSON Patch operations from base?input1 and base?input2
 * 2. Groups patches by root path (e.g., /awards/resource/0/count ? /awards)
 * 3. For each group, determines conflict type based on actual JSON values
 * 4. Returns conflicts with patch operations that will be mapped to line ranges
 *
 * The patches contain JSON Pointer paths (e.g., /resource/0/type) that reference
 * the actual JSON structure, not arbitrary text lines.
 *
 * @param base - Base JSON object
 * @param input1 - Input1 (theirs) JSON object
 * @param input2 - Input2 (ours) JSON object
 * @returns Array of conflict analyses with JSON Patch operations
 */
/**
 * Resolve schema at a given JSON Pointer path, handling oneOf/anyOf/allOf
 * @param schema - Root JSON Schema
 * @param path - JSON Pointer path (e.g., "/awards/resource/0/type")
 * @param data - The actual data at the path (for oneOf/anyOf resolution)
 * @returns The resolved schema for the path, or null if not found
 */
export function getSchemaAtPath(schema: JSONSchema | undefined, path: string, data?: unknown): JSONSchema | null {
	if (!schema) {
		return null;
	}

	const segments = path.split("/").filter(Boolean);
	if (segments.length === 0) {
		return schema;
	}

	let currentSchema: JSONSchema | null = schema;
	let currentPath = "";

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		const numericIndex = Number.parseInt(segment, 10);
		const isArrayIndex = !Number.isNaN(numericIndex) && String(numericIndex) === segment;

		// Handle oneOf/anyOf/allOf before navigating using shared utilities
		if (currentSchema && hasSchemaVariants(currentSchema)) {
			const variants = getSchemaVariants(currentSchema);
			const keyword = getSubschemaKeyword(currentSchema);
			const currentData = data ? getValueAtPath(data as Record<string, unknown>, currentPath || "/") : undefined;

			if (variants && variants.length > 0) {
				if (currentData !== undefined) {
					// Use shared chooseSubschemaSync for proper variant resolution
					try {
						const { schema: resolvedSchema } = chooseSubschemaSync(currentData, variants, keyword);
						currentSchema = resolvedSchema;
					} catch {
						if (variants.length > 0 && variants[0]) {
							currentSchema = variants[0];
						}
					}
				} else {
					// No data available, use first variant as fallback
					if (variants.length > 0 && variants[0]) {
						currentSchema = variants[0];
					}
				}
			}
		}

		if (!currentSchema) {
			return null;
		}

		// Navigate to next segment
		if (isArrayIndex) {
			// Array index - use items schema
			if (currentSchema.items) {
				if (Array.isArray(currentSchema.items)) {
					const itemAtIndex: unknown = numericIndex < currentSchema.items.length ? currentSchema.items[numericIndex] : null;
					currentSchema = itemAtIndex && typeof itemAtIndex === "object" ? (itemAtIndex as JSONSchema) : null;
				} else if (typeof currentSchema.items === "object") {
					// Ensure items is a JSONSchema object, not true
					currentSchema = currentSchema.items;
				} else {
					currentSchema = null;
				}
			} else {
				return null; // No items schema defined
			}
		} else {
			// Object property
			if (currentSchema.properties && typeof currentSchema.properties === "object" && !Array.isArray(currentSchema.properties)) {
				const properties = currentSchema.properties as Record<string, JSONSchema>;
				currentSchema = properties[segment] || null;
			} else {
				return null; // No properties schema defined
			}
		}

		if (!currentSchema) {
			return null;
		}

		currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
	}

	return currentSchema;
}

/**
 * Find anchor fields for array items based on schema
 * This helps match array items across versions even if their indices change
 *
 * Anchor fields can be:
 * 1. Fields with "const" values (discriminators in oneOf schemas)
 * 2. Common ID field names (id, uuid, _id, etc.)
 * 3. Fields marked with format: "uuid" or "objectid"
 *
 * @param schema - Schema for the array items
 * @returns Array of anchor field names, ordered by priority
 */
function findItemAnchorFields(schema: JSONSchema | null): string[] {
	if (!schema || typeof schema !== "object") {
		return [];
	}

	const anchors: string[] = [];

	if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
		const properties = schema.properties as Record<string, JSONSchema>;

		// Priority 1: Fields with "const" values (discriminators)
		for (const [fieldName, propSchema] of Object.entries(properties)) {
			if (propSchema && typeof propSchema === "object" && "const" in propSchema) {
				anchors.push(fieldName);
			}
		}

		// Priority 2: Fields with UUID/ObjectID format
		for (const [fieldName, propSchema] of Object.entries(properties)) {
			if (propSchema && typeof propSchema === "object") {
				const format = propSchema.format;
				if (format === "uuid" || format === "objectid") {
					if (!anchors.includes(fieldName)) {
						anchors.push(fieldName);
					}
				}
			}
		}

		// Priority 3: Common ID field names
		const commonIdFields = ["id", "uuid", "_id", "key"];
		for (const fieldName of commonIdFields) {
			if (fieldName in properties && !anchors.includes(fieldName)) {
				anchors.push(fieldName);
			}
		}

		// Priority 4: "type" field (common discriminator)
		if ("type" in properties && !anchors.includes("type")) {
			anchors.push("type");
		}

		// Priority 5: "name" field (fallback)
		if ("name" in properties && !anchors.includes("name")) {
			anchors.push("name");
		}
	}

	return anchors;
}

/**
 * Find a unique identifier field for array items based on schema
 * @deprecated Use findItemAnchorFields instead for better oneOf/const support
 * @param schema - Schema for the array items
 * @returns Name of the ID field (e.g., "id", "uuid", "_id"), or null
 */
function findItemIdField(schema: JSONSchema | null): string | null {
	const anchors = findItemAnchorFields(schema);
	return anchors.length > 0 ? anchors[0] : null;
}

/**
 * Match array items using multiple anchor fields from schema
 * This handles oneOf schemas with const discriminators and regular ID fields
 *
 * @param input1Array - Array from input1
 * @param input2Array - Array from input2
 * @param itemSchema - Schema for array items (may contain oneOf)
 * @returns Map of composite keys to indices: { "type:cash|id:1": { input1: 0, input2: 2 } }
 */
function matchArrayItemsByAnchors(
	input1Array: unknown[],
	input2Array: unknown[],
	itemSchema: JSONSchema | null,
): Map<string, { input1?: number; input2?: number }> {
	const matches = new Map<string, { input1?: number; input2?: number }>();

	// Get anchor fields from schema (const fields, ID fields, etc.)
	const anchorFields = findItemAnchorFields(itemSchema);

	if (anchorFields.length === 0) {
		// No anchor fields - can't match items semantically
		// Removed verbose logging
		return matches;
	}

	// Removed verbose logging

	// Generate a composite key from an item using available anchor fields
	const getItemKey = (item: unknown): string | null => {
		if (typeof item !== "object" || item === null) {
			return null;
		}

		const obj = item as Record<string, unknown>;
		const keyParts: string[] = [];

		// Build composite key from all available anchor fields
		for (const field of anchorFields) {
			const value = obj[field];
			if (value !== undefined && value !== null) {
				// Include field name to avoid collisions (e.g., type:1 vs id:1)
				keyParts.push(`${field}:${JSON.stringify(value)}`);
			}
		}

		// Need at least one anchor value to create a key
		return keyParts.length > 0 ? keyParts.join("|") : null;
	};

	// Index items by composite key in each array
	const indexArray = (arr: unknown[], version: "input1" | "input2") => {
		arr.forEach((item, index) => {
			const key = getItemKey(item);
			if (key) {
				if (!matches.has(key)) {
					matches.set(key, {});
				}
				const match = matches.get(key);
				if (match) {
					match[version] = index;
				}
			}
		});
	};

	indexArray(input1Array, "input1");
	indexArray(input2Array, "input2");

	// Removed verbose logging

	return matches;
}

/**
 * Match array items across versions using schema-defined ID fields
 * This handles cases where array order changes but items are semantically the same
 * @param baseArray - Array from base version
 * @param input1Array - Array from input1
 * @param input2Array - Array from input2
 * @param itemSchema - Schema for array items
 * @returns Map of item IDs to their indices in each version: { id: { base: index, input1: index, input2: index } }
 */
function matchArrayItemsById(
	baseArray: unknown[],
	input1Array: unknown[],
	input2Array: unknown[],
	itemSchema: JSONSchema | null,
): Map<string | number, { base?: number; input1?: number; input2?: number }> {
	const matches = new Map<string | number, { base?: number; input1?: number; input2?: number }>();
	const idField = findItemIdField(itemSchema);

	if (!idField) {
		// No ID field found - can't match by ID, return empty map
		return matches;
	}

	// Index items by ID in each array
	const indexByArray = (arr: unknown[], version: "base" | "input1" | "input2") => {
		arr.forEach((item, index) => {
			if (typeof item === "object" && item !== null) {
				const id = (item as Record<string, unknown>)[idField];
				if (id !== undefined && id !== null) {
					const idKey = String(id);
					if (!matches.has(idKey)) {
						matches.set(idKey, {});
					}
					const match = matches.get(idKey);
					if (match) {
						match[version] = index;
					}
				}
			}
		});
	};

	indexByArray(baseArray, "base");
	indexByArray(input1Array, "input1");
	indexByArray(input2Array, "input2");

	return matches;
}

export function analyzeConflicts(base: unknown, input1: unknown, input2: unknown, schema?: JSONSchema): ConflictAnalysis[] {
	// Generate JSON Patch operations (semantic diff, not text diff)
	// Each patch contains: op, path (JSON Pointer), value
	// fast-json-patch's compare accepts Object | any[] - ensure we pass valid types
	const baseObj = (typeof base === "object" && base !== null) || Array.isArray(base) ? base : {};
	const input1Obj = (typeof input1 === "object" && input1 !== null) || Array.isArray(input1) ? input1 : {};
	const input2Obj = (typeof input2 === "object" && input2 !== null) || Array.isArray(input2) ? input2 : {};

	const patch1 = compare(baseObj as object | unknown[], input1Obj as object | unknown[]);
	const patch2 = compare(baseObj as object | unknown[], input2Obj as object | unknown[]);

	// Group patches by root path for conflict analysis
	// Example: /awards/resource/0/count and /awards/resource/3 ? grouped as /awards
	let pathGroups = groupPatchesByRootPath(patch1, patch2);

	// If schema is provided, use it to improve path grouping for arrays and oneOf cases
	if (schema) {
		pathGroups = groupPatchesWithSchema(patch1, patch2, base, input1, input2, schema);
	}

	// Analyze each path group
	const conflicts: ConflictAnalysis[] = [];
	const processedPaths = new Set<string>();

	// Helper: Check if an object path has oneOf schema and if changes represent variant switch
	const checkOneOfVariantChange = (path: string, baseValue: unknown, input1Value: unknown, input2Value: unknown): boolean => {
		if (!schema) return false;
		if (typeof baseValue !== "object" || baseValue === null || Array.isArray(baseValue)) return false;
		if (typeof input1Value !== "object" || input1Value === null || Array.isArray(input1Value)) return false;
		if (typeof input2Value !== "object" || input2Value === null || Array.isArray(input2Value)) return false;

		const pathSchema = getSchemaAtPath(schema, path, baseValue);
		if (!pathSchema || !hasSchemaVariants(pathSchema)) return false;

		const variants = getSchemaVariants(pathSchema);
		if (!variants || variants.length < 2) return false;

		// Check if base, input1, and input2 match different variants
		const baseVariant = chooseSubschemaSync(baseValue, variants, getSubschemaKeyword(pathSchema));
		const input1Variant = chooseSubschemaSync(input1Value, variants, getSubschemaKeyword(pathSchema));
		const input2Variant = chooseSubschemaSync(input2Value, variants, getSubschemaKeyword(pathSchema));

		// If input1 and input2 match different variants (and base is different from both),
		// this is a oneOf variant conflict
		return (
			input1Variant.selectedIndex !== input2Variant.selectedIndex &&
			(baseVariant.selectedIndex !== input1Variant.selectedIndex || baseVariant.selectedIndex !== input2Variant.selectedIndex)
		);
	};

	// First, process paths with patches (changes)
	for (const [groupingKey, { patches1, patches2 }] of pathGroups) {
		processedPaths.add(groupingKey);

		// Extract representative path from patches (grouping key might be ID-based like "/path#id=1")
		// Use the first patch path from either set, or derive from grouping key
		let representativePath = groupingKey;
		if (patches1.length > 0) {
			representativePath = patches1[0].path;
		} else if (patches2.length > 0) {
			representativePath = patches2[0].path;
		} else if (groupingKey.includes("#")) {
			// ID-based grouping key - extract base path before "#"
			representativePath = groupingKey.split("#")[0];
		}

		// Extract the object path (parent object, without property/index segments)
		// For example: "/payment/number" -> "/payment", "/items/0/count" -> "/items"
		let objectPath = groupingKey;
		if (groupingKey.includes("#")) {
			// ID-based grouping: "/items#item-1" -> "/items"
			objectPath = groupingKey.split("#")[0];
		} else {
			// Extract parent path: "/payment/number" -> "/payment"
			const pathSegments = groupingKey.split("/").filter(Boolean);
			if (pathSegments.length > 1) {
				objectPath = `/${pathSegments[0]}`;
			}
		}

		// Check if groupingKey itself is an object path (no sub-properties in patches)
		const allPatchesAreForSameObject = [...patches1, ...patches2].every((p) => {
			const patchObjectPath = p.path.split("/").slice(0, 2).join("/") || `/${p.path.split("/")[1]}`;
			return patchObjectPath === objectPath;
		});

		// If all patches are for properties of the same object, check for oneOf variant change
		if (allPatchesAreForSameObject && objectPath !== representativePath) {
			const baseObjectValue = getValueAtPath(base as Record<string, unknown>, objectPath);
			const input1ObjectValue = getValueAtPath(input1 as Record<string, unknown>, objectPath);
			const input2ObjectValue = getValueAtPath(input2 as Record<string, unknown>, objectPath);

			// Check if this represents a oneOf variant change
			const isOneOfVariantChange = checkOneOfVariantChange(objectPath, baseObjectValue, input1ObjectValue, input2ObjectValue);

			if (isOneOfVariantChange) {
				// Use object-level path for oneOf variant conflicts
				const baseObjVal = baseObjectValue;
				const input1ObjVal = input1ObjectValue;
				const input2ObjVal = input2ObjectValue;

				// Determine conflict type at object level
				let conflictType = determineConflictType(baseObjVal, input1ObjVal, input2ObjVal);

				// For oneOf variants, different structures mean TRUE_CONFLICT
				if (!isEqual(baseObjVal, input1ObjVal) && !isEqual(baseObjVal, input2ObjVal) && !isEqual(input1ObjVal, input2ObjVal)) {
					conflictType = ConflictType.TRUE_CONFLICT;
				}

				// For oneOf variant changes, include only patches that input1/input2 actually changed
				// Filter patches to ensure we don't highlight identical properties
				const objectPatchesAll = [...patches1, ...patches2].filter(
					(p) => p.path.startsWith(`${objectPath}/`) || p.path === objectPath,
				);

				// Filter patches separately for input1 and input2
				const objectPatches1: JsonPatchOperation[] = [];
				const objectPatches2: JsonPatchOperation[] = [];

				for (const patch of objectPatchesAll) {
					const patchPath = patch.path;
					const patchBaseValue = base !== undefined ? getValueAtPath(base as Record<string, unknown>, patchPath) : undefined;
					const patchInput1Value = getValueAtPath(input1 as Record<string, unknown>, patchPath);
					const patchInput2Value = getValueAtPath(input2 as Record<string, unknown>, patchPath);

					// Check if input1 changed this property
					let input1Changed = false;
					let input2Changed = false;

					if (patch.op === "replace") {
						if (patchBaseValue !== undefined) {
							input1Changed = !isEqual(patchBaseValue, patchInput1Value);
							input2Changed = !isEqual(patchBaseValue, patchInput2Value);
						}
					} else if (patch.op === "add") {
						input1Changed = patchBaseValue === undefined && patchInput1Value !== undefined;
						input2Changed = patchBaseValue === undefined && patchInput2Value !== undefined;
					} else if (patch.op === "remove") {
						input1Changed = patchBaseValue !== undefined && patchInput1Value === undefined;
						input2Changed = patchBaseValue !== undefined && patchInput2Value === undefined;
					}

					// Don't include if the input's value is identical to base
					if (patchBaseValue !== undefined) {
						if (patchInput1Value !== undefined && isEqual(patchBaseValue, patchInput1Value)) {
							input1Changed = false;
						}
						if (patchInput2Value !== undefined && isEqual(patchBaseValue, patchInput2Value)) {
							input2Changed = false;
						}
					}

					if (input1Changed) {
						objectPatches1.push(patch);
					}
					if (input2Changed) {
						objectPatches2.push(patch);
					}
				}

				conflicts.push({
					path: objectPath,
					baseValue: baseObjVal,
					input1Value: input1ObjVal,
					input2Value: input2ObjVal,
					conflictType,
					patches1: objectPatches1,
					patches2: objectPatches2,
				});
				continue;
			}
		}

		// Get actual JSON values at the path (semantic comparison)
		// For array items matched by ID, we need to get values from each version using their actual indices
		// But for conflict analysis, we can use a representative path
		const baseValue = getValueAtPath(base as Record<string, unknown>, representativePath);
		const input1Value = getValueAtPath(input1 as Record<string, unknown>, representativePath);
		const input2Value = getValueAtPath(input2 as Record<string, unknown>, representativePath);

		// Determine conflict type based on JSON value comparison
		let conflictType = determineConflictType(baseValue, input1Value, input2Value);

		// Check if this is an item added in both inputs (not in base)
		const existsInBase = baseValue !== undefined && baseValue !== null;
		const existsInInput1 = input1Value !== undefined && input1Value !== null;
		const existsInInput2 = input2Value !== undefined && input2Value !== null;

		if (!existsInBase && existsInInput1 && existsInInput2) {
			// Item added in both inputs
			// If they added the SAME value ? SAME_CHANGE (auto-merged, highlight blue)
			// If they added DIFFERENT values ? TRUE_CONFLICT (conflict, highlight orange/red)
			if (conflictType !== ConflictType.SAME_CHANGE) {
				// Different values added - treat as TRUE_CONFLICT so both sides are highlighted
				// We'll handle the orange highlighting in the decoration logic
				conflictType = ConflictType.TRUE_CONFLICT;
			}
			// If conflictType is already SAME_CHANGE, keep it (both added same value)
		}

		// Include all changes (including SAME_CHANGE for items that changed to the same value)
		// Exclude items that are completely unchanged (same as base in all versions)
		const isCompletelyUnchanged = existsInBase && isEqual(baseValue, input1Value) && isEqual(baseValue, input2Value);

		if (!isCompletelyUnchanged) {
			conflicts.push({
				path: representativePath, // Use representative path for conflict (actual patch paths are in patches1/patches2)
				baseValue,
				input1Value,
				input2Value,
				conflictType,
				patches1, // JSON Patch operations for base?input1 (contain actual paths with indices)
				patches2, // JSON Patch operations for base?input2 (contain actual paths with indices)
			});
		}
	}

	// Don't create conflicts for completely unchanged items
	// Unchanged items should not be highlighted (they're the same in all versions)

	return conflicts;
}

/**
 * Analyze conflicts for 2-column mode (input1 vs input2, no base)
 *
 * Uses JSON Patch comparison (semantic, not line-based):
 * - Generates patches from input1?input2
 * - Groups by root path
 * - Maps to conflict ranges
 *
 * @param input1 - Input1 JSON object (left column)
 * @param input2 - Input2 JSON object (right column)
 * @returns Array of conflict analyses with JSON Patch operations
 */
export function analyzeTwoWayConflicts(input1: unknown, input2: unknown, schema?: JSONSchema): ConflictAnalysis[] {
	// Generate JSON Patch operations from input1 to input2
	// This finds semantic differences (changed JSON values), not text differences
	// fast-json-patch's compare accepts Object | any[] - ensure we pass valid types
	const input1Obj = (typeof input1 === "object" && input1 !== null) || Array.isArray(input1) ? input1 : {};
	const input2Obj = (typeof input2 === "object" && input2 !== null) || Array.isArray(input2) ? input2 : {};
	const patches = compare(input1Obj as object | unknown[], input2Obj as object | unknown[]);

	if (patches.length === 0) {
		return []; // No differences
	}

	// Analyze each patch and determine grouping strategy
	// For arrays with schema, we'll use anchor-based matching
	// For other paths, we'll use index-based grouping
	const conflicts: ConflictAnalysis[] = [];
	const processedPaths = new Set<string>();

	// Group patches by array path to detect array operations
	const arrayPathGroups = new Map<string, JsonPatchOperation[]>();
	const nonArrayPatches: JsonPatchOperation[] = [];

	for (const patch of patches) {
		// Check if this patch operates on an array item
		// Pattern: /path/to/array/INDEX or /path/to/array/INDEX/property
		const arrayItemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*)\/(\d+)(?:\/|$)/);

		if (arrayItemMatch) {
			const arrayPath = arrayItemMatch[1]; // e.g., /needResourcesAtRefresh/resource
			if (!arrayPathGroups.has(arrayPath)) {
				arrayPathGroups.set(arrayPath, []);
			}
			const arrayGroup = arrayPathGroups.get(arrayPath);
			if (arrayGroup) {
				arrayGroup.push(patch);
			}
		} else {
			nonArrayPatches.push(patch);
		}
	}

	// Removed verbose logging

	// Process array patches with schema-aware matching
	for (const [arrayPath, arrayPatches] of arrayPathGroups) {
		// Get the arrays from both inputs
		const input1Array = getValueAtPath(input1 as Record<string, unknown>, arrayPath);
		const input2Array = getValueAtPath(input2 as Record<string, unknown>, arrayPath);

		if (!Array.isArray(input1Array) || !Array.isArray(input2Array)) {
			// Removed verbose logging
			// Fallback: group by item index
			const itemGroups = new Map<string, JsonPatchOperation[]>();
			for (const patch of arrayPatches) {
				const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
				if (itemMatch) {
					const itemPath = itemMatch[1];
					if (!itemGroups.has(itemPath)) {
						itemGroups.set(itemPath, []);
					}
					itemGroups.get(itemPath)?.push(patch);
				}
			}

			for (const [itemPath, itemPatches] of itemGroups) {
				conflicts.push(...createConflictsForGroup(itemPath, itemPatches, input1, input2, undefined));
				processedPaths.add(itemPath);
			}
			continue;
		}

		// Get schema for array items
		const arraySchema = schema ? getSchemaAtPath(schema, arrayPath, input1) : null;
		const itemSchemaRaw = arraySchema?.items
			? Array.isArray(arraySchema.items) && arraySchema.items[0]
				? arraySchema.items[0]
				: !Array.isArray(arraySchema.items)
					? arraySchema.items
					: null
			: null;
		// Ensure itemSchema is a valid JSONSchema (not true)
		const itemSchema = itemSchemaRaw && typeof itemSchemaRaw === "object" ? itemSchemaRaw : null;

		// Removed verbose logging

		if (itemSchema) {
			// Use schema-aware matching
			const matches = matchArrayItemsByAnchors(input1Array, input2Array, itemSchema);
			// Removed verbose logging

			// Create index-to-key mapping for quick lookup
			const input1KeysByIndex = new Map<number, string>();
			const input2KeysByIndex = new Map<number, string>();

			for (const [key, indices] of matches.entries()) {
				if (indices.input1 !== undefined) {
					input1KeysByIndex.set(indices.input1, key);
				}
				if (indices.input2 !== undefined) {
					input2KeysByIndex.set(indices.input2, key);
				}
			}

			// Group patches by matched items
			const matchedItemPatches = new Map<string, JsonPatchOperation[]>();
			const unmatchedPatches: JsonPatchOperation[] = [];

			for (const patch of arrayPatches) {
				const itemIndexMatch = patch.path.match(/^\/[^/]+(?:\/[^/]+)*\/(\d+)(?:\/|$)/);
				if (itemIndexMatch) {
					const index = Number.parseInt(itemIndexMatch[1], 10);

					// Determine which array this index refers to based on operation
					let key: string | undefined;
					if (patch.op === "add") {
						// Add operations reference input2 indices
						key = input2KeysByIndex.get(index);
					} else {
						// Replace/remove operations reference input1 indices
						key = input1KeysByIndex.get(index);
					}

					if (key) {
						if (!matchedItemPatches.has(key)) {
							matchedItemPatches.set(key, []);
						}
						const matchedPatches = matchedItemPatches.get(key);
						if (matchedPatches) {
							matchedPatches.push(patch);
						}
					} else {
						unmatchedPatches.push(patch);
					}
				}
			}

			// Create conflicts for matched items
			for (const [key, itemPatches] of matchedItemPatches) {
				const match = matches.get(key);
				if (!match) continue;
				const itemPath = match.input1 !== undefined ? `${arrayPath}/${match.input1}` : `${arrayPath}/${match.input2}`;

				conflicts.push(...createConflictsForGroup(itemPath, itemPatches, input1, input2, undefined));
				processedPaths.add(itemPath);
			}

			// Create conflicts for unmatched items (pure adds/removes)
			// First, group unmatched patches by item path
			const unmatchedItemGroups = new Map<string, JsonPatchOperation[]>();
			for (const patch of unmatchedPatches) {
				const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
				if (itemMatch) {
					const itemPath = itemMatch[1];
					if (!unmatchedItemGroups.has(itemPath)) {
						unmatchedItemGroups.set(itemPath, []);
					}
					unmatchedItemGroups.get(itemPath)?.push(patch);
				}
			}

			// Then create conflicts for each item path
			for (const [itemPath, itemPatches] of unmatchedItemGroups) {
				if (!processedPaths.has(itemPath)) {
					// Removed verbose logging
					conflicts.push(...createConflictsForGroup(itemPath, itemPatches, input1, input2, undefined));
					processedPaths.add(itemPath);
				}
			}
		} else {
			// No schema or no item schema - fall back to index-based grouping
			// Removed verbose logging
			const itemGroups = new Map<string, JsonPatchOperation[]>();
			for (const patch of arrayPatches) {
				const itemMatch = patch.path.match(/^(\/[^/]+(?:\/[^/]+)*\/\d+)(?:\/|$)/);
				if (itemMatch) {
					const itemPath = itemMatch[1];
					if (!itemGroups.has(itemPath)) {
						itemGroups.set(itemPath, []);
					}
					itemGroups.get(itemPath)?.push(patch);
				}
			}

			for (const [itemPath, itemPatches] of itemGroups) {
				conflicts.push(...createConflictsForGroup(itemPath, itemPatches, input1, input2, undefined));
				processedPaths.add(itemPath);
			}
		}
	}

	// Process non-array patches (simple properties)
	const propertyGroups = new Map<string, JsonPatchOperation[]>();
	for (const patch of nonArrayPatches) {
		const segments = patch.path.split("/").filter(Boolean);
		const rootPath = segments.length > 0 ? `/${segments[0]}` : "/";

		if (!propertyGroups.has(rootPath)) {
			propertyGroups.set(rootPath, []);
		}
		propertyGroups.get(rootPath)?.push(patch);
	}

	for (const [path, pathPatches] of propertyGroups) {
		conflicts.push(...createConflictsForGroup(path, pathPatches, input1, input2, undefined));
	}

	return conflicts;
}

/**
 * Helper function to create conflicts for a group of patches
 * Only creates conflicts for paths where values actually differ
 */
function createConflictsForGroup(
	path: string,
	pathPatches: JsonPatchOperation[],
	input1: unknown,
	input2: unknown,
	base?: unknown,
): ConflictAnalysis[] {
	// Get actual values at this path from all versions
	const baseValue = base !== undefined ? getValueAtPath(base as Record<string, unknown>, path) : undefined;
	const input1Value = getValueAtPath(input1 as Record<string, unknown>, path);
	const input2Value = getValueAtPath(input2 as Record<string, unknown>, path);

	// Filter patches separately for input1 and input2
	// A patch should only be in patches1 if input1 changed it, and in patches2 if input2 changed it
	const filteredPatches1: JsonPatchOperation[] = [];
	const filteredPatches2: JsonPatchOperation[] = [];

	for (const patch of pathPatches) {
		// For each patch, check if the value at that path actually changed in each input
		const patchPath = patch.path;
		const patchBaseValue = base !== undefined ? getValueAtPath(base as Record<string, unknown>, patchPath) : undefined;
		const patchInput1Value = getValueAtPath(input1 as Record<string, unknown>, patchPath);
		const patchInput2Value = getValueAtPath(input2 as Record<string, unknown>, patchPath);

		// Check if input1 changed this property
		let input1Changed = false;
		// Check if input2 changed this property
		let input2Changed = false;

		if (patch.op === "add") {
			// Add: check if input1 added it (doesn't exist in base, exists in input1)
			input1Changed = patchBaseValue === undefined && patchInput1Value !== undefined;
			// Add: check if input2 added it
			input2Changed = patchBaseValue === undefined && patchInput2Value !== undefined;
		} else if (patch.op === "remove") {
			// Remove: check if input1 removed it (exists in base, doesn't exist in input1)
			input1Changed = patchBaseValue !== undefined && patchInput1Value === undefined;
			// Remove: check if input2 removed it
			input2Changed = patchBaseValue !== undefined && patchInput2Value === undefined;
		} else if (patch.op === "replace") {
			// Replace: check if input1 changed it from base
			if (patchBaseValue !== undefined) {
				input1Changed = !isEqual(patchBaseValue, patchInput1Value);
				input2Changed = !isEqual(patchBaseValue, patchInput2Value);
			} else {
				// Added in both (shouldn't happen with replace, but handle it)
				input1Changed = patchInput1Value !== undefined;
				input2Changed = patchInput2Value !== undefined;
			}
		}

		// Special case: if this is the exact same path as the conflict path, always include
		// (this handles the case where the path itself changed)
		if (patchPath === path) {
			// For object-level conflicts, check which input actually changed the object
			if (patchBaseValue !== undefined && patchInput1Value !== undefined && patchInput2Value !== undefined) {
				input1Changed = !isEqual(patchBaseValue, patchInput1Value);
				input2Changed = !isEqual(patchBaseValue, patchInput2Value);
			} else {
				input1Changed = true;
				input2Changed = true;
			}
		}

		// Don't include patches for properties where the input's value is identical to base
		// This ensures identical properties aren't highlighted
		if (patchBaseValue !== undefined) {
			if (patchInput1Value !== undefined && isEqual(patchBaseValue, patchInput1Value)) {
				input1Changed = false; // Input1 didn't change - same as base
			}
			if (patchInput2Value !== undefined && isEqual(patchBaseValue, patchInput2Value)) {
				input2Changed = false; // Input2 didn't change - same as base
			}
		}

		// Also check: don't include patches for properties where all values are identical
		if (patchBaseValue !== undefined && patchInput1Value !== undefined && patchInput2Value !== undefined) {
			if (isEqual(patchBaseValue, patchInput1Value) && isEqual(patchBaseValue, patchInput2Value)) {
				input1Changed = false; // All identical - no change
				input2Changed = false;
			}
		}

		// Add to appropriate filtered arrays
		if (input1Changed) {
			filteredPatches1.push(patch);
		}
		if (input2Changed) {
			filteredPatches2.push(patch);
		}
	}

	// If no patches remain after filtering, check if the path itself changed
	if (filteredPatches1.length === 0 && filteredPatches2.length === 0) {
		// Check if values are actually identical across all versions
		// If so, don't create a conflict (no change to highlight)
		const allValuesIdentical =
			baseValue !== undefined &&
			input1Value !== undefined &&
			input2Value !== undefined &&
			isEqual(baseValue, input1Value) &&
			isEqual(baseValue, input2Value);

		if (allValuesIdentical) {
			// Values are identical - no conflict to report
			return [];
		}
		// If path value changed but no filtered patches, still create conflict with all patches
		// (might be an object-level change)
	}

	// Use filtered patches for conflict detection - use original patches if filtered are empty
	const patches1ToUse = filteredPatches1.length > 0 ? filteredPatches1 : pathPatches;
	const patches2ToUse = filteredPatches2.length > 0 ? filteredPatches2 : pathPatches;

	// For conflict type detection, check both sets
	const patchesToUse = [...patches1ToUse, ...patches2ToUse];

	const hasAdd = patchesToUse.some((p) => p.op === "add");
	const hasRemove = patchesToUse.some((p) => p.op === "remove");
	const hasReplace = patchesToUse.some((p) => p.op === "replace");

	if (hasAdd && !hasReplace && !hasRemove) {
		// Pure add: only highlight on the side that has the value
		// But check which input actually has the value
		if (input1Value !== undefined && input2Value === undefined) {
			// Added in input1 only
			return [
				{
					path,
					baseValue: undefined,
					input1Value,
					input2Value: undefined,
					conflictType: ConflictType.INPUT1_ONLY,
					patches1: patches1ToUse, // Highlight on input1 (new content) - use filtered patches1
					patches2: [], // No highlighting on input2 (doesn't exist there)
				},
			];
		} else if (input2Value !== undefined && input1Value === undefined) {
			// Added in input2 only
			return [
				{
					path,
					baseValue: undefined,
					input1Value: undefined,
					input2Value,
					conflictType: ConflictType.INPUT2_ONLY,
					patches1: [], // No highlighting on input1 (doesn't exist there)
					patches2: patches2ToUse, // Highlight on input2 (new content) - use filtered patches2
				},
			];
		}
	}
	if (hasRemove && !hasAdd && !hasReplace) {
		// Pure remove: check which input removed it
		if (input1Value !== undefined && input2Value === undefined) {
			// Removed in input2 only
			return [
				{
					path,
					baseValue: input1Value,
					input1Value,
					input2Value: undefined,
					conflictType: ConflictType.INPUT1_ONLY,
					patches1: patches1ToUse, // Highlight on input1 (removed content) - use filtered patches1
					patches2: [], // No highlighting on input2 (doesn't exist there)
				},
			];
		} else if (input2Value !== undefined && input1Value === undefined) {
			// Removed in input1 only
			return [
				{
					path,
					baseValue: input2Value,
					input1Value: undefined,
					input2Value,
					conflictType: ConflictType.INPUT2_ONLY,
					patches1: [], // No highlighting on input1 (doesn't exist there)
					patches2: patches2ToUse, // Highlight on input2 (removed content) - use filtered patches2
				},
			];
		}
	}

	// Replace or mixed operations: determine conflict type based on actual values
	const conflictType = determineConflictType(baseValue, input1Value, input2Value);

	// Determine which patches to include based on conflict type
	// Use filtered patches (only actual changes) instead of all patches
	let patches1: JsonPatchOperation[] = [];
	let patches2: JsonPatchOperation[] = [];

	switch (conflictType) {
		case ConflictType.INPUT1_ONLY:
			patches1 = patches1ToUse; // Input1 has the change - use filtered patches1
			patches2 = [];
			break;
		case ConflictType.INPUT2_ONLY:
			patches1 = [];
			patches2 = patches2ToUse; // Input2 has the change - use filtered patches2
			break;
		case ConflictType.SAME_CHANGE:
			// Both changed to same value - highlight both with their respective filtered patches
			patches1 = patches1ToUse;
			patches2 = patches2ToUse;
			break;
		case ConflictType.TRUE_CONFLICT:
			// Both changed to different values - highlight both with their respective filtered patches
			patches1 = patches1ToUse;
			patches2 = patches2ToUse;
			break;
	}

	return [
		{
			path,
			baseValue,
			input1Value,
			input2Value,
			conflictType,
			patches1,
			patches2,
		},
	];
}

/**
 * Map conflict analyses (with JSON Patch operations) to Monaco Editor line ranges
 *
 * This function converts JSON Patch paths to line numbers:
 * 1. Takes conflicts with JSON Patch operations (e.g., /resource/0/type)
 * 2. For each patch, finds the actual JSON node in the formatted text using jsonc-parser
 * 3. Maps the node's character offset to line numbers
 * 4. Combines patch locations into line ranges for highlighting
 *
 * This is NOT line-based diff - we're using JSON structure (nodes) to find lines,
 * ensuring we highlight the exact JSON values that changed according to the patches.
 *
 * @param conflicts - Array of conflict analyses with JSON Patch operations
 * @param baseText - Formatted base JSON text (sorted keys, 2-space indent)
 * @param input1Text - Formatted input1 JSON text
 * @param input2Text - Formatted input2 JSON text
 * @returns Array of ModifiedBaseRange objects for Monaco Editor decorations
 */
/**
 * Calculate line range that encompasses all patches in a group
 *
 * For JSON Patch diffs, we highlight based on the actual patch locations.
 * This ensures we're highlighting the exact JSON values that changed according
 * to the JSON Patch operations, not arbitrary line groups.
 *
 * Strategy:
 * 1. Find line ranges for each patch path using jsonc-parser (the exact changed JSON nodes)
 * 2. Combine ranges to encompass all affected values
 * 3. Skip patches that reference non-existent paths (they return {1,1} as "not found")
 */
function calculatePatchLineRange(text: string, patches: JsonPatchOperation[]): { start: number; end: number } {
	if (!patches || patches.length === 0) {
		return { start: 1, end: 1 };
	}

	let minStart = Number.MAX_SAFE_INTEGER;
	let maxEnd = 0;
	let foundAnyNode = false;

	for (const patch of patches) {
		const lines = getNodeLines(text, patch.path);
		// Skip nodes that weren't found (defaulted to {1, 1})
		// When a path doesn't exist (e.g., array index that doesn't exist), getNodeLines returns {1,1}
		// We skip these to avoid polluting the range calculation
		if (lines.start === 1 && lines.end === 1) {
			// Removed verbose logging
			continue;
		}

		minStart = Math.min(minStart, lines.start);
		maxEnd = Math.max(maxEnd, lines.end);
		foundAnyNode = true;
	}

	// If no valid lines found, default to line 1
	if (!foundAnyNode || minStart === Number.MAX_SAFE_INTEGER || maxEnd === 0) {
		// Removed verbose logging
		return { start: 1, end: 1 };
	}

	// Removed verbose logging
	return { start: minStart, end: maxEnd };
}

export function mapConflictsToRanges(
	conflicts: ConflictAnalysis[],
	baseText: string,
	input1Text: string,
	input2Text: string,
): ModifiedBaseRange[] {
	const ranges: ModifiedBaseRange[] = [];

	for (let i = 0; i < conflicts.length; i++) {
		const conflict = conflicts[i];

		// Calculate line ranges by finding the range that encompasses all patches
		// For unchanged items (empty patches), use the path directly to get line ranges
		let baseLines: { start: number; end: number };
		let input1Lines: { start: number; end: number };
		let input2Lines: { start: number; end: number };

		if ((conflict.patches1?.length ?? 0) === 0 && (conflict.patches2?.length ?? 0) === 0) {
			// Unchanged item - get line range directly from path
			baseLines = baseText ? getNodeLines(baseText, conflict.path) : { start: 1, end: 1 };
			input1Lines = getNodeLines(input1Text, conflict.path);
			input2Lines = getNodeLines(input2Text, conflict.path);
		} else {
			// Changed item - use patches to calculate ranges
			baseLines = calculatePatchLineRange(baseText, [...(conflict.patches1 || []), ...(conflict.patches2 || [])]);
			input1Lines = calculatePatchLineRange(input1Text, conflict.patches1 || []);
			input2Lines = calculatePatchLineRange(input2Text, conflict.patches2 || []);
		}

		// Determine if this is a true conflict
		const isConflicting = conflict.conflictType === ConflictType.TRUE_CONFLICT;

		// Determine default states based on conflict type
		let input1State = InputState.excluded;
		let input2State = InputState.excluded;

		switch (conflict.conflictType) {
			case ConflictType.SAME_CHANGE:
				// Both changed to the same value - accept both (they're identical)
				input1State = InputState.first;
				input2State = InputState.first;
				break;
			case ConflictType.INPUT1_ONLY:
				// Only input1 changed - accept input1
				input1State = InputState.first;
				break;
			case ConflictType.INPUT2_ONLY:
				// Only input2 changed - accept input2
				input2State = InputState.first;
				break;
			case ConflictType.TRUE_CONFLICT:
				// True conflict - default to accepting input2 (ours)
				input2State = InputState.first;
				break;
		}

		// Calculate actual line numbers for each patch (not fake line numbers)
		// This ensures decorations are applied to the correct lines based on JSON Patch paths
		const input1Diffs: { line: number }[] = [];
		const input2Diffs: { line: number }[] = [];

		if (conflict.patches1 && (conflict.patches1.length ?? 0) > 0) {
			for (const patch of conflict.patches1) {
				// Skip removals - the item doesn't exist in input1, so there's nothing to highlight
				// Highlighting would show wrong lines (line numbers from base don't match input1)
				if (patch.op === "remove") {
					continue;
				}

				// For non-removals, find node in input1
				const lines = getNodeLines(input1Text, patch.path);

				// Only include if the node was found (not {1,1} default)
				if (lines.start !== 1 || lines.end !== 1) {
					// For additions/replacements, add ALL lines in the range (for multi-line objects/arrays)
					for (let lineNum = lines.start; lineNum <= lines.end; lineNum++) {
						input1Diffs.push({ line: lineNum });
					}
				}
			}
		} else if ((conflict.patches1?.length ?? 0) === 0 && (conflict.patches2?.length ?? 0) === 0) {
			// Unchanged item - still need to highlight it, so add line from path
			const lines = getNodeLines(input1Text, conflict.path);
			if (lines.start !== 1 || lines.end !== 1) {
				input1Diffs.push({ line: lines.start });
			}
		}

		if (conflict.patches2 && (conflict.patches2.length ?? 0) > 0) {
			for (const patch of conflict.patches2) {
				// Skip removals - the item doesn't exist in input2, so there's nothing to highlight
				// Highlighting would show wrong lines (line numbers from base don't match input2)
				if (patch.op === "remove") {
					continue;
				}

				// For non-removals, find node in input2
				const lines = getNodeLines(input2Text, patch.path);

				// Only include if the node was found (not {1,1} default)
				if (lines.start !== 1 || lines.end !== 1) {
					// For additions/replacements, add ALL lines in the range (for multi-line objects/arrays)
					for (let lineNum = lines.start; lineNum <= lines.end; lineNum++) {
						input2Diffs.push({ line: lineNum });
					}
				}
			}
		} else if ((conflict.patches1?.length ?? 0) === 0 && (conflict.patches2?.length ?? 0) === 0) {
			// Unchanged item - still need to highlight it, so add line from path
			const lines = getNodeLines(input2Text, conflict.path);
			if (lines.start !== 1 || lines.end !== 1) {
				input2Diffs.push({ line: lines.start });
			}
		}

		// Removed verbose logging

		const range: ModifiedBaseRange = {
			id: `conflict-${i}`,
			path: conflict.path, // Include path for value extraction during resolution
			baseRange: {
				startLineNumber: baseLines.start,
				endLineNumberExclusive: baseLines.end + 1,
			},
			input1Range: {
				startLineNumber: input1Lines.start,
				endLineNumberExclusive: input1Lines.end + 1,
			},
			input2Range: {
				startLineNumber: input2Lines.start,
				endLineNumberExclusive: input2Lines.end + 1,
			},
			input1Diffs,
			input2Diffs,
			isConflicting,
			conflictType: conflict.conflictType,
			input1State,
			input2State,
			handled: conflict.conflictType === ConflictType.SAME_CHANGE,
			focused: false,
		};

		ranges.push(range);
	}

	return ranges;
}

/**
 * Compute diffs using JSON Patch approach
 * @param baseText - Base version (JSON string, can be empty if no base)
 * @param input1Text - Input1 version (JSON string)
 * @param input2Text - Input2 version (JSON string)
 * @param options - Optional configuration
 * @param options.comparisonMode - How to compare: "split" or "sequential" (default: "split")
 * @param options.schema - Optional JSON Schema for schema-aware comparison
 * @param options.patches - Optional pre-computed patches (use instead of computing)
 * @returns Array of ModifiedBaseRange objects
 */
export function computeDiffsJsonPatch(
	baseText: string,
	input1Text: string,
	input2Text: string,
	options: {
		comparisonMode?: "split" | "sequential";
		schema?: JSONSchema;
		patches?: {
			theirs?: JsonPatchOperation[];
			ours?: JsonPatchOperation[];
		};
	} = {},
): ModifiedBaseRange[] {
	const { comparisonMode = "split", schema } = options;

	// Validate inputs
	if (!input1Text || !input2Text) {
		throw new Error("JSON Patch diff requires non-empty input1 and input2 strings");
	}

	try {
		// 1. Parse JSON (with error handling)
		const base = baseText ? JSON.parse(baseText) : undefined;
		const input1 = JSON.parse(input1Text);
		const input2 = JSON.parse(input2Text);

		let conflicts: ConflictAnalysis[];

		if (base === undefined) {
			// 2-column mode: input1 vs input2 (no base)
			// Use provided patches or compute
			conflicts = analyzeTwoWayConflicts(input1, input2, schema);
		} else if (comparisonMode === "split") {
			// 3-column mode (split): input1 vs base, input2 vs base
			// Use provided patches or compute
			conflicts = analyzeConflicts(base, input1, input2, schema);
		} else {
			// 3-column mode (sequential): base ? input1 ? input2
			// For sequential, we compare base?input1 and input1?input2
			// This is a different approach - let's analyze it properly
			const patch1 = compare(base, input1);
			const patch2 = compare(input1, input2);

			// Combine paths from both patch sets
			const allPaths = new Set<string>();
			patch1.forEach((p) => {
				allPaths.add(p.path);
			});
			patch2.forEach((p) => {
				allPaths.add(p.path);
			});

			conflicts = Array.from(allPaths).map((path) => {
				const baseValue = getValueAtPath(base as Record<string, unknown>, path);
				const input1Value = getValueAtPath(input1 as Record<string, unknown>, path);
				const input2Value = getValueAtPath(input2 as Record<string, unknown>, path);

				// In sequential mode: check both transitions
				const baseToInput1Changed = !isEqual(baseValue, input1Value);
				const input1ToInput2Changed = !isEqual(input1Value, input2Value);

				let conflictType: ConflictType;

				if (baseToInput1Changed && input1ToInput2Changed) {
					conflictType = ConflictType.TRUE_CONFLICT;
				} else if (baseToInput1Changed) {
					conflictType = ConflictType.INPUT1_ONLY;
				} else if (input1ToInput2Changed) {
					conflictType = ConflictType.INPUT2_ONLY;
				} else {
					conflictType = ConflictType.SAME_CHANGE;
				}

				return {
					path,
					baseValue,
					input1Value,
					input2Value,
					conflictType,
				};
			});
		}

		// 3. Map to Monaco ranges
		// IMPORTANT: Use original text for line number mapping, not formatted text!
		// The Monaco editors display the original text, so line numbers must match.
		return mapConflictsToRanges(conflicts, baseText, input1Text, input2Text);
	} catch (error) {
		// No fallback - re-throw with context
		// User must fix invalid JSON
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`JSON Patch diff computation failed: ${message}`);
	}
}
