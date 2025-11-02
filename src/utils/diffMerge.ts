import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { ConflictType, InputState, type JSONSchema, type ModifiedBaseRange } from "../types";
import { getValueAtPath } from "./helpers";
import { getSchemaAtPath } from "./jsonPatchDiff";

/**
 * Represents a single line change with detailed information
 */
interface LineChange {
	line: number;
	input1Changed: boolean;
	input2Changed: boolean;
	baseLine: string;
	input1Line: string;
	input2Line: string;
	conflictType: ConflictType;
}

/**
 * Compute conflict type for a single line by comparing base, input1, and input2
 */
export function computeLineConflictType(
	baseLine: string,
	input1Line: string,
	input2Line: string,
): {
	conflictType: ConflictType;
	input1Changed: boolean;
	input2Changed: boolean;
} {
	const input1Changed = baseLine !== input1Line;
	const input2Changed = baseLine !== input2Line;

	let conflictType: ConflictType;

	if (input1Changed && input2Changed) {
		// Both changed - check if they have the same final value
		if (input1Line === input2Line) {
			conflictType = ConflictType.SAME_CHANGE;
		} else {
			conflictType = ConflictType.TRUE_CONFLICT;
		}
	} else if (input1Changed) {
		conflictType = ConflictType.INPUT1_ONLY;
	} else {
		conflictType = ConflictType.INPUT2_ONLY;
	}

	return { conflictType, input1Changed, input2Changed };
}

/**
 * Compute diffs between base, input1, and input2 documents
 * Returns an array of conflict ranges with their types
 */
export function computeDiffs(baseLines: string[], input1Lines: string[], input2Lines: string[]): ModifiedBaseRange[] {
	const baseRanges: ModifiedBaseRange[] = [];

	// Track all changes for each line with detailed comparison and conflict type
	const allChanges: LineChange[] = [];

	for (let i = 0; i < Math.max(baseLines.length, input1Lines.length, input2Lines.length); i++) {
		const baseLine = baseLines[i] !== undefined ? baseLines[i] : "";
		const input1Line = input1Lines[i] !== undefined ? input1Lines[i] : "";
		const input2Line = input2Lines[i] !== undefined ? input2Lines[i] : "";

		const { conflictType, input1Changed, input2Changed } = computeLineConflictType(baseLine, input1Line, input2Line);

		if (input1Changed || input2Changed) {
			allChanges.push({
				line: i + 1,
				input1Changed,
				input2Changed,
				baseLine,
				input1Line,
				input2Line,
				conflictType,
			});
		}
	}

	// Group consecutive changes with the SAME conflict type into ranges
	if (allChanges.length === 0) {
		return [];
	}

	let rangeStart = allChanges[0]?.line ?? 1;
	let currentConflictType = allChanges[0]?.conflictType;
	let input1DiffsInRange: { line: number }[] = [];
	let input2DiffsInRange: { line: number }[] = [];

	for (let i = 0; i <= allChanges.length; i++) {
		const current = allChanges[i];
		const isLast = i === allChanges.length;
		const isGap = !isLast && current && allChanges[i - 1] && current.line > (allChanges[i - 1]?.line ?? 0) + 1;
		const typeChanged = !isLast && current && current.conflictType !== currentConflictType;

		if (isLast || isGap || typeChanged) {
			// End of range
			const prevChange = allChanges[i - 1];
			const rangeEnd = prevChange ? prevChange.line + 1 : rangeStart + 1;

			const hasInput1Changes = input1DiffsInRange.length > 0;
			const hasInput2Changes = input2DiffsInRange.length > 0;
			const isConflicting = currentConflictType === ConflictType.TRUE_CONFLICT;

			const range: ModifiedBaseRange = {
				id: `conflict-${baseRanges.length}`,
				baseRange: {
					startLineNumber: rangeStart,
					endLineNumberExclusive: rangeEnd,
				},
				input1Range: {
					startLineNumber: rangeStart,
					endLineNumberExclusive: rangeEnd,
				},
				input2Range: {
					startLineNumber: rangeStart,
					endLineNumberExclusive: rangeEnd,
				},
				input1Diffs: input1DiffsInRange,
				input2Diffs: input2DiffsInRange,
				isConflicting,
				conflictType: currentConflictType,
				// Default: accept input2 (ours) by default, or both if same change
				input1State: currentConflictType === ConflictType.SAME_CHANGE && hasInput1Changes ? InputState.first : InputState.excluded,
				input2State: hasInput2Changes ? InputState.first : InputState.excluded,
				handled: currentConflictType === ConflictType.SAME_CHANGE,
				focused: false,
			};

			baseRanges.push(range);

			// Start new range
			if (!isLast && current) {
				rangeStart = current.line;
				currentConflictType = current.conflictType;
				input1DiffsInRange = [];
				input2DiffsInRange = [];
			}
		}

		if (!isLast && current) {
			if (current.input1Changed) {
				input1DiffsInRange.push({ line: current.line });
			}
			if (current.input2Changed) {
				input2DiffsInRange.push({ line: current.line });
			}
		}
	}

	return baseRanges;
}

