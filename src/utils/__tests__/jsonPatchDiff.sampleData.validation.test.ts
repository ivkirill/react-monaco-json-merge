import { describe, expect, it } from "vitest";
import { getSampleData } from "../../data/sampleData";
import { ConflictType } from "../../types";
import { computeDiffsJsonPatch } from "../jsonPatchDiff";

/**
 * Validation tests - These tests verify the CORRECT expected behavior
 * based on JSON Schema and semantic diff logic, not just current implementation.
 *
 * These tests may fail if there are bugs in the implementation.
 * Each test documents what SHOULD happen according to schema-aware conflict detection.
 */
describe("jsonPatchDiff - Validation Tests (Expected Correct Behavior)", () => {
	const { base, theirs, ours, schema } = getSampleData();

	describe("1. oneOf Scenario: Payment Method - Expected Behavior", () => {
		it("SHOULD detect payment type change as TRUE_CONFLICT (card -> crypto vs card -> cash)", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Base: { type: "card", number: "...", expiry: "..." }
			// Theirs: { type: "crypto", currency: "BTC", address: "..." }
			// Ours: { type: "cash", amount: 1000, currency: "USD" }

			const paymentConflicts = conflicts.filter((c) => c.path?.startsWith("/payment"));

			// CORRECT BEHAVIOR:
			// Since payment uses oneOf with type as discriminator, the entire payment object
			// changed from one variant (card) to different variants (crypto vs cash).
			// This SHOULD be detected as a TRUE_CONFLICT on the payment object or payment/type field.

			// Check if we have conflicts related to payment/type
			const typeConflict = paymentConflicts.find((c) => c.path === "/payment/type" || c.path === "/payment");

			if (!typeConflict) {
				console.warn("??  POTENTIAL BUG: Payment type change not detected as conflict");
				console.warn("Expected: TRUE_CONFLICT on /payment or /payment/type when card -> crypto vs card -> cash");
				console.warn("Actual payment conflicts:", paymentConflicts);
			}

			// This test documents expected behavior - may fail if implementation has bugs
			expect(typeConflict).toBeDefined();
			expect(typeConflict?.conflictType).toBe(ConflictType.TRUE_CONFLICT);
			expect(typeConflict?.isConflicting).toBe(true);
		});

		it("SHOULD recognize payment structure is completely different (different oneOf variants)", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// The payment objects have completely different properties:
			// - Card: number, expiry
			// - Crypto: currency, address
			// - Cash: amount, currency
			// This indicates different oneOf variants, which should be treated as a single conflict
			// rather than individual field conflicts.

			const paymentConflicts = conflicts.filter((c) => c.path?.startsWith("/payment"));

			// CORRECT BEHAVIOR: Should have a conflict on the payment object itself,
			// not just individual fields, because the entire variant changed.
			const hasPaymentObjectConflict = paymentConflicts.some(
				(c) => c.path === "/payment" && c.conflictType === ConflictType.TRUE_CONFLICT && c.isConflicting === true,
			);

			// Current implementation might detect individual field changes instead
			// This test verifies the correct behavior
			if (!hasPaymentObjectConflict) {
				console.warn("??  POTENTIAL BUG: Payment oneOf variant change detected as field-level conflicts instead of object-level");
				console.warn("Expected: Single TRUE_CONFLICT on /payment for oneOf variant change");
			}

			// This is the expected correct behavior
			expect(hasPaymentObjectConflict).toBe(true);
		});
	});

	describe("2. items/oneOf Scenario: Array Items - Expected Behavior", () => {
		it("SHOULD match array items by id field (not index) when schema provides id", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Base: [{ id: "item-1", count: 100 }, { id: "item-2", count: 500 }]
			// Theirs: [{ id: "item-1", count: 150 }, { id: "item-2", count: 500 }, { id: "item-3", count: 10 }]
			// Ours: [{ id: "item-1", count: 120 }, { id: "item-2", count: 600 }]

			const itemConflicts = conflicts.filter((c) => c.path?.startsWith("/items"));

			// CORRECT BEHAVIOR:
			// Schema-aware matching should match items by their "id" field.
			// The conflict on item-1 count SHOULD be detected as /items/0/count (by matching id, not index).
			// Even if items were reordered, they should still match by id.

			const item1CountConflict = itemConflicts.find((c) => c.path === "/items/0/count");

			if (item1CountConflict) {
				// Verify it's correctly identified as TRUE_CONFLICT
				expect(item1CountConflict.conflictType).toBe(ConflictType.TRUE_CONFLICT);
				expect(item1CountConflict.isConflicting).toBe(true);
			} else {
				console.warn("??  POTENTIAL BUG: Item count conflict not detected or detected at wrong path");
				console.warn("Expected: TRUE_CONFLICT at /items/0/count (matching by id field)");
			}

			expect(item1CountConflict).toBeDefined();
		});

		it("SHOULD handle item reordering correctly (match by id, not index)", () => {
			// Test with reordered items
			const baseReordered = JSON.parse(base);
			const theirsReordered = JSON.parse(theirs);
			const oursReordered = JSON.parse(ours);

			// Reorder items in theirs (same items, different order)
			theirsReordered.items = [
				{ id: "item-2", type: "coin", count: 500 },
				{ id: "item-3", type: "diamond", count: 10 },
				{ id: "item-1", type: "gem", count: 150 }, // Moved to end
			];

			const conflicts = computeDiffsJsonPatch(
				JSON.stringify(baseReordered, null, 2),
				JSON.stringify(theirsReordered, null, 2),
				JSON.stringify(oursReordered, null, 2),
				{
					schema,
					comparisonMode: "split",
				},
			);

			// CORRECT BEHAVIOR:
			// Even though item-1 is at index 2 in theirs, it should still match
			// with item-1 at index 0 in base/ours because we match by id field.
			// The conflict path should still reference the base index or use id-based matching.

			const itemConflicts = conflicts.filter((c) => c.path?.startsWith("/items"));

			// Should still detect the conflict on item-1's count
			// The exact path might vary, but it should reference item-1, not just index
			const hasItem1Conflict = itemConflicts.some(
				(c) =>
					c.path?.includes("item-1") || (c.path?.match(/\/items\/\d+\/count/) && c.conflictType === ConflictType.TRUE_CONFLICT),
			);

			if (!hasItem1Conflict) {
				console.warn("??  POTENTIAL BUG: Schema-aware matching by id not working correctly after reordering");
				console.warn("Expected: Item conflicts should match by id field, even when array order changes");
			}

			expect(hasItem1Conflict).toBe(true);
		});
	});

	describe("3. anyOf Scenario: Permissions - Expected Behavior", () => {
		it("SHOULD match permissions by const value, not array index", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Base: ["read", "write"]
			// Theirs: ["read", "write", "delete", "admin"]
			// Ours: ["read"]

			// CORRECT BEHAVIOR:
			// - "read" exists in all ? no conflict (SAME_CHANGE or no conflict)
			// - "write" exists in base and theirs, removed in ours ? INPUT2_ONLY
			// - "delete" and "admin" added in theirs ? INPUT1_ONLY

			const permissionConflicts = conflicts.filter((c) => c.path?.startsWith("/permissions"));

			// Find the "write" removal conflict
			// Should be detected as conflict on /permissions/1 or based on value matching
			const writeConflict = permissionConflicts.find(
				(c) =>
					c.path === "/permissions/1" || // Base index where "write" is
					c.conflictType === ConflictType.INPUT2_ONLY,
			);

			if (writeConflict) {
				// Should be INPUT2_ONLY (removed in ours)
				expect(writeConflict.conflictType).toBe(ConflictType.INPUT2_ONLY);
			} else {
				console.warn("??  POTENTIAL BUG: Permission removal not detected correctly");
				console.warn("Expected: INPUT2_ONLY for 'write' permission that was removed in ours");
			}

			// Verify new permissions are detected
			const newPermissions = permissionConflicts.filter((c) => c.conflictType === ConflictType.INPUT1_ONLY);
			expect(newPermissions.length).toBeGreaterThanOrEqual(2); // delete and admin
		});
	});

	describe("4. Conflict Type Accuracy - Expected Behavior", () => {
		it("SHOULD mark conflicts as isConflicting=true when both sides changed differently", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// CORRECT BEHAVIOR:
			// TRUE_CONFLICT means both sides changed the same path to different values.
			// These MUST have isConflicting=true.

			const trueConflicts = conflicts.filter((c) => c.conflictType === ConflictType.TRUE_CONFLICT);

			const incorrectlyMarked = trueConflicts.filter((c) => c.isConflicting === false);

			if (incorrectlyMarked.length > 0) {
				console.warn(`??  POTENTIAL BUG: ${incorrectlyMarked.length} TRUE_CONFLICT(s) marked as isConflicting=false`);
				console.warn(
					"Incorrectly marked conflicts:",
					incorrectlyMarked.map((c) => ({ path: c.path, id: c.id })),
				);
				console.warn("Expected: All TRUE_CONFLICT should have isConflicting=true");
			}

			// This is the correct behavior - all TRUE_CONFLICT must be conflicting
			expect(incorrectlyMarked.length).toBe(0);
		});

		it("SHOULD detect user email change as INPUT1_ONLY (only in theirs)", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Base: "john@example.com"
			// Theirs: "john.doe@company.com" (changed)
			// Ours: "john@example.com" (unchanged)

			const emailConflict = conflicts.find((c) => c.path === "/user/email" || c.path?.includes("/email"));

			if (!emailConflict) {
				console.warn("??  POTENTIAL BUG: User email change not detected");
				console.warn("Expected: INPUT1_ONLY at /user/email when only theirs changed");
			} else {
				expect(emailConflict.conflictType).toBe(ConflictType.INPUT1_ONLY);
			}

			expect(emailConflict).toBeDefined();
		});

		it("SHOULD detect user name change as INPUT2_ONLY (only in ours)", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Base: "John Doe"
			// Theirs: "John Doe" (unchanged)
			// Ours: "John Smith" (changed)

			const nameConflict = conflicts.find((c) => c.path === "/user/name" || c.path?.includes("/name"));

			if (!nameConflict) {
				console.warn("??  POTENTIAL BUG: User name change not detected");
				console.warn("Expected: INPUT2_ONLY at /user/name when only ours changed");
			} else {
				expect(nameConflict.conflictType).toBe(ConflictType.INPUT2_ONLY);
			}

			expect(nameConflict).toBeDefined();
		});
	});

	describe("5. Nested Schema Navigation - Expected Behavior", () => {
		it("SHOULD correctly navigate through oneOf/anyOf nested in configuration", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Configuration has:
			// - mode: oneOf (basic/advanced/expert)
			// - features: array of anyOf (feature1/2/3/4)

			const configConflicts = conflicts.filter((c) => c.path?.startsWith("/configuration"));

			// CORRECT BEHAVIOR:
			// - /configuration/mode should show INPUT1_ONLY (advanced -> expert in theirs)
			// - /configuration/features should show conflicts for array changes

			const modeConflict = configConflicts.find((c) => c.path === "/configuration/mode");

			if (!modeConflict) {
				console.warn("??  POTENTIAL BUG: Configuration mode change not detected");
				console.warn("Expected: INPUT1_ONLY at /configuration/mode for oneOf variant change");
			} else {
				expect(modeConflict.conflictType).toBe(ConflictType.INPUT1_ONLY);
			}

			expect(modeConflict).toBeDefined();

			// Features array should have conflicts
			const featuresConflicts = configConflicts.filter((c) => c.path?.startsWith("/configuration/features"));
			expect(featuresConflicts.length).toBeGreaterThan(0);
		});
	});

	describe("6. additionalProperties - Expected Behavior", () => {
		it("SHOULD detect conflicts on dynamic metadata properties", () => {
			const conflicts = computeDiffsJsonPatch(base, theirs, ours, {
				schema,
				comparisonMode: "split",
			});

			// Base: { created: "2024-01-01", customField1: "value1" }
			// Theirs: { ..., customField1: "value1", customField2: "value2", customField3: "value3" }
			// Ours: { ..., customField1: "changed-value1", customField4: "value4" }

			const metadataConflicts = conflicts.filter((c) => c.path?.startsWith("/metadata"));

			// CORRECT BEHAVIOR:
			// - customField1 change: INPUT2_ONLY (changed in ours, unchanged in theirs)
			// - customField2, customField3: INPUT1_ONLY (added in theirs)
			// - customField4: INPUT2_ONLY (added in ours)

			const customField1Conflict = metadataConflicts.find((c) => c.path === "/metadata/customField1");

			if (!customField1Conflict) {
				console.warn("??  POTENTIAL BUG: Dynamic property change not detected");
				console.warn("Expected: INPUT2_ONLY at /metadata/customField1 for value change");
			} else {
				expect(customField1Conflict.conflictType).toBe(ConflictType.INPUT2_ONLY);
			}

			// Should detect new custom fields
			const newFields = metadataConflicts.filter(
				(c) => c.path?.includes("customField2") || c.path?.includes("customField3") || c.path?.includes("customField4"),
			);
			expect(newFields.length).toBeGreaterThan(0);
		});
	});
});
