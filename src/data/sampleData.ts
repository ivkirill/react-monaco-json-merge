import type { JSONSchema } from "../types";

/**
 * Sample data for demo with complex schema scenarios
 *
 * This dataset includes 8 complex JSON Schema scenarios to test schema-aware
 * conflict detection in jsonPatchDiff:
 *
 * 1. oneOf: Payment method (exclusive choice - card/cash/crypto)
 * 2. anyOf: Permissions array (multiple choices allowed)
 * 3. items/oneOf: Array items with discriminated unions (gem/coin/diamond) + INDEX SWAPPING
 * 4. items/items: Nested arrays (matrix/grid structure)
 * 5. oneOf/anyOf: Nested combinations (configuration object)
 * 6. additionalProperties: Dynamic metadata object
 * 7. tasks: Array item reordering by ID
 * 8. workflowState: oneOf with const discriminators (pending/processing/completed)
 *
 * See SCHEMA-SCENARIOS.md for detailed explanations of each scenario.
 */
const sampleData = {
	base: {
		user: {
			id: 1,
			name: "John Doe",
			email: "john@example.com",
			settings: {
				theme: "dark",
				notifications: true,
			},
		},
		// oneOf scenario: payment method (exclusive choice)
		payment: {
			type: "card",
			number: "1234-5678-9012-3456",
			expiry: "12/25",
		},
		// anyOf scenario: permissions (can have multiple)
		permissions: ["read", "write"],
		// items/oneOf scenario: array of items with discriminated unions
		items: [
			{ id: "item-1", type: "gem", count: 100 },
			{ id: "item-2", type: "coin", count: 500 },
			{ id: "item-3", type: "diamond", count: 10 },
		],
		// items/items scenario: nested arrays (matrix/grid)
		matrix: [
			[1, 2, 3],
			[4, 5, 6],
		],
		// oneOf/anyOf nested scenario: complex nested structure
		configuration: {
			mode: "advanced",
			features: ["feature1", "feature2"],
		},
		// additionalProperties scenario: dynamic metadata
		metadata: {
			created: "2024-01-01",
			customField1: "value1",
		},
		// Array item reordering scenario: task priorities
		tasks: [
			{ id: "task-1", name: "Setup", priority: 1 },
			{ id: "task-2", name: "Development", priority: 2 },
			{ id: "task-3", name: "Testing", priority: 3 },
			{ id: "task-4", name: "Deploy", priority: 4 },
		],
		// oneOf with const values scenario: workflow state with different structures
		workflowState: {
			status: "pending",
			queuePosition: 5,
		},
	},
	theirs: {
		user: {
			id: 1,
			name: "John Doe",
			email: "john.doe@company.com", // Changed email
			settings: {
				theme: "dark",
				notifications: true,
				language: "en", // Added language
			},
		},
		// Changed payment method from card to crypto (oneOf conflict)
		payment: {
			type: "crypto",
			currency: "BTC",
			address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
		},
		// Added more permissions (anyOf - can combine)
		permissions: ["read", "write", "delete", "admin"],
		// Modified items array - SWAPPED indices (items/oneOf index swap)
		items: [
			{ id: "item-2", type: "coin", count: 500 }, // SWAPPED: was at index 1, now at 0
			{ id: "item-1", type: "gem", count: 150 }, // SWAPPED: was at index 0, now at 1. Also changed count
			{ id: "item-3", type: "diamond", count: 10 }, // Same position
		],
		// Modified nested array (items/items)
		matrix: [
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9], // Added row
		],
		// Changed configuration mode and added feature (oneOf/anyOf nested)
		configuration: {
			mode: "expert", // Changed mode
			features: ["feature1", "feature2", "feature3"], // Added feature
		},
		// Added custom metadata fields (additionalProperties)
		metadata: {
			created: "2024-01-01",
			customField1: "value1",
			customField2: "value2", // Added
			customField3: "value3", // Added
		},
		// Reordered tasks - moved task-3 to front
		tasks: [
			{ id: "task-3", name: "Testing", priority: 3 }, // Moved from index 2 to 0
			{ id: "task-1", name: "Setup", priority: 1 },
			{ id: "task-2", name: "Development", priority: 2 },
			{ id: "task-4", name: "Deploy", priority: 4 },
		],
		// Changed to "processing" with different structure
		workflowState: {
			status: "processing",
			assignee: "Alice",
			startedAt: "2024-01-02T10:00:00Z",
		},
	},
	ours: {
		user: {
			id: 1,
			name: "John Smith", // Changed name
			email: "john@example.com",
			settings: {
				theme: "light", // Changed theme
				notifications: false, // Changed notifications
			},
		},
		// Changed payment method from card to cash (oneOf conflict - different from theirs!)
		payment: {
			type: "cash",
			amount: 1000,
			currency: "USD",
		},
		// Removed one permission but same others (anyOf)
		permissions: ["read"], // Removed "write"
		// Modified different item - different index order (items/oneOf conflict)
		items: [
			{ id: "item-3", type: "diamond", count: 15 }, // MOVED: was at index 2, now at 0. Changed count
			{ id: "item-1", type: "gem", count: 120 }, // MOVED: was at index 0, now at 1. Different count change
			{ id: "item-2", type: "coin", count: 600 }, // MOVED: was at index 1, now at 2. Changed count
		],
		// Modified nested array differently (items/items)
		matrix: [
			[1, 2, 3, 4], // Added column
			[4, 5, 6, 7], // Added column
		],
		// Kept same mode but different features (oneOf/anyOf nested conflict)
		configuration: {
			mode: "advanced", // Same mode
			features: ["feature2", "feature4"], // Different features
		},
		// Different custom metadata (additionalProperties conflict)
		metadata: {
			created: "2024-01-01",
			customField1: "changed-value1", // Changed value
			customField4: "value4", // Different custom field
		},
		// Reordered tasks differently - moved task-4 to front
		tasks: [
			{ id: "task-4", name: "Deploy", priority: 4 }, // Moved from index 3 to 0
			{ id: "task-1", name: "Setup", priority: 1 },
			{ id: "task-2", name: "Development", priority: 2 },
			{ id: "task-3", name: "Testing", priority: 3 },
		],
		// Changed to "completed" with different structure
		workflowState: {
			status: "completed",
			completedBy: "Bob",
			completedAt: "2024-01-03T15:30:00Z",
			result: "success",
		},
	},
};