/**
 * Compute diffs in sequential mode: base→input1→input2
 * In this mode, we compare base with input1, and input1 with input2
 */
export function computeDiffsSequential(baseLines: string[], input1Lines: string[], input2Lines: string[]): ModifiedBaseRange[] {
	const baseRanges: ModifiedBaseRange[] = [];

	// Track all changes for each line
	const allChanges: LineChange[] = [];

	for (let i = 0; i < Math.max(baseLines.length, input1Lines.length, input2Lines.length); i++) {
		const baseLine = baseLines[i] !== undefined ? baseLines[i] : "";
		const input1Line = input1Lines[i] !== undefined ? input1Lines[i] : "";
		const input2Line = input2Lines[i] !== undefined ? input2Lines[i] : "";

		// In sequential mode: compare base→input1 and input1→input2
		const baseToInput1Changed = baseLine !== input1Line;
		const input1ToInput2Changed = input1Line !== input2Line;

		let conflictType: ConflictType;

		if (baseToInput1Changed && input1ToInput2Changed) {
			// Both transitions changed
			conflictType = ConflictType.TRUE_CONFLICT;
		} else if (baseToInput1Changed) {
			// Only base→input1 changed
			conflictType = ConflictType.INPUT1_ONLY;
		} else if (input1ToInput2Changed) {
			// Only input1→input2 changed
			conflictType = ConflictType.INPUT2_ONLY;
		} else {
			// No changes
			continue;
		}

		allChanges.push({
			line: i + 1,
			input1Changed: baseToInput1Changed,
			input2Changed: input1ToInput2Changed,
			baseLine,
			input1Line,
			input2Line,
			conflictType,
		});
	}

	// Group consecutive changes with the SAME conflict type into ranges
	if (allChanges.length === 0) {
		return [];
	}

	let rangeStart = allChanges[0]?.line ?? 1;
	let currentConflictType = allChanges[0]?.conflictType;
	let input1DiffsInRange: { line: number }[] = [];
	let input2DiffsInRange: { line: number }[] = [];

	for (let i = 0; i <= allChanges.length; i++) {
		const current = allChanges[i];
		const isLast = i === allChanges.length;
		const isGap = !isLast && current && allChanges[i - 1] && current.line > (allChanges[i - 1]?.line ?? 0) + 1;
		const typeChanged = !isLast && current && current.conflictType !== currentConflictType;

		if (isLast || isGap || typeChanged) {
			// End of range
			const prevChange = allChanges[i - 1];
			const rangeEnd = prevChange ? prevChange.line + 1 : rangeStart + 1;

			const hasInput1Changes = input1DiffsInRange.length > 0;
			const hasInput2Changes = input2DiffsInRange.length > 0;
			const isConflicting = currentConflictType === ConflictType.TRUE_CONFLICT;

			const range: ModifiedBaseRange = {
				id: `conflict-${baseRanges.length}`,
				baseRange: {
					startLineNumber: rangeStart,
					endLineNumberExclusive: rangeEnd,
				},
				input1Range: {
					startLineNumber: rangeStart,
					endLineNumberExclusive: rangeEnd,
				},
				input2Range: {
					startLineNumber: rangeStart,
					endLineNumberExclusive: rangeEnd,
				},
				input1Diffs: input1DiffsInRange,
				input2Diffs: input2DiffsInRange,
				isConflicting,
				conflictType: currentConflictType,
				// Default: accept input2 (final state) by default
				input1State: hasInput1Changes ? InputState.first : InputState.excluded,
				input2State: hasInput2Changes ? InputState.first : InputState.excluded,
				handled: false,
				focused: false,
			};

			baseRanges.push(range);

			// Start new range
			if (!isLast && current) {
				rangeStart = current.line;
				currentConflictType = current.conflictType;
				input1DiffsInRange = [];
				input2DiffsInRange = [];
			}
		}

		if (!isLast && current) {
			if (current.input1Changed) {
				input1DiffsInRange.push({ line: current.line });
			}
			if (current.input2Changed) {
				input2DiffsInRange.push({ line: current.line });
			}
		}
	}

	return baseRanges;
}

