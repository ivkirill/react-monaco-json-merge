import type * as monaco from "monaco-editor";
import { describe, expect, it } from "vitest";
import { ConflictType, InputState, type ModifiedBaseRange } from "../../types";
import {
	createAllDecorations,
	createBaseDecorations,
	createConflictDecorations,
	createInput1Decorations,
	createInput2Decorations,
	type DecorationConfig,
	getDecorationClasses,
} from "../editorDecorations";

// Mock Monaco instance for decoration creation
const mockMonaco = {
	Range: class {
		constructor(
			public startLineNumber: number,
			public startColumn: number,
			public endLineNumber: number,
			public endColumn: number,
		) {}
	},
	editor: {
		OverviewRulerLane: {
			Full: 7,
		},
		MinimapPosition: {
			Inline: 1,
		},
	},
} as unknown as typeof monaco;

const mockConfig: DecorationConfig = {
	conflictColor: "rgba(255, 166, 0, 0.2)",
	changeColor: "rgba(155, 185, 85, 0.2)",
	baseColor: "rgba(255, 100, 100, 0.2)",
	conflictOverviewColor: "rgba(255, 166, 0, 0.8)",
	changeOverviewColor: "rgba(155, 185, 85, 0.8)",
	baseOverviewColor: "rgba(255, 100, 100, 0.8)",
};

