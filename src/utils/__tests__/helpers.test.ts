import { describe, expect, it } from "vitest";
import { getValueAtPath, isEqual, sortKeys } from "../helpers";

describe("helpers.ts - Utility Functions", () => {
	describe("getValueAtPath()", () => {
		const testObj = {
			user: {
				id: 1,
				name: "John Doe",
				email: "john@example.com",
				settings: {
					theme: "dark",
					notifications: true,
				},
			},
			items: [
				{ id: "item-1", type: "gem", count: 100 },
				{ id: "item-2", type: "coin", count: 500 },
			],
			nested: {
				deep: {
					value: "found",
				},
			},
		};

		describe("✓ Basic object property access", () => {
			it("should get top-level property with leading slash", () => {
				const result = getValueAtPath(testObj, "/user");
				expect(result).toEqual(testObj.user);
			});

			it("should get top-level property without leading slash", () => {
				const result = getValueAtPath(testObj, "user");
				expect(result).toEqual(testObj.user);
			});

			it("should get nested property", () => {
				const result = getValueAtPath(testObj, "/user/name");
				expect(result).toBe("John Doe");
			});

			it("should get deeply nested property", () => {
				const result = getValueAtPath(testObj, "/user/settings/theme");
				expect(result).toBe("dark");
			});

			it("should get very deep nested property", () => {
				const result = getValueAtPath(testObj, "/nested/deep/value");
				expect(result).toBe("found");
			});
		});

		describe("✓ Array access", () => {
			it("should get array element by index", () => {
				const result = getValueAtPath(testObj, "/items/0");
				expect(result).toEqual({ id: "item-1", type: "gem", count: 100 });
			});

			it("should get property of array element", () => {
				const result = getValueAtPath(testObj, "/items/0/type");
				expect(result).toBe("gem");
			});

			it("should get second array element", () => {
				const result = getValueAtPath(testObj, "/items/1/count");
				expect(result).toBe(500);
			});

			it("should handle bracket notation [0]", () => {
				const result = getValueAtPath(testObj, "/items[0]/id");
				expect(result).toBe("item-1");
			});
		});

		describe("✓ Edge cases", () => {
			it("should return undefined for non-existent path", () => {
				const result = getValueAtPath(testObj, "/nonexistent");
				expect(result).toBeUndefined();
			});

			it("should return undefined for out-of-bounds array index", () => {
				const result = getValueAtPath(testObj, "/items/999");
				expect(result).toBeUndefined();
			});

			it("should return undefined for negative array index", () => {
				const result = getValueAtPath(testObj, "/items/-1");
				expect(result).toBeUndefined();
			});

			it("should return undefined for undefined object", () => {
				const result = getValueAtPath(undefined, "/user/name");
				expect(result).toBeUndefined();
			});

			it("should return undefined when accessing property on non-object", () => {
				const result = getValueAtPath(testObj, "/user/name/invalid");
				expect(result).toBeUndefined();
			});

			it("should handle empty path", () => {
				const result = getValueAtPath(testObj, "");
				expect(result).toEqual(testObj);
			});

			it('should handle root path "/"', () => {
				const result = getValueAtPath(testObj, "/");
				expect(result).toEqual(testObj);
			});
		});

		describe("✓ Path format variations", () => {
			it("should handle paths with dots", () => {
				const result = getValueAtPath(testObj, "user.name");
				expect(result).toBe("John Doe");
			});

			it("should handle mixed slash and dot", () => {
				const result = getValueAtPath(testObj, "/user.settings/theme");
				expect(result).toBe("dark");
			});

			it("should handle array with brackets and dots", () => {
				const result = getValueAtPath(testObj, "items[1].type");
				expect(result).toBe("coin");
			});
		});

		describe("✓ Special values", () => {
			const specialObj = {
				nullValue: null,
				zeroValue: 0,
				falseValue: false,
				emptyString: "",
				emptyArray: [],
				emptyObject: {},
			};

			it("should return null value", () => {
				const result = getValueAtPath(specialObj, "/nullValue");
				expect(result).toBeNull();
			});

			it("should return zero", () => {
				const result = getValueAtPath(specialObj, "/zeroValue");
				expect(result).toBe(0);
			});

			it("should return false", () => {
				const result = getValueAtPath(specialObj, "/falseValue");
				expect(result).toBe(false);
			});

			it("should return empty string", () => {
				const result = getValueAtPath(specialObj, "/emptyString");
				expect(result).toBe("");
			});

			it("should return empty array", () => {
				const result = getValueAtPath(specialObj, "/emptyArray");
				expect(result).toEqual([]);
			});

			it("should return empty object", () => {
				const result = getValueAtPath(specialObj, "/emptyObject");
				expect(result).toEqual({});
			});
		});
	});

	describe("isEqual()", () => {
		describe("✓ Primitive values", () => {
			it("should return true for identical numbers", () => {
				expect(isEqual(42, 42)).toBe(true);
			});

			it("should return false for different numbers", () => {
				expect(isEqual(42, 43)).toBe(false);
			});

			it("should return true for identical strings", () => {
				expect(isEqual("hello", "hello")).toBe(true);
			});

			it("should return false for different strings", () => {
				expect(isEqual("hello", "world")).toBe(false);
			});

			it("should return true for identical booleans", () => {
				expect(isEqual(true, true)).toBe(true);
				expect(isEqual(false, false)).toBe(true);
			});

			it("should return false for different booleans", () => {
				expect(isEqual(true, false)).toBe(false);
			});

			it("should return true for null === null", () => {
				expect(isEqual(null, null)).toBe(true);
			});

			it("should return true for undefined === undefined", () => {
				expect(isEqual(undefined, undefined)).toBe(true);
			});

			it("should return false for null !== undefined", () => {
				expect(isEqual(null, undefined)).toBe(false);
			});
		});

		describe("✓ Object comparison", () => {
			it("should return true for identical objects", () => {
				const obj1 = { a: 1, b: 2 };
				const obj2 = { a: 1, b: 2 };
				expect(isEqual(obj1, obj2)).toBe(true);
			});

			it("should return false for different objects", () => {
				const obj1 = { a: 1, b: 2 };
				const obj2 = { a: 1, b: 3 };
				expect(isEqual(obj1, obj2)).toBe(false);
			});

			it("should return true for nested objects", () => {
				const obj1 = { user: { name: "John", age: 30 } };
				const obj2 = { user: { name: "John", age: 30 } };
				expect(isEqual(obj1, obj2)).toBe(true);
			});

			it("should return false for nested objects with differences", () => {
				const obj1 = { user: { name: "John", age: 30 } };
				const obj2 = { user: { name: "Jane", age: 30 } };
				expect(isEqual(obj1, obj2)).toBe(false);
			});

			it("should handle key order differences", () => {
				const obj1 = { a: 1, b: 2, c: 3 };
				const obj2 = { c: 3, b: 2, a: 1 };
				expect(isEqual(obj1, obj2)).toBe(true);
			});
		});

		describe("✓ Array comparison", () => {
			it("should return true for identical arrays", () => {
				const arr1 = [1, 2, 3];
				const arr2 = [1, 2, 3];
				expect(isEqual(arr1, arr2)).toBe(true);
			});

			it("should return false for different arrays", () => {
				const arr1 = [1, 2, 3];
				const arr2 = [1, 2, 4];
				expect(isEqual(arr1, arr2)).toBe(false);
			});

			it("should return false for arrays with different length", () => {
				const arr1 = [1, 2, 3];
				const arr2 = [1, 2];
				expect(isEqual(arr1, arr2)).toBe(false);
			});

			it("should return false for arrays with different order", () => {
				const arr1 = [1, 2, 3];
				const arr2 = [3, 2, 1];
				expect(isEqual(arr1, arr2)).toBe(false);
			});

			it("should compare nested arrays", () => {
				const arr1 = [
					[1, 2],
					[3, 4],
				];
				const arr2 = [
					[1, 2],
					[3, 4],
				];
				expect(isEqual(arr1, arr2)).toBe(true);
			});

			it("should compare arrays of objects", () => {
				const arr1 = [
					{ id: 1, name: "A" },
					{ id: 2, name: "B" },
				];
				const arr2 = [
					{ id: 1, name: "A" },
					{ id: 2, name: "B" },
				];
				expect(isEqual(arr1, arr2)).toBe(true);
			});
		});

		describe("✓ Complex structures", () => {
			it("should compare complex nested structures", () => {
				const obj1 = {
					user: {
						id: 1,
						profile: {
							name: "John",
							settings: { theme: "dark" },
						},
					},
					items: [{ id: 1, count: 100 }],
				};
				const obj2 = {
					user: {
						id: 1,
						profile: {
							name: "John",
							settings: { theme: "dark" },
						},
					},
					items: [{ id: 1, count: 100 }],
				};
				expect(isEqual(obj1, obj2)).toBe(true);
			});
		});
	});

	describe("sortKeys()", () => {
		describe("✓ Basic sorting", () => {
			it("should sort object keys alphabetically", () => {
				const obj = { c: 3, a: 1, b: 2 };
				const sorted = sortKeys(obj);
				expect(Object.keys(sorted)).toEqual(["a", "b", "c"]);
			});

			it("should preserve values after sorting", () => {
				const obj = { z: 26, a: 1, m: 13 };
				const sorted = sortKeys(obj);
				expect(sorted).toEqual({ a: 1, m: 13, z: 26 });
			});
		});

		describe("✓ Deep sorting", () => {
			it("should sort nested object keys", () => {
				const obj = {
					user: { name: "John", id: 1 },
					settings: { theme: "dark", notifications: true },
				};
				const sorted = sortKeys(obj, { deep: true });

				expect(Object.keys(sorted)).toEqual(["settings", "user"]);
				expect(Object.keys(sorted.settings)).toEqual(["notifications", "theme"]);
				expect(Object.keys(sorted.user)).toEqual(["id", "name"]);
			});

			it("should preserve array order while sorting object keys", () => {
				const obj = {
					items: [
						{ type: "gem", id: 1 },
						{ type: "coin", id: 2 },
					],
				};
				const sorted = sortKeys(obj, { deep: true });

				expect(sorted.items).toHaveLength(2);
				expect(Object.keys(sorted.items[0])).toEqual(["id", "type"]);
				expect(sorted.items[0]).toEqual({ id: 1, type: "gem" });
			});
		});

		describe("✓ Edge cases", () => {
			it("should handle empty objects", () => {
				const obj = {};
				const sorted = sortKeys(obj);
				expect(sorted).toEqual({});
			});

			it("should handle objects with one key", () => {
				const obj = { single: "value" };
				const sorted = sortKeys(obj);
				expect(sorted).toEqual({ single: "value" });
			});

			it("should handle null values", () => {
				const obj = { b: null, a: "value" };
				const sorted = sortKeys(obj);
				expect(sorted).toEqual({ a: "value", b: null });
			});
		});
	});

	describe("Integration: getValueAtPath + isEqual + sortKeys", () => {
		it("should work together for comparison workflow", () => {
			const base = { b: 2, a: 1, nested: { y: 2, x: 1 } };
			const modified = { a: 1, b: 2, nested: { x: 1, y: 2 } };

			// Sort both objects
			const baseSorted = sortKeys(base, { deep: true });
			const modifiedSorted = sortKeys(modified, { deep: true });

			// They should be equal after sorting
			expect(isEqual(baseSorted, modifiedSorted)).toBe(true);

			// Get nested value from both
			const baseNested = getValueAtPath(baseSorted, "/nested");
			const modifiedNested = getValueAtPath(modifiedSorted, "/nested");

			// Nested values should be equal
			expect(isEqual(baseNested, modifiedNested)).toBe(true);
		});

		it("should detect real differences after sorting", () => {
			const obj1 = { b: 2, a: 1, c: { z: 3, y: 2 } };
			const obj2 = { a: 1, b: 2, c: { y: 2, z: 999 } }; // Different value

			const sorted1 = sortKeys(obj1, { deep: true });
			const sorted2 = sortKeys(obj2, { deep: true });

			// Should not be equal
			expect(isEqual(sorted1, sorted2)).toBe(false);

			// Get the differing values
			const val1 = getValueAtPath(sorted1, "/c/z");
			const val2 = getValueAtPath(sorted2, "/c/z");

			expect(val1).toBe(3);
			expect(val2).toBe(999);
			expect(isEqual(val1, val2)).toBe(false);
		});
	});
});
