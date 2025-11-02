import type { JSONSchema } from "../types";

const ONE_OF = "oneOf";
const ANY_OF = "anyOf";
const ALL_OF = "allOf";

export function hasSchemaVariants(schema: JSONSchema): boolean {
	return !!(schema[ONE_OF] || schema[ANY_OF] || schema[ALL_OF]);
}

export function getSchemaVariants(schema: JSONSchema): JSONSchema[] | undefined {
	const variants = schema[ONE_OF] || schema[ANY_OF] || schema[ALL_OF];
	return Array.isArray(variants) ? (variants as JSONSchema[]) : undefined;
}

export function getSubschemaKeyword(schema: JSONSchema): string {
	if (schema.oneOf) return ONE_OF;
	if (schema.anyOf) return ANY_OF;
	if (schema.allOf) return ALL_OF;
	return "";
}

/**
 * Find common discriminator field across all variants
 * Returns the field name that has const values in variants and exists in data
 */
function findCommonDiscriminatorField(variants: JSONSchema[], data: unknown): { field: string; value: unknown } | null {
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return null;
	}

	const obj = data as Record<string, unknown>;

	// Find fields that have const values in at least one variant
	const discriminatorFields = new Set<string>();

	for (const variant of variants) {
		const props = variant.properties;
		if (props) {
			for (const [field, propSchema] of Object.entries(props)) {
				if (propSchema && typeof propSchema === "object" && "const" in propSchema) {
					discriminatorFields.add(field);
				}
			}
		}
	}

	// Check which discriminator field exists in the data
	for (const field of discriminatorFields) {
		if (field in obj) {
			return { field, value: obj[field] };
		}
	}

	return null;
}

/**
 * Synchronous version of chooseSubschema for use in non-async contexts
 * Enhanced to handle object discriminators and const values
 */
export function chooseSubschemaSync(
	data: unknown,
	variants: JSONSchema[],
	_schemaKeyword: string = ONE_OF,
): { selectedIndex: number; schema: JSONSchema } {
	if (variants.length === 0) {
		throw new Error("No variants provided to chooseSubschemaSync");
	}

	// Handle null
	if (data === null) {
		for (let i = 0; i < variants.length; i++) {
			const variant = variants[i];
			if (variant.const === null) {
				return { selectedIndex: i, schema: variant };
			}
		}
	}

	// For objects, try to match by discriminator fields (const properties)
	if (typeof data === "object" && data !== null && !Array.isArray(data)) {
		const dataObj = data as Record<string, unknown>;

		// First pass: look for discriminator matches
		const discriminator = findCommonDiscriminatorField(variants, data);
		if (discriminator) {
			for (let i = 0; i < variants.length; i++) {
				const variant = variants[i];
				const variantProp = variant.properties?.[discriminator.field] as JSONSchema | undefined;

				if (variantProp && typeof variantProp === "object" && "const" in variantProp && variantProp.const === discriminator.value) {
					return { selectedIndex: i, schema: variant };
				}
			}
		}

		// Second pass: check if object structure matches variant properties
		for (let i = 0; i < variants.length; i++) {
			const variant = variants[i];
			if (variant.type === "object" && variant.properties) {
				// Check if all required properties exist in data
				const required = (variant.required || []) as string[];
				const hasAllRequired = required.every((field: string) => field in dataObj);

				if (hasAllRequired && required.length > 0) {
					// Additional check: see if discriminator fields match
					let discriminatorMatches = true;
					for (const [field, propSchema] of Object.entries(variant.properties)) {
						if (propSchema && typeof propSchema === "object" && "const" in propSchema) {
							const constValue = (propSchema as JSONSchema).const;
							if (dataObj[field] !== constValue) {
								discriminatorMatches = false;
								break;
							}
						}
					}
					if (discriminatorMatches) {
						return { selectedIndex: i, schema: variant };
					}
				}
			}
		}
	}

	// Match by primitive const value (prioritize const over type)
	for (let i = 0; i < variants.length; i++) {
		const variant = variants[i];
		if (variant.const !== undefined && variant.const === data) {
			return { selectedIndex: i, schema: variant };
		}
	}

	// Match by type (after const check)
	for (let i = 0; i < variants.length; i++) {
		const variant = variants[i];
		if (variant.type) {
			const dataType = Array.isArray(data) ? "array" : typeof data;
			const variantType = Array.isArray(variant.type) ? variant.type[0] : variant.type;
			if (variantType === dataType) {
				return { selectedIndex: i, schema: variant };
			}
		}
	}

	// Default to first variant (fallback)
	return { selectedIndex: 0, schema: variants[0] };
}