/**
 * Information about a conflict resolution issue
 */
export interface ConflictIssue {
	conflictId: string;
	conflictPath: string;
	type: "error" | "warning" | "smart-merge";
	message: string;
	startLine: number;
	endLine: number;
}

/**
 * Result of building merged content with validation
 */
export interface BuildResultContentResult {
	content: string;
	isValid: boolean;
	validationError?: string;
	warnings?: string[];
	conflictIssues?: ConflictIssue[];
}

/**
 * Set a value at a given JSON Pointer path in an object
 * @param obj - The object to modify
 * @param path - JSON Pointer path (e.g., "/items/0/name")
 * @param value - Value to set
 * @throws Error if path is invalid or types don't match
 */
export function setValueAtPath(obj: unknown, path: string, value: unknown): void {
	if (!path || path === "/") {
		// Setting root - replace entire object
		if (
			typeof obj === "object" &&
			obj !== null &&
			!Array.isArray(obj) &&
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value)
		) {
			Object.assign(obj, value);
			return;
		}
		throw new Error(`Cannot assign root value: expected object, got ${typeof value}`);
	}

	const pathSegments = path.split("/").filter((s) => s !== "");
	let current: Record<string, unknown> | unknown[] = obj as Record<string, unknown> | unknown[];

	for (let i = 0; i < pathSegments.length - 1; i++) {
		const segment = pathSegments[i];
		// Check if segment is numeric (array index)
		const numericIndex = Number.parseInt(segment, 10);
		if (!Number.isNaN(numericIndex) && String(numericIndex) === segment) {
			// Array index
			if (!Array.isArray(current)) {
				throw new Error(`Path ${path}: segment ${segment} expects array but got ${typeof current}`);
			}
			current = current[numericIndex] as Record<string, unknown> | unknown[];
		} else {
			// Object key
			if (!current || typeof current !== "object" || Array.isArray(current)) {
				throw new Error(`Path ${path}: segment ${segment} expects object but got ${typeof current}`);
			}
			const objCurrent = current as Record<string, unknown>;
			if (!(segment in objCurrent)) {
				objCurrent[segment] = {};
			}
			current = objCurrent[segment] as Record<string, unknown> | unknown[];
		}
	}

	const lastSegment = pathSegments[pathSegments.length - 1];
	const lastNumeric = Number.parseInt(lastSegment, 10);
	if (!Number.isNaN(lastNumeric) && String(lastNumeric) === lastSegment) {
		// Setting array element
		if (!Array.isArray(current)) {
			throw new Error(`Path ${path}: last segment expects array but got ${typeof current}`);
		}
		current[lastNumeric] = value;
	} else {
		// Setting object property
		if (!current || typeof current !== "object" || Array.isArray(current)) {
			throw new Error(`Path ${path}: last segment expects object but got ${typeof current}`);
		}
		(current as Record<string, unknown>)[lastSegment] = value;
	}
}

/**
 * Find line numbers for a JSON path in formatted JSON text
 * @param jsonContent - Formatted JSON string
 * @param path - JSON Pointer path
 * @returns Line number range or null if path not found
 */
