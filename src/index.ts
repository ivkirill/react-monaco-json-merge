export { JsonDiffMergeEditor } from "./components/editor";
export type {
	ConflictIssue,
	ConflictType,
	EditorDiffMergeProps,
	EditorRefs,
	InputState,
	JSONSchema,
	ModifiedBaseRange,
	ResolutionInfo,
} from "./types";
export type { BuildResultContentResult, ConflictIssue as DiffMergeConflictIssue } from "./utils/diffMerge";
export { computeDiffs, computeLineConflictType } from "./utils/diffMerge";
export type { ConflictAnalysis } from "./utils/jsonPatchDiff";
export { analyzeConflicts, analyzeTwoWayConflicts, computeDiffsJsonPatch } from "./utils/jsonPatchDiff";
