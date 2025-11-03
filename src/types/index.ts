import type { Operation as JsonPatchOperation } from "fast-json-patch";
import type { JSONSchema7 } from "json-schema";
import type * as monaco from "monaco-editor";

export type JSONSchema = JSONSchema7;

// Conflict and Editor types
export enum InputState {
	excluded = 0,
	first = 1,
	second = 2,
}

export enum ConflictType {
	SAME_CHANGE = "same_change",
	INPUT1_ONLY = "input1_only",
	INPUT2_ONLY = "input2_only",
	TRUE_CONFLICT = "true_conflict",
}

export interface ModifiedBaseRange {
	id: string;
	path?: string;
	baseRange: { startLineNumber: number; endLineNumberExclusive: number };
	input1Range: { startLineNumber: number; endLineNumberExclusive: number };
	input2Range: { startLineNumber: number; endLineNumberExclusive: number };
	input1Diffs: unknown[];
	input2Diffs: unknown[];
	isConflicting: boolean;
	conflictType: ConflictType;
	input1State: InputState;
	input2State: InputState;
	handled: boolean;
	focused: boolean;
}

export interface ConflictIssue {
	conflictId: string;
	conflictPath: string;
	type: "error" | "warning" | "smart-merge";
	message: string;
	startLine: number;
	endLine: number;
}

export interface ResolutionInfo {
	isValid: boolean;
	validationError?: string;
	warnings?: string[];
	conflictIssues?: ConflictIssue[];
}

export interface EditorDiffMergeProps {
	original?: string;
	modified?: string;
	base?: string;
	theme?: string;
	width?: string | number;
	height?: string | number;
	className?: string;
	loading?: React.ReactNode;
	options?: monaco.editor.IStandaloneEditorConstructionOptions;
	onMount?: (editor: monaco.editor.IStandaloneDiffEditor, monaco: typeof import("monaco-editor")) => void;
	onMergeResolve?: (content: string, resolution?: ResolutionInfo) => void;
	showResultColumn?: boolean;
	baseIndex?: 0 | 1 | 2;
	comparisonMode?: "split" | "sequential";
	schema?: JSONSchema;
	patches?: {
		theirs?: JsonPatchOperation[];
		ours?: JsonPatchOperation[];
	};
	labels?: {
		input1?: string;
		base?: string;
		input2?: string;
		result?: string;
	};
}