export function findLinesForPath(jsonContent: string, path: string): { startLine: number; endLine: number } | null {
	try {
		const tree = parseTree(jsonContent);
		if (!tree) return null;

		// Navigate to the path
		const segments = path
			.split("/")
			.filter((s) => s !== "")
			.map((segment) => {
				// Check if segment is a numeric array index
				const numericValue = Number.parseInt(segment, 10);
				return !Number.isNaN(numericValue) && String(numericValue) === segment ? numericValue : segment;
			});
		const node = findNodeAtLocation(tree, segments);

		if (!node) return null;

		const lines = jsonContent.substring(0, node.offset).split("\n");
		const startLine = lines.length;

		const endOffset = node.offset + node.length;
		const endLines = jsonContent.substring(0, endOffset).split("\n");
		const endLine = endLines.length;

		return { startLine, endLine };
	} catch {
		return null;
	}
}

/**
 * Attempt to smart-merge two JSON values based on their types and schema
 * Returns the merged value or null if merge is not possible
 */
export function smartMergeValues(value1: unknown, value2: unknown, schema?: JSONSchema, path = ""): unknown | null {
	// If values are identical, return either one
	if (JSON.stringify(value1) === JSON.stringify(value2)) {
		return value1;
	}

	// If both are objects (not arrays), attempt deep merge
	if (
		value1 !== null &&
		value2 !== null &&
		typeof value1 === "object" &&
		typeof value2 === "object" &&
		!Array.isArray(value1) &&
		!Array.isArray(value2)
	) {
		const obj1 = value1 as Record<string, unknown>;
		const obj2 = value2 as Record<string, unknown>;
		const merged = { ...obj1 };

		// Get schema for this object if available
		const objectSchema = schema ? getSchemaAtPath(schema, path, value1) : null;

		const properties =
			objectSchema?.properties && typeof objectSchema.properties === "object" && !Array.isArray(objectSchema.properties)
				? (objectSchema.properties as Record<string, JSONSchema>)
				: undefined;
		const additionalProperties = objectSchema?.additionalProperties;

		for (const key of Object.keys(obj2)) {
			if (!(key in merged)) {
				// Key only in value2 - add it if allowed by schema
				const isAllowed = additionalProperties === true || additionalProperties === undefined || properties?.[key] !== undefined;

				if (isAllowed) {
					merged[key] = obj2[key];
				} else if (additionalProperties === false) {
					// Schema explicitly disallows additional properties - conflict
					return null;
				} else if (typeof additionalProperties === "object") {
					// additionalProperties is a schema - allow it
					merged[key] = obj2[key];
				} else {
					// Unknown case - be safe and don't allow
					return null;
				}
			} else if (JSON.stringify(merged[key]) !== JSON.stringify(obj2[key])) {
				// Key exists in both but with different values
				// Get schema for this property
				const propertySchema = properties?.[key];
				const nestedPath = path ? `${path}/${key}` : `/${key}`;

				// Try to recursively merge
				const recursiveMerge = smartMergeValues(merged[key], obj2[key], propertySchema, nestedPath);
				if (recursiveMerge !== null) {
					merged[key] = recursiveMerge;
				} else {
					// Cannot merge - conflict remains
					return null;
				}
			}
			// If values are identical, keep the existing value
		}

		return merged;
	}

	// If both are arrays with same length, could potentially merge items
	// But this is complex and may not make sense without schema guidance
	// For now, return null to indicate merge not possible

	// Cannot merge - different types or incompatible values
	return null;
}

/**
 * Build result content from conflict ranges based on their states
 * Legacy version without validation - kept for backward compatibility
 */
export function buildResultContent(
	baseLines: string[],
	input1Lines: string[],
	input2Lines: string[],
	conflicts: ModifiedBaseRange[],
): string {
	const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, conflicts);
	return result.content;
}

/**
 * Build result content from conflict ranges based on their states
 * Returns validation information along with the merged content
 */