describe("editorDecorations - getDecorationClasses", () => {
	it("should handle SAME_CHANGE - added in both inputs", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 }, // Default "not found" range
			input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
			input2Range: { startLineNumber: 6, endLineNumberExclusive: 7 },
			input1Diffs: [{ line: 5 }],
			input2Diffs: [{ line: 6 }],
			isConflicting: false,
			conflictType: ConflictType.SAME_CHANGE,
			input1State: InputState.first,
			input2State: InputState.first,
			handled: true,
			focused: false,
		};

		const result = getDecorationClasses(conflict, false, mockConfig);

		// Both inputs should be highlighted as same change (blue) in 3-way mode
		expect(result.input1Class).toBe("merge-same-change");
		expect(result.input2Class).toBe("merge-same-change");
		expect(result.baseClass).toBe("");
		expect(result.input1OverviewColor).toBe(mockConfig.changeOverviewColor);
		expect(result.input2OverviewColor).toBe(mockConfig.changeOverviewColor);
		expect(result.baseOverviewColor).toBe("");
	});

	it("should handle SAME_CHANGE - added in both inputs in 2-way mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 }, // Default "not found" range
			input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
			input2Range: { startLineNumber: 6, endLineNumberExclusive: 7 },
			input1Diffs: [{ line: 5 }],
			input2Diffs: [{ line: 6 }],
			isConflicting: false,
			conflictType: ConflictType.SAME_CHANGE,
			input1State: InputState.first,
			input2State: InputState.first,
			handled: true,
			focused: false,
		};

		const result = getDecorationClasses(conflict, true, mockConfig);

		// In 2-way mode, input1 should be red even when both added the same
		expect(result.input1Class).toBe("merge-2way-deletion");
		expect(result.input2Class).toBe("merge-same-change");
		expect(result.baseClass).toBe("");
		expect(result.input1OverviewColor).toBe(mockConfig.baseOverviewColor);
		expect(result.input2OverviewColor).toBe(mockConfig.changeOverviewColor);
		expect(result.baseOverviewColor).toBe("");
	});

	it("should handle SAME_CHANGE - both modified existing item", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [{ line: 3 }],
			isConflicting: false,
			conflictType: ConflictType.SAME_CHANGE,
			input1State: InputState.first,
			input2State: InputState.first,
			handled: true,
			focused: false,
		};

		const result = getDecorationClasses(conflict, false, mockConfig);

		// Input1 should be red (incoming), input2 should be blue (same change)
		expect(result.input1Class).toBe("merge-change-incoming");
		expect(result.input2Class).toBe("merge-same-change");
		expect(result.baseClass).toBe("merge-change-base");
	});

	it("should handle SAME_CHANGE - both modified existing item in 2-way mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [{ line: 3 }],
			isConflicting: false,
			conflictType: ConflictType.SAME_CHANGE,
			input1State: InputState.first,
			input2State: InputState.first,
			handled: true,
			focused: false,
		};

		const result = getDecorationClasses(conflict, true, mockConfig);

		// In 2-way mode, input1 should be red
		expect(result.input1Class).toBe("merge-2way-deletion");
		expect(result.input2Class).toBe("merge-same-change");
		expect(result.baseClass).toBe("merge-change-base");
		expect(result.input1OverviewColor).toBe(mockConfig.baseOverviewColor);
	});

	it("should handle INPUT1_ONLY in 2-column mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [],
			isConflicting: false,
			conflictType: ConflictType.INPUT1_ONLY,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, true, mockConfig);

		// In 2-column mode, input1 should be highlighted as deletion (red)
		expect(result.input1Class).toBe("merge-2way-deletion");
		expect(result.input2Class).toBe("");
		expect(result.input1OverviewColor).toBe(mockConfig.baseOverviewColor);
		expect(result.input2OverviewColor).toBe("");
	});

	it("should handle INPUT1_ONLY in 3-column mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [],
			isConflicting: false,
			conflictType: ConflictType.INPUT1_ONLY,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, false, mockConfig);

		// In 3-column mode, input1 should be orange (incoming)
		expect(result.input1Class).toBe("merge-change-incoming");
		expect(result.input2Class).toBe("");
		expect(result.baseClass).toBe("merge-change-base");
		expect(result.input1OverviewColor).toBe(mockConfig.conflictOverviewColor);
	});

	it("should handle INPUT2_ONLY in 2-column mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [],
			input2Diffs: [{ line: 3 }],
			isConflicting: false,
			conflictType: ConflictType.INPUT2_ONLY,
			input1State: InputState.excluded,
			input2State: InputState.first,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, true, mockConfig);

		// In 2-column mode, only input2 should be highlighted (green)
		expect(result.input1Class).toBe("");
		expect(result.input2Class).toBe("merge-change-current");
		expect(result.baseClass).toBe("");
		expect(result.baseOverviewColor).toBe("");
	});

	it("should handle INPUT2_ONLY in 3-column mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 1, endLineNumberExclusive: 2 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [],
			input2Diffs: [{ line: 3 }],
			isConflicting: false,
			conflictType: ConflictType.INPUT2_ONLY,
			input1State: InputState.excluded,
			input2State: InputState.first,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, false, mockConfig);

		// In 3-column mode, input2 and base should be highlighted
		expect(result.input1Class).toBe("");
		expect(result.input2Class).toBe("merge-change-current");
		expect(result.baseClass).toBe("merge-change-base");
		expect(result.baseOverviewColor).toBe(mockConfig.baseOverviewColor);
	});

	it("should handle TRUE_CONFLICT - added in both inputs", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 }, // Default "not found" range
			input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
			input2Range: { startLineNumber: 6, endLineNumberExclusive: 7 },
			input1Diffs: [{ line: 5 }],
			input2Diffs: [{ line: 6 }],
			isConflicting: true,
			conflictType: ConflictType.TRUE_CONFLICT,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, false, mockConfig);

		// Items added in both should be highlighted as additions (not conflicts)
		expect(result.input1Class).toBe("merge-change-incoming");
		expect(result.input2Class).toBe("merge-change-current");
		expect(result.baseClass).toBe("");
		expect(result.input1OverviewColor).toBe(mockConfig.changeOverviewColor);
		expect(result.input2OverviewColor).toBe(mockConfig.changeOverviewColor);
		expect(result.baseOverviewColor).toBe("");
	});

	it("should handle TRUE_CONFLICT - added in both inputs in 2-way mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 }, // Default "not found" range
			input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
			input2Range: { startLineNumber: 6, endLineNumberExclusive: 7 },
			input1Diffs: [{ line: 5 }],
			input2Diffs: [{ line: 6 }],
			isConflicting: true,
			conflictType: ConflictType.TRUE_CONFLICT,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, true, mockConfig);

		// In 2-way mode, input1 should be red
		expect(result.input1Class).toBe("merge-2way-deletion");
		expect(result.input2Class).toBe("merge-change-current");
		expect(result.baseClass).toBe("");
		expect(result.input1OverviewColor).toBe(mockConfig.baseOverviewColor);
		expect(result.input2OverviewColor).toBe(mockConfig.changeOverviewColor);
		expect(result.baseOverviewColor).toBe("");
	});

	it("should handle TRUE_CONFLICT - modified existing item in 2-way mode", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [{ line: 3 }],
			isConflicting: true,
			conflictType: ConflictType.TRUE_CONFLICT,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, true, mockConfig);

		// In 2-way mode, input1 should be red
		expect(result.input1Class).toBe("merge-2way-deletion");
		expect(result.input2Class).toBe("merge-conflict-current");
		expect(result.baseClass).toBe("merge-conflict-base");
		expect(result.input1OverviewColor).toBe(mockConfig.baseOverviewColor);
		expect(result.input2OverviewColor).toBe(mockConfig.conflictOverviewColor);
		expect(result.baseOverviewColor).toBe(mockConfig.baseOverviewColor);
	});

	it("should handle TRUE_CONFLICT - modified existing item", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [{ line: 3 }],
			isConflicting: true,
			conflictType: ConflictType.TRUE_CONFLICT,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = getDecorationClasses(conflict, false, mockConfig);

		// True conflict should highlight all three columns
		expect(result.input1Class).toBe("merge-conflict-incoming");
		expect(result.input2Class).toBe("merge-conflict-current");
		expect(result.baseClass).toBe("merge-conflict-base");
		expect(result.input1OverviewColor).toBe(mockConfig.conflictOverviewColor);
		expect(result.input2OverviewColor).toBe(mockConfig.conflictOverviewColor);
		expect(result.baseOverviewColor).toBe(mockConfig.baseOverviewColor);
	});
});

