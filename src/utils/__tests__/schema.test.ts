import { describe, expect, it } from "vitest";
import type { JSONSchema } from "../../types";
import { chooseSubschemaSync, getSchemaVariants, getSubschemaKeyword, hasSchemaVariants } from "../schema";

describe("schema.ts - Schema Utility Functions", () => {
	describe("hasSchemaVariants()", () => {
		it("should return true for schema with oneOf", () => {
			const schema: JSONSchema = {
				oneOf: [{ type: "string" }, { type: "number" }],
			};
			expect(hasSchemaVariants(schema)).toBe(true);
		});

		it("should return true for schema with anyOf", () => {
			const schema: JSONSchema = {
				anyOf: [{ type: "string" }, { type: "number" }],
			};
			expect(hasSchemaVariants(schema)).toBe(true);
		});

		it("should return true for schema with allOf", () => {
			const schema: JSONSchema = {
				allOf: [{ type: "object" }, { properties: { id: { type: "number" } } }],
			};
			expect(hasSchemaVariants(schema)).toBe(true);
		});

		it("should return false for schema without variants", () => {
			const schema: JSONSchema = {
				type: "object",
				properties: { name: { type: "string" } },
			};
			expect(hasSchemaVariants(schema)).toBe(false);
		});

		it("should return false for empty schema", () => {
			const schema: JSONSchema = {};
			expect(hasSchemaVariants(schema)).toBe(false);
		});
	});

	describe("getSchemaVariants()", () => {
		it("should return oneOf variants", () => {
			const schema: JSONSchema = {
				oneOf: [{ type: "string" }, { type: "number" }],
			};
			const variants = getSchemaVariants(schema);
			expect(variants).toHaveLength(2);
			expect(variants?.[0]).toEqual({ type: "string" });
			expect(variants?.[1]).toEqual({ type: "number" });
		});

		it("should return anyOf variants", () => {
			const schema: JSONSchema = {
				anyOf: [{ type: "string" }, { type: "boolean" }],
			};
			const variants = getSchemaVariants(schema);
			expect(variants).toHaveLength(2);
			expect(variants?.[0]).toEqual({ type: "string" });
			expect(variants?.[1]).toEqual({ type: "boolean" });
		});

		it("should return allOf variants", () => {
			const schema: JSONSchema = {
				allOf: [{ type: "object" }, { properties: { id: { type: "number" } } }],
			};
			const variants = getSchemaVariants(schema);
			expect(variants).toHaveLength(2);
		});

		it("should return undefined for schema without variants", () => {
			const schema: JSONSchema = {
				type: "string",
			};
			const variants = getSchemaVariants(schema);
			expect(variants).toBeUndefined();
		});

		it("should prioritize oneOf over anyOf", () => {
			const schema: JSONSchema = {
				oneOf: [{ type: "string" }],
				anyOf: [{ type: "number" }],
			};
			const variants = getSchemaVariants(schema);
			expect(variants).toHaveLength(1);
			expect(variants?.[0]).toEqual({ type: "string" });
		});

		it("should return undefined for non-array variants", () => {
			const schema: JSONSchema = {
				oneOf: "invalid" as unknown as JSONSchema["oneOf"],
			};
			const variants = getSchemaVariants(schema);
			expect(variants).toBeUndefined();
		});
	});

	describe("getSubschemaKeyword()", () => {
		it('should return "oneOf" for oneOf schema', () => {
			const schema: JSONSchema = {
				oneOf: [{ type: "string" }],
			};
			expect(getSubschemaKeyword(schema)).toBe("oneOf");
		});

		it('should return "anyOf" for anyOf schema', () => {
			const schema: JSONSchema = {
				anyOf: [{ type: "string" }],
			};
			expect(getSubschemaKeyword(schema)).toBe("anyOf");
		});

		it('should return "allOf" for allOf schema', () => {
			const schema: JSONSchema = {
				allOf: [{ type: "object" }],
			};
			expect(getSubschemaKeyword(schema)).toBe("allOf");
		});

		it("should return empty string for schema without variants", () => {
			const schema: JSONSchema = {
				type: "string",
			};
			expect(getSubschemaKeyword(schema)).toBe("");
		});

		it("should prioritize oneOf when multiple keywords present", () => {
			const schema: JSONSchema = {
				oneOf: [{ type: "string" }],
				anyOf: [{ type: "number" }],
				allOf: [{ type: "boolean" }],
			};
			expect(getSubschemaKeyword(schema)).toBe("oneOf");
		});

		it("should prioritize anyOf over allOf", () => {
			const schema: JSONSchema = {
				anyOf: [{ type: "number" }],
				allOf: [{ type: "boolean" }],
			};
			expect(getSubschemaKeyword(schema)).toBe("anyOf");
		});
	});

	describe("chooseSubschemaSync()", () => {
		describe("✓ Null data handling", () => {
			it("should choose variant with const: null for null data", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { const: null }, { type: "object" }];
				const result = chooseSubschemaSync(null, variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ const: null });
			});

			it("should default to first variant if no null const match", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }];
				const result = chooseSubschemaSync(null, variants, "oneOf");
				expect(result.selectedIndex).toBe(0);
				expect(result.schema).toEqual({ type: "string" });
			});
		});

		describe("✓ Type matching", () => {
			it("should choose string type variant for string data", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }, { type: "boolean" }];
				const result = chooseSubschemaSync("hello", variants, "oneOf");
				expect(result.selectedIndex).toBe(0);
				expect(result.schema).toEqual({ type: "string" });
			});

			it("should choose number type variant for number data", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }, { type: "boolean" }];
				const result = chooseSubschemaSync(42, variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ type: "number" });
			});

			it("should choose boolean type variant for boolean data", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }, { type: "boolean" }];
				const result = chooseSubschemaSync(true, variants, "oneOf");
				expect(result.selectedIndex).toBe(2);
				expect(result.schema).toEqual({ type: "boolean" });
			});

			it("should choose object type variant for object data", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "object", properties: { id: { type: "number" } } }];
				const result = chooseSubschemaSync({ id: 1 }, variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema.type).toBe("object");
			});

			it("should choose array type variant for array data", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "array", items: { type: "number" } }];
				const result = chooseSubschemaSync([1, 2, 3], variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema.type).toBe("array");
			});
		});

		describe("✓ Const matching", () => {
			it("should choose variant with matching const value", () => {
				const variants: JSONSchema[] = [{ const: "option1" }, { const: "option2" }, { const: "option3" }];
				const result = chooseSubschemaSync("option2", variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ const: "option2" });
			});

			it("should choose variant with const: false for false data", () => {
				const variants: JSONSchema[] = [{ const: true }, { const: false }];
				const result = chooseSubschemaSync(false, variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ const: false });
			});

			it("should choose variant with const: 0 for zero data", () => {
				const variants: JSONSchema[] = [{ const: 1 }, { const: 0 }, { const: -1 }];
				const result = chooseSubschemaSync(0, variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ const: 0 });
			});

			it('should choose variant with const: "" for empty string', () => {
				const variants: JSONSchema[] = [{ const: "non-empty" }, { const: "" }];
				const result = chooseSubschemaSync("", variants, "oneOf");
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ const: "" });
			});
		});

		describe("✓ Priority: const over type", () => {
			it("should prioritize const match over type match", () => {
				const variants: JSONSchema[] = [
					{ type: "string" }, // Would match by type
					{ const: "specific" }, // Should match by const (higher priority)
				];
				const result = chooseSubschemaSync("specific", variants, "oneOf");
				// Const matching should be checked before type matching
				// So 'specific' should match variant at index 1 (const), not index 0 (type)
				expect(result.selectedIndex).toBe(1);
				expect(result.schema).toEqual({ const: "specific" });
			});
		});

		describe("✓ Default fallback", () => {
			it("should default to first variant if no match", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }];
				const result = chooseSubschemaSync({ unknown: "type" }, variants, "oneOf");
				expect(result.selectedIndex).toBe(0);
				expect(result.schema).toEqual({ type: "string" });
			});

			it("should handle empty variants array", () => {
				const variants: JSONSchema[] = [{ type: "string" }];
				const result = chooseSubschemaSync("data", variants, "oneOf");
				expect(result.selectedIndex).toBe(0);
			});
		});

		describe("✓ Schema keyword parameter", () => {
			it("should work with oneOf keyword", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }];
				const result = chooseSubschemaSync("test", variants, "oneOf");
				expect(result.selectedIndex).toBe(0);
			});

			it("should work with anyOf keyword", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }];
				const result = chooseSubschemaSync("test", variants, "anyOf");
				expect(result.selectedIndex).toBe(0);
			});

			it("should work with allOf keyword", () => {
				const variants: JSONSchema[] = [{ type: "string" }, { type: "number" }];
				const result = chooseSubschemaSync("test", variants, "allOf");
				expect(result.selectedIndex).toBe(0);
			});

			it("should default to oneOf if keyword not provided", () => {
				const variants: JSONSchema[] = [{ type: "string" }];
				const result = chooseSubschemaSync("test", variants);
				expect(result.selectedIndex).toBe(0);
			});
		});

		describe("✓ Complex scenarios", () => {
			it("should handle discriminator pattern (oneOf with const)", () => {
				// Common pattern for discriminated unions
				const variants: JSONSchema[] = [
					{
						type: "object",
						properties: {
							type: { const: "gem" },
							count: { type: "number" },
						},
					},
					{
						type: "object",
						properties: {
							type: { const: "coin" },
							amount: { type: "number" },
						},
					},
				];

				const gemData = { type: "gem", count: 100 };
				const result = chooseSubschemaSync(gemData, variants, "oneOf");

				// Should choose object type (first match)
				expect(result.selectedIndex).toBe(0);
			});

			it("should handle nested schema structures", () => {
				const variants: JSONSchema[] = [
					{
						type: "object",
						properties: {
							user: {
								type: "object",
								properties: {
									id: { type: "number" },
								},
							},
						},
					},
					{
						type: "array",
						items: { type: "string" },
					},
				];

				const data = { user: { id: 1 } };
				const result = chooseSubschemaSync(data, variants, "oneOf");

				expect(result.selectedIndex).toBe(0);
				expect(result.schema.type).toBe("object");
			});
		});
	});

	describe("Integration: Schema variant functions", () => {
		it("should work together in a typical flow", () => {
			const schema: JSONSchema = {
				oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
			};

			// Check if has variants
			expect(hasSchemaVariants(schema)).toBe(true);

			// Get the variants
			const variants = getSchemaVariants(schema) as JSONSchema[];
			expect(variants).toBeDefined();
			expect(variants).toHaveLength(3);

			// Get the keyword
			const keyword = getSubschemaKeyword(schema);
			expect(keyword).toBe("oneOf");

			// Choose appropriate subschema
			const data = 42;
			const result = chooseSubschemaSync(data, variants, keyword);
			expect(result.selectedIndex).toBe(1);
			expect(result.schema).toEqual({ type: "number" });
		});

		it("should handle schema without variants", () => {
			const schema: JSONSchema = {
				type: "object",
				properties: {
					name: { type: "string" },
				},
			};

			expect(hasSchemaVariants(schema)).toBe(false);
			expect(getSchemaVariants(schema)).toBeUndefined();
			expect(getSubschemaKeyword(schema)).toBe("");
		});
	});
});