export function buildResultContentWithValidation(
	baseLines: string[],
	input1Lines: string[],
	input2Lines: string[],
	conflicts: ModifiedBaseRange[],
	schema?: JSONSchema,
): BuildResultContentResult {
	const warnings: string[] = [];
	const conflictIssues: ConflictIssue[] = [];

	// Parse full documents for semantic merging
	const baseText = baseLines.join("\n");
	const input1Text = input1Lines.join("\n");
	const input2Text = input2Lines.join("\n");

	let baseData: unknown;
	let input1Data: unknown;
	let input2Data: unknown;

	try {
		baseData = baseText ? JSON.parse(baseText) : {};
		input1Data = input1Text ? JSON.parse(input1Text) : {};
		input2Data = input2Text ? JSON.parse(input2Text) : {};
	} catch (e) {
		return {
			content: baseText || "",
			isValid: false,
			validationError: `Failed to parse input JSON: ${e instanceof Error ? e.message : String(e)}`,
			warnings,
		};
	}

	// Build result JSON semantically from parsed data
	// Start with base and apply changes based on conflict resolution
	let resultData: unknown;

	// If base is empty, start with input2 (ours) as default
	if (!baseData || (typeof baseData === "object" && baseData !== null && Object.keys(baseData).length === 0)) {
		resultData = JSON.parse(JSON.stringify(input2Data)); // Deep clone
	} else {
		resultData = JSON.parse(JSON.stringify(baseData)); // Deep clone base
	}

	// Track which paths we've already applied to avoid duplicates
	const appliedPaths = new Set<string>();
	// Track which properties have been explicitly set (to avoid overwriting when merging parents)
	const explicitlySetProperties = new Set<string>();
	// Track which parent paths have been merged (to avoid merging same parent multiple times)
	const mergedParents = new Set<string>();

	// Helper function to find path from line range
	const findPathFromLines = (_startLine: number, _endLine: number, _text: string): string | null => {
		// This is a simplified approach - for full implementation, we'd need to map lines to JSON paths
		// For now, if we can't determine path, we'll use line-based merge
		return null;
	};

	// Apply each conflict resolution to the result data
	for (const conflict of conflicts) {
		const includesInput1 = conflict.input1State === InputState.first || conflict.input1State === InputState.second;
		const includesInput2 = conflict.input2State === InputState.first || conflict.input2State === InputState.second;

		// If no path is available, try to infer it or use line-based merge
		let conflictPath = conflict.path;
		if (!conflictPath) {
			// Try to find path from the line range
			conflictPath =
				findPathFromLines(conflict.baseRange.startLineNumber, conflict.baseRange.endLineNumberExclusive, baseText) || undefined;

			// If we still don't have a path, use a fallback strategy: merge the entire document
			// by applying conflict resolution based on conflict type and input states
			if (!conflictPath) {
				// For conflicts without paths, determine which input to use based on conflict type
				if (conflict.conflictType === ConflictType.INPUT2_ONLY && includesInput2) {
					// INPUT2_ONLY with input2 accepted - use input2
					resultData = JSON.parse(JSON.stringify(input2Data));
				} else if (conflict.conflictType === ConflictType.INPUT1_ONLY && includesInput1) {
					// INPUT1_ONLY with input1 accepted - use input1
					resultData = JSON.parse(JSON.stringify(input1Data));
				} else if (conflict.conflictType === ConflictType.SAME_CHANGE && (includesInput1 || includesInput2)) {
					// SAME_CHANGE - both are the same, use input2
					resultData = JSON.parse(JSON.stringify(input2Data));
				} else if (includesInput2) {
					// If input2 is accepted, prefer it
					resultData = JSON.parse(JSON.stringify(input2Data));
				} else if (includesInput1) {
					// If input1 is accepted, use it
					resultData = JSON.parse(JSON.stringify(input1Data));
				}
				// Otherwise keep resultData as is (base or previously set value)
				continue;
			}
		}

		try {
			let valueToApply: unknown;
			let pathToApply = conflictPath;

			// Detect if this conflict affects an array - check if path contains array index
			// Pattern: /some/path/\d+/property or /some/path/\d+
			const arrayItemMatch = conflict.path?.match(/^(.*\/\d+)(?:\/.*)?$/);
			let isArrayItemConflict = false;
			let arrayPath = "";

			if (arrayItemMatch) {
				// This is an array item conflict
				// Extract the array path (parent of the numeric index)
				const fullItemPath = arrayItemMatch[1]; // e.g., "/itemsLimits/item/2"
				const segments = fullItemPath.split("/").filter((s) => s !== "");
				if (segments.length >= 2) {
					const lastSegment = segments[segments.length - 1];
					if (/^\d+$/.test(lastSegment)) {
						// Last segment is numeric - this is an array item
						isArrayItemConflict = true;
						arrayPath = `/${segments.slice(0, -1).join("/")}`; // e.g., "/itemsLimits/item"
					}
				}
			}

			if (includesInput1 && includesInput2) {
				// Both accepted
				if (conflict.conflictType === ConflictType.SAME_CHANGE) {
					// Same change - use input2 (or input1, they're identical)
					if (isArrayItemConflict) {
						// Get the entire array from input2
						valueToApply = getValueAtPath(input2Data as Record<string, unknown>, arrayPath);
						pathToApply = arrayPath;
					} else {
						valueToApply = getValueAtPath(input2Data as Record<string, unknown>, conflictPath);
					}
				} else {
					// TRUE_CONFLICT with both accepted - attempt smart merge
					const extractPath = isArrayItemConflict ? arrayPath : conflictPath;
					const input1Value = getValueAtPath(input1Data as Record<string, unknown>, extractPath);
					const input2Value = getValueAtPath(input2Data as Record<string, unknown>, extractPath);

					// Get schema for this conflict path if available
					const conflictSchema =
						schema && baseData && typeof baseData === "object"
							? getSchemaAtPath(schema, extractPath, baseData) || undefined
							: undefined;

					const mergedValue = smartMergeValues(input1Value, input2Value, conflictSchema, extractPath);

					if (mergedValue !== null) {
						valueToApply = mergedValue;
						pathToApply = extractPath;
						warnings.push(`Smart-merged conflict at path ${extractPath}`);
					} else {
						// Merge failed - prefer input2 (ours) as default
						valueToApply = input2Value;
						pathToApply = extractPath;
						warnings.push(`Merge failed at path ${extractPath}, using input2 value`);
					}
				}
			} else if (includesInput1) {
				// Only input1 accepted
				if (isArrayItemConflict) {
					valueToApply = getValueAtPath(input1Data as Record<string, unknown>, arrayPath);
					pathToApply = arrayPath;
				} else {
					// For nested properties, merge parent object but preserve explicitly set properties
					const pathSegments = conflictPath.split("/").filter(Boolean);
					if (pathSegments.length > 1) {
						const parentPath = `/${pathSegments.slice(0, -1).join("/")}`;
						// Only merge parent if we haven't merged it yet
						if (!mergedParents.has(parentPath)) {
							const parentInInput1 = getValueAtPath(input1Data as Record<string, unknown>, parentPath);
							if (typeof parentInInput1 === "object" && parentInInput1 !== null && !Array.isArray(parentInInput1)) {
								const currentParent = getValueAtPath(resultData as Record<string, unknown>, parentPath);
								if (typeof currentParent === "object" && currentParent !== null && !Array.isArray(currentParent)) {
									// Merge parent, but preserve properties already explicitly set
									for (const [key, value] of Object.entries(parentInInput1)) {
										const childPath = `${parentPath}/${key}`;
										if (!explicitlySetProperties.has(childPath)) {
											(currentParent as Record<string, unknown>)[key] = value;
										}
									}
									mergedParents.add(parentPath);
								}
							}
						}
						valueToApply = getValueAtPath(input1Data as Record<string, unknown>, conflictPath);
					} else {
						valueToApply = getValueAtPath(input1Data as Record<string, unknown>, conflictPath);
					}
				}
			} else if (includesInput2) {
				// Only input2 accepted
				if (isArrayItemConflict) {
					valueToApply = getValueAtPath(input2Data as Record<string, unknown>, arrayPath);
					pathToApply = arrayPath;
				} else {
					// For nested properties, merge parent object but preserve explicitly set properties
					const pathSegments = conflictPath.split("/").filter(Boolean);
					if (pathSegments.length > 1) {
						const parentPath = `/${pathSegments.slice(0, -1).join("/")}`;
						// Only merge parent if we haven't merged it yet
						if (!mergedParents.has(parentPath)) {
							const parentInInput2 = getValueAtPath(input2Data as Record<string, unknown>, parentPath);
							if (typeof parentInInput2 === "object" && parentInInput2 !== null && !Array.isArray(parentInInput2)) {
								const currentParent = getValueAtPath(resultData as Record<string, unknown>, parentPath);
								if (typeof currentParent === "object" && currentParent !== null && !Array.isArray(currentParent)) {
									// Merge parent, but preserve properties already explicitly set
									for (const [key, value] of Object.entries(parentInInput2)) {
										const childPath = `${parentPath}/${key}`;
										if (!explicitlySetProperties.has(childPath)) {
											(currentParent as Record<string, unknown>)[key] = value;
										}
									}
									mergedParents.add(parentPath);
								}
							}
						}
						valueToApply = getValueAtPath(input2Data as Record<string, unknown>, conflictPath);
					} else {
						valueToApply = getValueAtPath(input2Data as Record<string, unknown>, conflictPath);
					}
				}
			} else {
				// Neither accepted - keep base value (or remove if it was added)
				const extractPath = isArrayItemConflict ? arrayPath : conflictPath;
				const baseValue = getValueAtPath(baseData as Record<string, unknown>, extractPath);
				if (baseValue !== undefined) {
					valueToApply = baseValue;
					pathToApply = extractPath;
				} else {
					// Property doesn't exist in base - remove it from result
					// For now, we'll just skip it and let the final JSON stringify handle it
					continue;
				}
			}

			// Apply the value to result data
			if (valueToApply !== undefined) {
				// Always set the value at the specific path
				setValueAtPath(resultData, pathToApply, valueToApply);

				// Track that we've applied this specific path
				appliedPaths.add(pathToApply);
				// Mark this property as explicitly set (so parent merges don't overwrite it)
				explicitlySetProperties.add(pathToApply);
			}
		} catch (e) {
			warnings.push(`Failed to apply conflict at path ${conflictPath || conflict.id}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// Convert result data to JSON string
	const content = JSON.stringify(resultData, null, 2);

	// Now that we have the final content, map conflict issues to line numbers
	for (const conflict of conflicts) {
		const conflictPath = conflict.path;
		if (!conflictPath) continue;

		const includesInput1 = conflict.input1State === InputState.first || conflict.input1State === InputState.second;
		const includesInput2 = conflict.input2State === InputState.first || conflict.input2State === InputState.second;

		// Check if this conflict has both inputs checked (potential for issues)
		if (includesInput1 && includesInput2 && conflict.conflictType === ConflictType.TRUE_CONFLICT) {
			// For TRUE_CONFLICT with both checkboxes checked, always show warning
			// because the system made an arbitrary choice and the user should review it
			const lineInfo = findLinesForPath(content, conflictPath);
			if (lineInfo) {
				conflictIssues.push({
					conflictId: conflict.id,
					conflictPath: conflictPath,
					type: "warning",
					message: "Both conflicting changes were accepted - please review and manually resolve",
					startLine: lineInfo.startLine,
					endLine: lineInfo.endLine,
				});
			}
		}
	}

	// Validate the result is valid JSON
	let isValid = true;
	let validationError: string | undefined;

	try {
		JSON.parse(content);
	} catch (e) {
		isValid = false;
		validationError = e instanceof Error ? e.message : "Invalid JSON";

		// Add a general error issue
		conflictIssues.push({
			conflictId: "validation-error",
			conflictPath: "/",
			type: "error",
			message: validationError,
			startLine: 1,
			endLine: content.split("\n").length,
		});
	}

	return {
		content,
		isValid,
		validationError,
		warnings: warnings.length > 0 ? warnings : undefined,
		conflictIssues: conflictIssues.length > 0 ? conflictIssues : undefined,
	};
}