describe("editorDecorations - createInput1Decorations", () => {
	it("should create decorations for input1 diffs", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }, { line: 4 }],
			input2Diffs: [],
			isConflicting: false,
			conflictType: ConflictType.INPUT1_ONLY,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createInput1Decorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(2);
		expect(decorations[0]?.range.startLineNumber).toBe(3);
		expect(decorations[1]?.range.startLineNumber).toBe(4);
	});

	it("should not create decorations when input1Class is empty", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [],
			isConflicting: false,
			conflictType: ConflictType.INPUT1_ONLY,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const classes = { ...getDecorationClasses(conflict, false, mockConfig), input1Class: "" };
		const decorations = createInput1Decorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(0);
	});

	it("should not create decorations when input1Diffs is empty", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [],
			input2Diffs: [{ line: 3 }],
			isConflicting: false,
			conflictType: ConflictType.INPUT2_ONLY,
			input1State: InputState.excluded,
			input2State: InputState.first,
			handled: false,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createInput1Decorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(0);
	});
});

describe("editorDecorations - createInput2Decorations", () => {
	it("should create decorations for input2 diffs", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [],
			input2Diffs: [{ line: 3 }, { line: 5 }],
			isConflicting: false,
			conflictType: ConflictType.INPUT2_ONLY,
			input1State: InputState.excluded,
			input2State: InputState.first,
			handled: false,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createInput2Decorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(2);
		expect(decorations[0]?.range.startLineNumber).toBe(3);
		expect(decorations[1]?.range.startLineNumber).toBe(5);
	});

	it("should include overview ruler and minimap when color is provided", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [],
			input2Diffs: [{ line: 3 }],
			isConflicting: false,
			conflictType: ConflictType.INPUT2_ONLY,
			input1State: InputState.excluded,
			input2State: InputState.first,
			handled: false,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createInput2Decorations(conflict, classes, mockMonaco);

		expect(decorations[0]?.options.overviewRuler).toBeDefined();
		expect(decorations[0]?.options.minimap).toBeDefined();
	});
});