const schema: JSONSchema = {
	type: "object",
	properties: {
		user: {
			type: "object",
			properties: {
				id: { type: "number" },
				name: { type: "string" },
				email: { type: "string", format: "email" },
				settings: {
					type: "object",
					properties: {
						theme: { type: "string" },
						notifications: { type: "boolean" },
						language: { type: "string" },
					},
				},
			},
		},
		// oneOf: Payment method - exclusive choice
		payment: {
			oneOf: [
				{
					type: "object",
					properties: {
						type: { const: "card" },
						number: { type: "string" },
						expiry: { type: "string" },
					},
					required: ["type", "number", "expiry"],
				},
				{
					type: "object",
					properties: {
						type: { const: "cash" },
						amount: { type: "number" },
						currency: { type: "string" },
					},
					required: ["type", "amount", "currency"],
				},
				{
					type: "object",
					properties: {
						type: { const: "crypto" },
						currency: { type: "string" },
						address: { type: "string" },
					},
					required: ["type", "currency", "address"],
				},
			],
		},
		// anyOf: Permissions - can have multiple
		permissions: {
			type: "array",
			items: {
				anyOf: [{ const: "read" }, { const: "write" }, { const: "delete" }, { const: "admin" }],
			},
		},
		// items/oneOf: Array items with discriminated unions
		items: {
			type: "array",
			items: {
				oneOf: [
					{
						type: "object",
						properties: {
							id: { type: "string" },
							type: { const: "gem" },
							count: { type: "number" },
						},
						required: ["id", "type", "count"],
					},
					{
						type: "object",
						properties: {
							id: { type: "string" },
							type: { const: "coin" },
							count: { type: "number" },
						},
						required: ["id", "type", "count"],
					},
					{
						type: "object",
						properties: {
							id: { type: "string" },
							type: { const: "diamond" },
							count: { type: "number" },
						},
						required: ["id", "type", "count"],
					},
				],
			},
		},
		// items/items: Nested arrays
		matrix: {
			type: "array",
			items: {
				type: "array",
				items: {
					type: "number",
				},
			},
		},
		// oneOf/anyOf: Nested combinations
		configuration: {
			type: "object",
			properties: {
				mode: {
					oneOf: [{ const: "basic" }, { const: "advanced" }, { const: "expert" }],
				},
				features: {
					type: "array",
					items: {
						anyOf: [{ const: "feature1" }, { const: "feature2" }, { const: "feature3" }, { const: "feature4" }],
					},
				},
			},
			required: ["mode", "features"],
		},
		// additionalProperties: Dynamic metadata object
		metadata: {
			type: "object",
			properties: {
				created: { type: "string" },
			},
			additionalProperties: {
				type: "string",
			},
		},
		tasks: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					priority: { type: "number" },
				},
				required: ["id"],
			},
		},
		// oneOf with const discriminator: workflow state
		workflowState: {
			oneOf: [
				{
					type: "object",
					properties: {
						status: { const: "pending" },
						queuePosition: { type: "number" },
					},
					required: ["status", "queuePosition"],
				},
				{
					type: "object",
					properties: {
						status: { const: "processing" },
						assignee: { type: "string" },
						startedAt: { type: "string", format: "date-time" },
					},
					required: ["status", "assignee", "startedAt"],
				},
				{
					type: "object",
					properties: {
						status: { const: "completed" },
						completedBy: { type: "string" },
						completedAt: { type: "string", format: "date-time" },
						result: { type: "string", enum: ["success", "failure"] },
					},
					required: ["status", "completedBy", "completedAt", "result"],
				},
			],
		},
	},
};

export interface SampleData {
	base: string;
	theirs: string;
	ours: string;
	schema: JSONSchema;
}

export function getSampleData(): SampleData {
	return {
		base: JSON.stringify(sampleData.base, null, 2),
		theirs: JSON.stringify(sampleData.theirs, null, 2),
		ours: JSON.stringify(sampleData.ours, null, 2),
		schema,
	};
}
