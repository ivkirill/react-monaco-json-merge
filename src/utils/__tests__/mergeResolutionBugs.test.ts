import { describe, expect, it } from "vitest";
import type { ModifiedBaseRange } from "../../types";
import { ConflictType, InputState } from "../../types";
import { buildResultContentWithValidation } from "../diffMerge";

/**
 * Test cases based on the actual render bugs seen in the image
 *
 * Issues identified:
 * 1. Matrix field missing (present in Base and Ours, missing in Result)
 * 2. Inconsistent merging logic (sometimes Theirs, sometimes Ours)
 * 3. Data loss in payment object
 * 4. Data loss in permissions array
 * 5. Data loss in items array
 */

describe("Merge Resolution Bug Fixes", () => {
	const baseJSON = {
		id: 1,
		name: "John Doe",
		email: "john@example.com",
		settings: {
			theme: "dark",
			notifications: true,
		},
		payment: {
			type: "card",
			number: "1234-5678-9012-3456",
			expiry: "12/25",
		},
		permissions: ["read", "write"],
		items: [
			{ id: "item-1", type: "gem", count: 100 },
			{ id: "item-2", type: "coin", count: 500 },
		],
		matrix: [], // This should be preserved!
	};

	const theirsJSON = {
		id: 1,
		name: "John Doe",
		email: "john.doe@company.com",
		settings: {
			theme: "dark",
			notifications: true,
			language: "en",
		},
		payment: {
			type: "crypto",
			currency: "BTC",
			address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7Dj",
		},
		permissions: ["read", "write", "delete", "admin"],
		items: [
			{ id: "item-1", type: "gem", count: 150 },
			{ id: "item-2", type: "coin", count: 500 },
		],
		matrix: [], // Same as base
	};

	const oursJSON = {
		id: 1,
		name: "John Smith",
		email: "john@example.com",
		settings: {
			theme: "light",
			notifications: false,
		},
		payment: {
			type: "cash",
			amount: 1000,
			currency: "USD",
		},
		permissions: ["read"],
		items: [
			{ id: "item-1", type: "gem", count: 120 },
			{ id: "item-2", type: "coin", count: 600 },
		],
		matrix: [], // Same as base and theirs - should be preserved!
	};

	const baseText = JSON.stringify(baseJSON, null, 2);
	const theirsText = JSON.stringify(theirsJSON, null, 2);
	const oursText = JSON.stringify(oursJSON, null, 2);
	const baseLines = baseText.split("\n");
	const theirsLines = theirsText.split("\n");
	const oursLines = oursText.split("\n");

	it("BUG 1: Matrix field should be preserved (present in Base and Ours)", () => {
		// Create conflicts that don't include matrix
		const conflicts: ModifiedBaseRange[] = [
			// User email conflict
			{
				id: "conflict-1",
				path: "/email",
				baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
				input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
				input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
				input1Diffs: [{ line: 3 }],
				input2Diffs: [],
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.excluded,
				isConflicting: false,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(baseLines, theirsLines, oursLines, conflicts);

		console.log("Result JSON:", result.content);
		const resultData = JSON.parse(result.content);

		// Matrix should be present even though it's not in conflicts
		expect(resultData).toHaveProperty("matrix");
		expect(Array.isArray(resultData.matrix)).toBe(true);
	});

	it("BUG 2: Should merge payment object correctly based on checkboxes", () => {
		// Payment conflict - oneOf variant change
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-payment",
				path: "/payment",
				baseRange: { startLineNumber: 10, endLineNumberExclusive: 14 },
				input1Range: { startLineNumber: 10, endLineNumberExclusive: 14 },
				input2Range: { startLineNumber: 10, endLineNumberExclusive: 14 },
				input1Diffs: [{ line: 11 }, { line: 12 }, { line: 13 }],
				input2Diffs: [{ line: 11 }, { line: 12 }, { line: 13 }],
				conflictType: ConflictType.TRUE_CONFLICT,
				input1State: InputState.excluded, // Ours checkbox checked (default)
				input2State: InputState.first, // Ours checkbox checked
				isConflicting: true,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(baseLines, theirsLines, oursLines, conflicts);

		const resultData = JSON.parse(result.content);

		// Should use Ours payment (cash) since input2State is checked
		expect(resultData.payment).toEqual({
			type: "cash",
			amount: 1000,
			currency: "USD",
		});
	});

	it("BUG 3: Should preserve fields not in conflicts", () => {
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-name",
				path: "/name",
				baseRange: { startLineNumber: 2, endLineNumberExclusive: 3 },
				input1Range: { startLineNumber: 2, endLineNumberExclusive: 3 },
				input2Range: { startLineNumber: 2, endLineNumberExclusive: 3 },
				input1Diffs: [],
				input2Diffs: [{ line: 2 }],
				conflictType: ConflictType.INPUT2_ONLY,
				input1State: InputState.excluded,
				input2State: InputState.first,
				isConflicting: false,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(baseLines, theirsLines, oursLines, conflicts);

		const resultData = JSON.parse(result.content);

		// Should have all fields from base, even if not in conflicts
		expect(resultData).toHaveProperty("id");
		expect(resultData).toHaveProperty("email");
		expect(resultData).toHaveProperty("settings");
		expect(resultData).toHaveProperty("payment");
		expect(resultData).toHaveProperty("permissions");
		expect(resultData).toHaveProperty("items");
		expect(resultData).toHaveProperty("matrix");
	});

	it("BUG 4: Should handle array conflicts correctly", () => {
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-permissions",
				path: "/permissions",
				baseRange: { startLineNumber: 15, endLineNumberExclusive: 17 },
				input1Range: { startLineNumber: 15, endLineNumberExclusive: 19 },
				input2Range: { startLineNumber: 15, endLineNumberExclusive: 16 },
				input1Diffs: [{ line: 16 }, { line: 17 }, { line: 18 }],
				input2Diffs: [],
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first, // Theirs checked
				input2State: InputState.excluded,
				isConflicting: false,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(baseLines, theirsLines, oursLines, conflicts);

		const resultData = JSON.parse(result.content);

		// Should use Theirs permissions since input1State is checked
		expect(resultData.permissions).toEqual(["read", "write", "delete", "admin"]);
	});

	it("BUG 5: Should handle nested object properties correctly", () => {
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-settings-theme",
				path: "/settings/theme",
				baseRange: { startLineNumber: 5, endLineNumberExclusive: 6 },
				input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
				input2Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
				input1Diffs: [],
				input2Diffs: [{ line: 5 }],
				conflictType: ConflictType.INPUT2_ONLY,
				input1State: InputState.excluded,
				input2State: InputState.first,
				isConflicting: false,
				handled: false,
				focused: false,
			},
			{
				id: "conflict-settings-language",
				path: "/settings/language",
				baseRange: { startLineNumber: 8, endLineNumberExclusive: 9 },
				input1Range: { startLineNumber: 8, endLineNumberExclusive: 9 },
				input2Range: { startLineNumber: 8, endLineNumberExclusive: 9 },
				input1Diffs: [{ line: 8 }],
				input2Diffs: [],
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.excluded,
				isConflicting: false,
				handled: false,
				focused: false,
			},
		];

		const result = buildResultContentWithValidation(baseLines, theirsLines, oursLines, conflicts);

		const resultData = JSON.parse(result.content);

		// Should merge settings: theme from Ours, language from Theirs
		expect(resultData.settings).toEqual({
			theme: "light", // From Ours
			notifications: false, // From Ours (unchanged conflict)
			language: "en", // From Theirs
		});
	});
});