describe("editorDecorations - createBaseDecorations", () => {
	it("should create decorations for base when changes exist", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 5 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [],
			isConflicting: false,
			conflictType: ConflictType.INPUT1_ONLY,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createBaseDecorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(1);
		expect(decorations[0]?.range.startLineNumber).toBe(3);
		expect(decorations[0]?.range.endLineNumber).toBe(4); // endLineNumberExclusive - 1
	});

	it("should not create decorations when base range is default {1, 2}", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 1, endLineNumberExclusive: 2 }, // Default range
			input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
			input2Range: { startLineNumber: 6, endLineNumberExclusive: 7 },
			input1Diffs: [{ line: 5 }],
			input2Diffs: [{ line: 6 }],
			isConflicting: true,
			conflictType: ConflictType.TRUE_CONFLICT,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createBaseDecorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(0);
	});

	it("should not create decorations when no diffs exist", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [],
			input2Diffs: [],
			isConflicting: false,
			conflictType: ConflictType.SAME_CHANGE,
			input1State: InputState.first,
			input2State: InputState.first,
			handled: true,
			focused: false,
		};

		const classes = getDecorationClasses(conflict, false, mockConfig);
		const decorations = createBaseDecorations(conflict, classes, mockMonaco);

		expect(decorations.length).toBe(0);
	});
});

describe("editorDecorations - createConflictDecorations", () => {
	it("should create all decorations for a conflict", () => {
		const conflict: ModifiedBaseRange = {
			id: "conflict-1",
			baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
			input1Diffs: [{ line: 3 }],
			input2Diffs: [{ line: 3 }],
			isConflicting: true,
			conflictType: ConflictType.TRUE_CONFLICT,
			input1State: InputState.first,
			input2State: InputState.excluded,
			handled: false,
			focused: false,
		};

		const result = createConflictDecorations(conflict, false, mockConfig, mockMonaco);

		expect(result.input1Decorations.length).toBeGreaterThan(0);
		expect(result.input2Decorations.length).toBeGreaterThan(0);
		expect(result.baseDecorations.length).toBeGreaterThan(0);
	});
});

describe("editorDecorations - createAllDecorations", () => {
	it("should create decorations for multiple conflicts", () => {
		const conflicts: ModifiedBaseRange[] = [
			{
				id: "conflict-1",
				baseRange: { startLineNumber: 3, endLineNumberExclusive: 4 },
				input1Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
				input2Range: { startLineNumber: 3, endLineNumberExclusive: 4 },
				input1Diffs: [{ line: 3 }],
				input2Diffs: [],
				isConflicting: false,
				conflictType: ConflictType.INPUT1_ONLY,
				input1State: InputState.first,
				input2State: InputState.excluded,
				handled: false,
				focused: false,
			},
			{
				id: "conflict-2",
				baseRange: { startLineNumber: 5, endLineNumberExclusive: 6 },
				input1Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
				input2Range: { startLineNumber: 5, endLineNumberExclusive: 6 },
				input1Diffs: [],
				input2Diffs: [{ line: 5 }],
				isConflicting: false,
				conflictType: ConflictType.INPUT2_ONLY,
				input1State: InputState.excluded,
				input2State: InputState.first,
				handled: false,
				focused: false,
			},
		];

		const result = createAllDecorations(conflicts, false, mockConfig, mockMonaco);

		expect(result.input1Decorations.length).toBeGreaterThan(0);
		expect(result.input2Decorations.length).toBeGreaterThan(0);
		expect(result.baseDecorations.length).toBeGreaterThan(0);
	});

	it("should handle empty conflicts array", () => {
		const result = createAllDecorations([], false, mockConfig, mockMonaco);

		expect(result.input1Decorations.length).toBe(0);
		expect(result.input2Decorations.length).toBe(0);
		expect(result.baseDecorations.length).toBe(0);
	});
});
