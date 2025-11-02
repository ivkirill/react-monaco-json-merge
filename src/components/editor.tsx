import loader from "@monaco-editor/loader";
import type * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { type EditorDiffMergeProps, InputState, type ModifiedBaseRange } from "../types";
import { buildResultContentWithValidation, type ConflictIssue } from "../utils/diffMerge";
import { createAllDecorations, type DecorationConfig } from "../utils/editorDecorations";
import { computeDiffsJsonPatch } from "../utils/jsonPatchDiff";
import "../styles/editor.css";

// Default Loader component
const DefaultLoader = () => <div style={{ padding: "20px", textAlign: "center", color: "#888" }}>Loading Monaco Editor...</div>;

const ISSUE_ICON = "⚠";

interface ITextModelWithDecorations extends monaco.editor.ITextModel {
	_conflictIssueDecorations?: monaco.editor.IEditorDecorationsCollection;
}

export function JsonDiffMergeEditor(props: EditorDiffMergeProps) {
	const {
		original = "",
		modified = "",
		base = "",
		theme = "vs",
		options = {},
		width = "100%",
		height = "100%",
		className,
		loading,
		onMount,
		onMergeResolve,
		showResultColumn = false,
		baseIndex = 1,
		comparisonMode = "split",
		schema,
		patches,
		labels,
	} = props;

	// Hardcode language to "json" - this component is JSON-only
	const language = "json";

	const [isEditorReady, setIsEditorReady] = useState(false);
	const [isMonacoMounting, setIsMonacoMounting] = useState(true);
	const [conflicts, setConflicts] = useState<ModifiedBaseRange[]>([]);
	const [_validationError, setValidationError] = useState<string | null>(null);
	const [_validationWarnings, setValidationWarnings] = useState<string[]>([]);
	const [conflictIssues, setConflictIssues] = useState<ConflictIssue[]>([]);
	const [isResultManuallyEdited, setIsResultManuallyEdited] = useState(false);

	// Function to render native checkbox (simpler and more reliable than React Portal)
	const renderCheckbox = useCallback((state: InputState, _inputNumber: 1 | 2, _conflictId: string, onToggle: () => void) => {
		const container = document.createElement("div");
		container.className = "native-checkbox-container";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "native-checkbox";
		checkbox.checked = state === InputState.first || state === InputState.second;
		checkbox.setAttribute("aria-label", checkbox.checked ? "Undo accept" : "Accept change");

		checkbox.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Defer the toggle to avoid React setState warning
			requestAnimationFrame(() => {
				onToggle();
			});
		});

		container.appendChild(checkbox);
		return container;
	}, []);

	const [_editorKey, setEditorKey] = useState(0);

	const input1EditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const baseEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const input2EditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const resultEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoRef = useRef<typeof monaco | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const preventCreation = useRef(false);
	const isProgrammaticUpdate = useRef(false);

	// Gutter container refs for checkbox UI
	const input1GutterRef = useRef<HTMLDivElement | null>(null);
	const input2GutterRef = useRef<HTMLDivElement | null>(null);
	const resultGutterRef = useRef<HTMLDivElement | null>(null);
	const gutterViewsRef = useRef<Map<string, HTMLDivElement>>(new Map());
	const resultLabelRef = useRef<HTMLDivElement | null>(null);

	// Decoration collections for proper updating
	const input1DecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
	const input2DecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
	const baseDecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

	// Initialize Monaco
	useEffect(() => {
		let isMounted = true;
		const cancelable = loader.init();

		cancelable
			.then((monacoInstance: typeof monaco) => {
				if (!isMounted) return;
				monacoRef.current = monacoInstance;
				setIsMonacoMounting(false);
				setIsEditorReady(true);
			})
			.catch((error: Error) => {
				if (!isMounted) return;
				if ((error as { type?: string })?.type !== "cancelation") {
					console.error("Monaco initialization: error:", error);
				}
			});

		return () => {
			isMounted = false;

			if (!preventCreation.current) {
				cancelable.cancel();
			}
		};
	}, []);

	// Compute diffs using JSON Patch approach (always)
	const computeDiffs = useCallback(
		(
			baseModel: monaco.editor.ITextModel | null,
			input1Model: monaco.editor.ITextModel,
			input2Model: monaco.editor.ITextModel,
		): ModifiedBaseRange[] => {
			if (!monacoRef.current) return [];

			const baseText = baseModel?.getValue() || "";
			const input1Text = input1Model.getValue();
			const input2Text = input2Model.getValue();

			try {
				const startTime = performance.now();
				const ranges = computeDiffsJsonPatch(baseText, input1Text, input2Text, {
					comparisonMode,
					schema,
					patches,
				});
				const duration = performance.now() - startTime;

				if (duration > 100) {
					console.warn(`JSON Patch diff took ${duration.toFixed(2)}ms`);
				}

				return ranges;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error("JSON Patch diff error:", message);
				return [];
			}
		},
		[comparisonMode, schema, patches],
	);

	// Get the position where decorations start (after line numbers)
	const getDecorationsLeft = useCallback((editor: monaco.editor.IStandaloneCodeEditor): number => {
		try {
			const layoutInfo = editor.getLayoutInfo();
			// decorationsLeft is where the decorations area starts
			return layoutInfo.decorationsLeft || 0;
		} catch {
			return 0;
		}
	}, []);

	// Get the width of the decorations area
	const getDecorationsWidth = useCallback((editor: monaco.editor.IStandaloneCodeEditor): number => {
		try {
			const layoutInfo = editor.getLayoutInfo();
			return layoutInfo.decorationsWidth || 0;
		} catch {
			return 0;
		}
	}, []);

	// Render conflict issue markers in result column gutter
	const renderConflictIssueMarkers = useCallback(
		(issues: ConflictIssue[]) => {
			if (!showResultColumn || !resultEditorRef.current || !resultGutterRef.current) {
				return;
			}

			const monacoInstance = monacoRef.current;
			if (!monacoInstance) return;

			const isDark = theme === "vs-dark" || (typeof theme === "string" && theme.includes("dark"));

			// Position the gutter container on the right side
			const decorationsLeft = getDecorationsLeft(resultEditorRef.current);
			const decorationsWidth = getDecorationsWidth(resultEditorRef.current);

			resultGutterRef.current.style.left = `${decorationsLeft}px`;
			resultGutterRef.current.style.width = `${decorationsWidth}px`;

			const scrollTop = resultEditorRef.current.getScrollTop();
			const model = resultEditorRef.current.getModel();
			if (!model) return;

			// Clear existing indicators
			resultGutterRef.current.innerHTML = "";

			// Render each conflict issue marker
			for (const issue of issues) {
				const startLine = issue.startLine;
				const endLine = issue.endLine;

				// Calculate position for this issue
				const topStart = resultEditorRef.current.getTopForLineNumber(startLine) - scrollTop;
				const topEnd = resultEditorRef.current.getTopForLineNumber(endLine) - scrollTop;
				const lineHeight = resultEditorRef.current.getOption(monacoInstance.editor.EditorOption.lineHeight);

				// For multi-line issues, calculate the full height and center the icon
				const isMultiLine = endLine > startLine;
				const fullHeight = isMultiLine ? topEnd - topStart + lineHeight : lineHeight;

				// Create marker div
				const markerDiv = document.createElement("div");
				markerDiv.className = `conflict-issue-marker conflict-issue-${issue.type}`;
				markerDiv.setAttribute("data-conflict-id", issue.conflictId);
				markerDiv.setAttribute("data-issue-type", issue.type);
				markerDiv.title = issue.message;
				markerDiv.style.position = "absolute";
				markerDiv.style.top = `${Math.max(0, topStart)}px`;
				markerDiv.style.height = `${fullHeight}px`;
				markerDiv.style.width = "26px";
				markerDiv.style.display = "flex";
				markerDiv.style.alignItems = "center";
				markerDiv.style.justifyContent = "center";
				markerDiv.style.cursor = "help";
				markerDiv.style.pointerEvents = "auto";

				// Add icon
				const icon = document.createElement("div");
				icon.className = "issue-icon";
				if (issue.type === "error") {
					icon.textContent = "✗";
					icon.style.color = isDark ? "#ff6666" : "#cc0000";
				} else if (issue.type === "warning") {
					icon.textContent = ISSUE_ICON;
					icon.style.color = isDark ? "#ffaa00" : "#ff8800";
				} else if (issue.type === "smart-merge") {
					icon.textContent = "↕";
					icon.style.color = isDark ? "#0096ff" : "#0078d4";
				}
				icon.style.fontSize = "14px";
				icon.style.fontWeight = "bold";
				markerDiv.appendChild(icon);

				resultGutterRef.current.appendChild(markerDiv);
			}
		},
		[showResultColumn, theme, getDecorationsLeft, getDecorationsWidth],
	);

	// Update result editor based on conflict states using extracted utility
	const updateResultEditor = useCallback(
		(updatedConflicts: ModifiedBaseRange[]) => {
			if (!resultEditorRef.current) {
				return;
			}

			// Don't auto-update if user has manually edited the result
			if (isResultManuallyEdited) {
				return;
			}

			const resultModel = resultEditorRef.current.getModel();
			const input1Model = input1EditorRef.current?.getModel();
			const input2Model = input2EditorRef.current?.getModel();
			const baseModel = baseEditorRef.current?.getModel();

			if (!resultModel || !input1Model || !input2Model || !baseModel) {
				return;
			}

			const baseLines = baseModel.getLinesContent();
			const input1Lines = input1Model.getLinesContent();
			const input2Lines = input2Model.getLinesContent();

			// Use enhanced utility function with validation
			const result = buildResultContentWithValidation(baseLines, input1Lines, input2Lines, updatedConflicts, schema);

			// Update validation state
			setValidationError(result.isValid ? null : result.validationError || "Invalid JSON");
			setValidationWarnings(result.warnings || []);
			setConflictIssues(result.conflictIssues || []);

			// Update result column header to show validation status
			if (resultLabelRef.current) {
				const baseLabel = labels?.result || "Result";
				if (!result.isValid) {
					resultLabelRef.current.textContent = `${baseLabel} ${ISSUE_ICON} Invalid JSON`;
					resultLabelRef.current.style.color = "#ff4444";
					resultLabelRef.current.title = result.validationError || "Invalid JSON - please fix manually";
				} else if (result.warnings && result.warnings.length > 0) {
					resultLabelRef.current.textContent = `${baseLabel} ${ISSUE_ICON}`;
					// resultLabelRef.current.style.color = "#ffaa00";
					resultLabelRef.current.title = result.warnings.join("\n");
				} else {
					resultLabelRef.current.textContent = baseLabel;
					resultLabelRef.current.style.color = "";
					resultLabelRef.current.title = "";
				}
			}

			// Update result model - preserve cursor position and only update if content changed
			const currentContent = resultModel.getValue();
			if (currentContent !== result.content) {
				// Save cursor position and selection
				const position = resultEditorRef.current.getPosition();
				const selection = resultEditorRef.current.getSelection();

				// Mark as programmatic update so onChange doesn't set manual edit flag
				isProgrammaticUpdate.current = true;

				// Update content
				resultModel.setValue(result.content);

				// Reset programmatic flag immediately
				isProgrammaticUpdate.current = false;

				// Restore cursor position and selection if still valid
				if (position) {
					const lineCount = resultModel.getLineCount();
					const lastLineLength = resultModel.getLineLength(lineCount);

					// Clamp position to valid range
					const validatedPosition = {
						lineNumber: Math.min(position.lineNumber, lineCount),
						column:
							position.lineNumber <= lineCount
								? Math.min(position.column, resultModel.getLineLength(position.lineNumber) + 1)
								: lastLineLength + 1,
					};

					resultEditorRef.current.setPosition(validatedPosition);

					// Restore selection if it was a range
					if (selection && !selection.isEmpty()) {
						resultEditorRef.current.setSelection(selection);
					}
				}
			}

			// Apply error highlighting if invalid
			const monacoInstance = monacoRef.current;
			// Monaco model doesn't have _invalidDecorations in types, but we use it for cleanup
			const modelWithDecorations = resultModel as monaco.editor.ITextModel & {
				_invalidDecorations?: monaco.editor.IEditorDecorationsCollection;
			};
			let invalidDecorations = modelWithDecorations._invalidDecorations;

			if (!result.isValid && resultEditorRef.current && monacoInstance) {
				if (!invalidDecorations) {
					invalidDecorations = resultEditorRef.current.createDecorationsCollection([]);
					modelWithDecorations._invalidDecorations = invalidDecorations;
				}
				invalidDecorations.set([
					{
						range: new monacoInstance.Range(1, 1, resultModel.getLineCount(), Number.MAX_SAFE_INTEGER),
						options: {
							isWholeLine: false,
							className: "merge-result-invalid",
							hoverMessage: { value: result.validationError || "Invalid JSON - please fix manually" },
						},
					},
				]);
			} else if (result.isValid && invalidDecorations && resultEditorRef.current) {
				// Clear error decorations if valid
				invalidDecorations.set([]);
			}

			// Render conflict issue markers in result column gutter and highlight lines
			if (result.conflictIssues && result.conflictIssues.length > 0) {
				renderConflictIssueMarkers(result.conflictIssues);

				// Apply line decorations for conflict issues
				if (resultEditorRef.current && monacoInstance) {
					const modelWithDecorations = resultModel as ITextModelWithDecorations;
					if (!modelWithDecorations._conflictIssueDecorations) {
						const collection: monaco.editor.IEditorDecorationsCollection = resultEditorRef.current.createDecorationsCollection(
							[],
						);
						modelWithDecorations._conflictIssueDecorations = collection;
					}
					const conflictIssueDecorations = modelWithDecorations._conflictIssueDecorations;
					const conflictDecorations: monaco.editor.IModelDeltaDecoration[] = result.conflictIssues.map((issue) => {
						let backgroundColor: string;
						let borderColor: string;

						if (issue.type === "error") {
							backgroundColor = theme === "vs-dark" ? "rgba(255, 0, 0, 0.1)" : "rgba(255, 0, 0, 0.05)";
							borderColor = theme === "vs-dark" ? "#ff6666" : "#cc0000";
						} else if (issue.type === "warning") {
							backgroundColor = theme === "vs-dark" ? "rgba(255, 170, 0, 0.1)" : "rgba(255, 136, 0, 0.05)";
							borderColor = theme === "vs-dark" ? "#ffaa00" : "#ff8800";
						} else {
							backgroundColor = theme === "vs-dark" ? "rgba(0, 150, 255, 0.1)" : "rgba(0, 120, 212, 0.05)";
							borderColor = theme === "vs-dark" ? "#0096ff" : "#0078d4";
						}

						return {
							range: new monacoInstance.Range(issue.startLine, 1, issue.endLine, Number.MAX_SAFE_INTEGER),
							options: {
								isWholeLine: true,
								className: `conflict-issue-line conflict-issue-${issue.type}`,
								linesDecorationsClassName: `conflict-issue-line-decoration conflict-issue-${issue.type}`,
								backgroundColor,
								overviewRuler: {
									color: borderColor,
									position: monacoInstance.editor.OverviewRulerLane.Right,
								},
								minimap: {
									color: borderColor,
									position: monacoInstance.editor.MinimapPosition.Inline,
								},
							},
						};
					});

					conflictIssueDecorations.set(conflictDecorations);
				}
			} else if (resultEditorRef.current) {
				// Clear conflict issue decorations if there are none
				const modelWithDecorations = resultModel as ITextModelWithDecorations;
				if (modelWithDecorations._conflictIssueDecorations) {
					modelWithDecorations._conflictIssueDecorations.set([]);
				}
				// Also clear the gutter markers
				if (resultGutterRef.current && showResultColumn) {
					resultGutterRef.current.innerHTML = "";
				}
			}

			// Callback with resolved content and resolution info (even if invalid, so parent can handle)
			// Defer the callback to avoid React setState warning (updating parent component during render)
			if (onMergeResolve) {
				queueMicrotask(() => {
					onMergeResolve(result.content, {
						isValid: result.isValid,
						validationError: result.validationError,
						warnings: result.warnings,
						conflictIssues: result.conflictIssues,
					});
				});
			}
		},
		[onMergeResolve, schema, labels, theme, renderConflictIssueMarkers, showResultColumn, isResultManuallyEdited],
	);

	// Toggle input state (like VSCode's checkbox toggle)
	const toggleInputState = useCallback(
		(conflictId: string, inputNumber: 1 | 2) => {
			// Reset manual edit flag when user clicks checkbox (they want auto-calculation)
			setIsResultManuallyEdited(false);

			setConflicts((prevConflicts) => {
				const updatedConflicts = prevConflicts.map((conflict) => {
					if (conflict.id !== conflictId) return conflict;

					const currentState = inputNumber === 1 ? conflict.input1State : conflict.input2State;
					const newState = currentState === InputState.excluded ? InputState.first : InputState.excluded;

					// Update the appropriate state
					if (inputNumber === 1) {
						return { ...conflict, input1State: newState };
					}
					return { ...conflict, input2State: newState };
				});

				// Update result editor if enabled
				if (showResultColumn && resultEditorRef.current) {
					updateResultEditor(updatedConflicts);
				}

				return updatedConflicts;
			});
		},
		[showResultColumn, updateResultEditor],
	);

	// Render individual checkbox gutter item
	const renderCheckboxGutterItem = useCallback(
		(
			gutterContainer: HTMLDivElement,
			key: string,
			conflict: ModifiedBaseRange,
			inputNumber: 1 | 2,
			scrollTop: number,
			viewHeight: number,
			_isDark: boolean,
		) => {
			const monacoInstance = monacoRef.current;
			if (!monacoInstance) return;

			const editor = inputNumber === 1 ? input1EditorRef.current : input2EditorRef.current;
			if (!editor) return;

			const range = inputNumber === 1 ? conflict.input1Range : conflict.input2Range;
			const state = inputNumber === 1 ? conflict.input1State : conflict.input2State;

			// Validate range before calculating position
			const model = editor.getModel();
			if (!model) return;

			const lineCount = model.getLineCount();
			const startLine = Math.max(1, Math.min(range.startLineNumber, lineCount));
			const endLine = Math.max(1, Math.min(range.endLineNumberExclusive - 1, lineCount));

			// Skip if range is invalid
			if (startLine > lineCount || endLine < 1 || startLine > endLine) {
				return;
			}

			// Calculate position
			const top = editor.getTopForLineNumber(startLine) - scrollTop;
			const bottom = editor.getBottomForLineNumber(endLine) - scrollTop;
			const height = bottom - top;

			// Get or create view
			let viewDiv = gutterViewsRef.current.get(key);
			if (!viewDiv) {
				viewDiv = document.createElement("div");
				viewDiv.className = "merge-accept-gutter-marker";

				// Create background
				const background = document.createElement("div");
				background.className = "background";
				viewDiv.appendChild(background);

				// Create checkbox container
				const checkboxDiv = document.createElement("div");
				checkboxDiv.className = "checkbox";

				// Create checkbox background
				const checkboxBg = document.createElement("div");
				checkboxBg.className = "checkbox-background";

				// Use the checkbox renderer
				const checkboxBtn = renderCheckbox(state, inputNumber, conflict.id, () => toggleInputState(conflict.id, inputNumber));

				checkboxBg.appendChild(checkboxBtn);
				checkboxDiv.appendChild(checkboxBg);
				viewDiv.appendChild(checkboxDiv);

				gutterContainer.appendChild(viewDiv);
				gutterViewsRef.current.set(key, viewDiv);
			}

			// Update position
			viewDiv.style.top = `${top}px`;
			viewDiv.style.height = `${height}px`;

			// Update checkbox visual state by replacing with new renderer output
			const checkboxBg = viewDiv.querySelector(".checkbox-background");
			if (checkboxBg) {
				// Clear existing checkbox
				checkboxBg.innerHTML = "";

				// Create new checkbox with current state using the renderer
				const newCheckboxBtn = renderCheckbox(state, inputNumber, conflict.id, () => toggleInputState(conflict.id, inputNumber));

				checkboxBg.appendChild(newCheckboxBtn);
			}

			// Update classes based on state
			const isHandled = conflict.handled;
			const isFocused = conflict.focused;
			const isMultiLine = height > 30;

			viewDiv.className = "merge-accept-gutter-marker";
			if (isHandled) viewDiv.classList.add("handled");
			if (isFocused) viewDiv.classList.add("focused");
			if (isMultiLine) viewDiv.classList.add("multi-line");
			else viewDiv.classList.add("single-line");

			// Position checkbox vertically (smart centering like VSCode)
			const checkboxDiv = viewDiv.querySelector(".checkbox") as HTMLDivElement;
			if (checkboxDiv) {
				const checkboxHeight = 24; // Fixed checkbox height
				const middleHeight = height / 2 - checkboxHeight / 2;
				const margin = checkboxHeight;

				let effectiveCheckboxTop = middleHeight;

				// Preferred viewport range
				const preferredViewPortMin = margin;
				const preferredViewPortMax = viewHeight - margin - checkboxHeight;

				// Preferred parent range
				const preferredParentMin = margin;
				const preferredParentMax = height - checkboxHeight - margin;

				if (preferredParentMin < preferredParentMax) {
					// Clamp to viewport
					effectiveCheckboxTop = Math.max(preferredViewPortMin, Math.min(effectiveCheckboxTop + top, preferredViewPortMax)) - top;
					// Clamp to parent
					effectiveCheckboxTop = Math.max(preferredParentMin, Math.min(effectiveCheckboxTop, preferredParentMax));
				}

				checkboxDiv.style.top = `${effectiveCheckboxTop + 5}px`;
			}
		},
		[toggleInputState, renderCheckbox],
	);

	// Render checkbox gutters
	const renderCheckboxGutters = useCallback(() => {
		// Only render checkboxes when result column is visible
		if (!showResultColumn) {
			// Clear any existing checkboxes
			const allViews = gutterViewsRef.current;
			for (const [key, view] of allViews.entries()) {
				view.remove();
				allViews.delete(key);
			}
			return;
		}

		if (!input1EditorRef.current || !input2EditorRef.current || !input1GutterRef.current || !input2GutterRef.current) {
			return;
		}

		const monacoInstance = monacoRef.current;

		if (!monacoInstance) {
			return;
		}

		const isDark = theme === "vs-dark" || (typeof theme === "string" && theme.includes("dark"));

		// Position the gutter containers in Monaco's decorations area
		const decorationsLeft1 = getDecorationsLeft(input1EditorRef.current);
		const decorationsWidth1 = getDecorationsWidth(input1EditorRef.current);
		const decorationsLeft2 = getDecorationsLeft(input2EditorRef.current);
		const decorationsWidth2 = getDecorationsWidth(input2EditorRef.current);

		// Position gutters in the decorations area
		input1GutterRef.current.style.left = `${decorationsLeft1}px`;
		input1GutterRef.current.style.width = `${decorationsWidth1}px`;
		input2GutterRef.current.style.left = `${decorationsLeft2}px`;
		input2GutterRef.current.style.width = `${decorationsWidth2}px`;

		// Get visible ranges
		const visibleRanges = input1EditorRef.current.getVisibleRanges();
		if (!visibleRanges || visibleRanges.length === 0) return;

		const scrollTop = input1EditorRef.current.getScrollTop();
		const viewHeight = input1GutterRef.current.clientHeight;

		// Track which views we need to keep
		const viewsToKeep = new Set<string>();

		// Render checkbox for each conflict
		for (const conflict of conflicts) {
			if (conflict.input1Diffs.length === 0 && conflict.input2Diffs.length === 0) continue;

			// Render input1 checkbox
			if (conflict.input1Diffs.length > 0) {
				const key = `${conflict.id}-input1`;
				viewsToKeep.add(key);
				renderCheckboxGutterItem(input1GutterRef.current, key, conflict, 1, scrollTop, viewHeight, isDark);
			}

			// Render input2 checkbox
			if (conflict.input2Diffs.length > 0) {
				const key = `${conflict.id}-input2`;
				viewsToKeep.add(key);
				renderCheckboxGutterItem(input2GutterRef.current, key, conflict, 2, scrollTop, viewHeight, isDark);
			}
		}

		// Remove unused views
		const allViews = gutterViewsRef.current;
		for (const [key, view] of allViews.entries()) {
			if (!viewsToKeep.has(key)) {
				view.remove();
				allViews.delete(key);
			}
		}
	}, [conflicts, theme, showResultColumn, getDecorationsLeft, getDecorationsWidth, renderCheckboxGutterItem]);

	// Get theme color from Monaco's color registry
	const getThemeColor = useCallback((colorKey: string, fallback: string): string => {
		try {
			// Try to get from Monaco's theme definition
			if (monacoRef.current) {
				const currentTheme = (monacoRef.current.editor as { getTheme?: () => { colors?: Record<string, string> } }).getTheme?.();
				if (currentTheme?.colors?.[colorKey]) {
					return currentTheme.colors[colorKey];
				}
			}
		} catch (_e) {
			// Fall through to default
		}
		return fallback;
	}, []);

	// Apply decorations using Monaco theme colors
	const applyDecorations = useCallback(() => {
		if (!monacoRef.current || !input1EditorRef.current || !input2EditorRef.current) {
			return;
		}

		const monacoInstance = monacoRef.current;

		// Detect if theme is dark or light
		const isDark = theme === "vs-dark" || (typeof theme === "string" && theme.includes("dark"));

		// Use Monaco's merge editor theme colors
		const conflictColor = getThemeColor("mergeEditor.change.background", isDark ? "rgba(255, 166, 0, 0.2)" : "rgba(255, 166, 0, 0.15)");

		const changeColor = getThemeColor(
			"diffEditor.insertedTextBackground",
			isDark ? "rgba(155, 185, 85, 0.2)" : "rgba(155, 185, 85, 0.15)",
		);

		const baseColor = getThemeColor(
			"mergeEditor.changeBase.background",
			isDark ? "rgba(255, 100, 100, 0.2)" : "rgba(255, 100, 100, 0.15)",
		);

		// Overview ruler colors - use theme colors with more opacity
		const conflictOverviewColor = getThemeColor(
			"editorOverviewRuler.modifiedForeground",
			isDark ? "rgba(255, 166, 0, 0.8)" : "rgba(255, 166, 0, 1)",
		);
		const changeOverviewColor = getThemeColor(
			"editorOverviewRuler.addedForeground",
			isDark ? "rgba(155, 185, 85, 0.8)" : "rgba(155, 185, 85, 1)",
		);
		const baseOverviewColor = getThemeColor(
			"editorOverviewRuler.deletedForeground",
			isDark ? "rgba(255, 100, 100, 0.8)" : "rgba(255, 100, 100, 1)",
		);

		// Check if we're in 2-column mode (no base)
		const isTwoColumnMode = !baseEditorRef.current;

		// Create decoration configuration
		const decorationConfig: DecorationConfig = {
			conflictColor,
			changeColor,
			baseColor,
			conflictOverviewColor,
			changeOverviewColor,
			baseOverviewColor,
		};

		// Create all decorations using the extracted utility functions
		const { input1Decorations, input2Decorations, baseDecorations } = createAllDecorations(
			conflicts,
			isTwoColumnMode,
			decorationConfig,
			monacoInstance,
		);

		// Get theme colors for checkbox UI
		const checkboxBgColor = getThemeColor("input.background", isDark ? "#3c3c3c" : "#f3f3f3");
		const checkboxBorderColor = getThemeColor("input.border", isDark ? "#6b6b6b" : "#c8c8c8");
		const checkboxFocusBorderColor = getThemeColor("focusBorder", isDark ? "#007acc" : "#0078d4");
		const checkboxCheckedColor = getThemeColor("inputOption.activeForeground", isDark ? "#3794ff" : "#0078d4");

		// Inject CSS using theme colors
		const styleId = "monaco-three-way-diff-dynamic";
		let styleEl = document.getElementById(styleId) as HTMLStyleElement;
		if (!styleEl) {
			styleEl = document.createElement("style");
			styleEl.id = styleId;
			document.head.appendChild(styleEl);
		}

		// Compute colors for different conflict types
		const sameChangeColor = getThemeColor(
			"diffEditor.insertedTextBackground",
			isDark ? "rgba(100, 100, 255, 0.15)" : "rgba(100, 100, 255, 0.1)",
		);

		// INPUT1_ONLY means theirs added something (incoming addition that's accepted)
		// Should be green (addition color), same as input2Only
		const input1OnlyColor = getThemeColor(
			"diffEditor.insertedTextBackground",
			isDark ? "rgba(155, 185, 85, 0.2)" : "rgba(155, 185, 85, 0.15)",
		);

		styleEl.textContent = `
      /* True conflict - both sides changed differently (orange/amber) */
      .monaco-editor .merge-conflict-incoming,
      .monaco-editor .merge-conflict-current {
        background-color: ${conflictColor};
      }

      /* Single-side change (green for input2/ours, orange for input1/theirs in 3-way) */
      .monaco-editor .merge-change-incoming {
        background-color: ${input1OnlyColor};
      }
      .monaco-editor .merge-change-current {
        background-color: ${changeColor};
      }

      /* 2-way diff mode: red for deletions (input1 column) */
      .monaco-editor .merge-2way-deletion {
        background-color: ${baseColor};
      }

      /* Same change on both sides (blue/purple) */
      .monaco-editor .merge-same-change {
        background-color: ${sameChangeColor};
      }

      /* Base changes */
      .monaco-editor .merge-conflict-base,
      .monaco-editor .merge-change-base {
        background-color: ${baseColor};
      }

      /* Invalid JSON in result column */
      .monaco-editor .merge-result-invalid {
        background-color: ${isDark ? "rgba(255, 0, 0, 0.2)" : "rgba(255, 0, 0, 0.1)"};
        outline: 1px solid ${isDark ? "rgba(255, 100, 100, 0.5)" : "rgba(255, 0, 0, 0.3)"};
      }

      /* VSCode-style checkbox gutter - positioned at Monaco's glyph margin */
      .merge-editor-gutter {
        position: absolute;
        height: 100%;
        top: 0;
        z-index: 10;
        pointer-events: none;
        overflow: visible;
      }

      .merge-accept-gutter-marker {
        position: absolute;
        pointer-events: all;
      }

      .merge-accept-gutter-marker .background {
        position: absolute;
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        pointer-events: none;
      }

      .merge-accept-gutter-marker .checkbox {
        position: absolute;
        width: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        left: 6px;
      }

      .merge-accept-gutter-marker .checkbox-background {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background-color: ${checkboxBgColor};
        border: 1px solid ${checkboxBorderColor};
      }

      .merge-accept-gutter-marker.focused .checkbox-background {
        border-color: ${checkboxFocusBorderColor};
        border-width: 2px;
      }

      .merge-accept-gutter-marker.handled .checkbox-background {
        opacity: 0.6;
      }

      /* Native checkbox styles */
      .native-checkbox-container {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        cursor: pointer;
      }

      .native-checkbox {
        width: 16px;
        height: 16px;
        cursor: pointer;
        margin: 0;
        accent-color: ${checkboxCheckedColor};
      }

      /* Result column status indicator */
      .merge-result-status-indicator {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding-left: 4px;
        cursor: help;
        user-select: none;
        z-index: 10;
      }

      .merge-result-status-indicator .status-icon {
        font-weight: bold;
        line-height: 1;
      }

      .native-checkbox:hover {
        opacity: 0.8;
      }

      .native-checkbox:focus {
        outline: 2px solid ${checkboxFocusBorderColor};
        outline-offset: 2px;
      }
    `;
		// Apply decorations, replacing old ones
		if (!input1DecorationsRef.current) {
			input1DecorationsRef.current = input1EditorRef.current.createDecorationsCollection([]);
		}
		input1DecorationsRef.current.set(input1Decorations);

		if (!input2DecorationsRef.current) {
			input2DecorationsRef.current = input2EditorRef.current.createDecorationsCollection([]);
		}
		input2DecorationsRef.current.set(input2Decorations);

		// Only apply base decorations if base editor exists (3-column mode)
		if (baseEditorRef.current) {
			if (!baseDecorationsRef.current) {
				baseDecorationsRef.current = baseEditorRef.current.createDecorationsCollection([]);
			}
			baseDecorationsRef.current.set(baseDecorations);
		}
	}, [conflicts, theme, getThemeColor]);

	const createEditor = useCallback(() => {
		if (!preventCreation.current && containerRef.current && monacoRef.current && !isMonacoMounting) {
			const monacoInstance = monacoRef.current;

			// Clear container
			containerRef.current.innerHTML = "";

			// Create layout
			const wrapper = document.createElement("div");
			wrapper.style.display = "flex";
			wrapper.style.height = "100%";
			wrapper.style.width = "100%";

			// Detect theme colors
			const isDark = theme === "vs-dark" || (typeof theme === "string" && theme.includes("dark"));
			const borderColor = isDark ? "#444" : "#ddd";
			const foregroundColor = isDark ? "#fff" : "#333";

			// Helper to get theme colors (same as getThemeColor but local to createEditor)
			const getThemeColorLocal = (colorKey: string, fallback: string): string => {
				try {
					const currentTheme = (monacoInstance.editor as { getTheme?: () => { colors?: Record<string, string> } }).getTheme?.();
					if (currentTheme?.colors?.[colorKey]) {
						return currentTheme.colors[colorKey];
					}
				} catch (_e) {
					// Fall through to default
				}
				return fallback;
			};

			// Get theme colors for column headers
			const input1HeaderBg = getThemeColorLocal("mergeEditor.conflict.input1.header.background", isDark ? "#4B1818" : "#FFE6E6");
			const baseHeaderBg = getThemeColorLocal("editorGutter.background", isDark ? "#333" : "#f0f0f0");
			const input2HeaderBg = getThemeColorLocal("mergeEditor.conflict.input2.header.background", isDark ? "#1B4B18" : "#E6FFE6");
			const resultHeaderBg = getThemeColorLocal("mergeEditor.result.header.background", isDark ? "#7F5F00" : "#FFECB3");

			// Create editor containers
			const createEditorContainer = (label: string, color: string, withGutter = false) => {
				const container = document.createElement("div");
				container.style.flex = "1";
				container.style.display = "flex";
				container.style.flexDirection = "column";
				container.style.borderRight = `1px solid ${borderColor}`;

				const labelDiv = document.createElement("div");
				labelDiv.textContent = label;
				labelDiv.style.padding = "4px 8px";
				labelDiv.style.fontSize = "11px";
				labelDiv.style.fontWeight = "500";
				labelDiv.style.backgroundColor = color;
				labelDiv.style.color = foregroundColor;
				labelDiv.style.borderBottom = `1px solid ${borderColor}`;
				container.appendChild(labelDiv);

				const editorWrapper = document.createElement("div");
				editorWrapper.style.flex = "1";
				editorWrapper.style.position = "relative";
				editorWrapper.style.overflow = `hidden`;

				const editorDiv = document.createElement("div");
				editorDiv.style.position = "absolute";
				editorDiv.style.left = "0";
				editorDiv.style.right = "0";
				editorDiv.style.top = "0";
				editorDiv.style.bottom = "0";
				editorWrapper.appendChild(editorDiv);

				let gutterDiv: HTMLDivElement | null = null;
				if (withGutter) {
					gutterDiv = document.createElement("div");
					gutterDiv.className = "merge-editor-gutter";
					editorWrapper.appendChild(gutterDiv);
				}

				container.appendChild(editorWrapper);

				return { container, editorDiv, gutterDiv };
			};

			const input1 = createEditorContainer(labels?.input1 || "Theirs", input1HeaderBg, showResultColumn);
			const input2 = createEditorContainer(labels?.input2 || "Ours", input2HeaderBg, showResultColumn);

			// Save gutter refs
			if (input1.gutterDiv) input1GutterRef.current = input1.gutterDiv;
			if (input2.gutterDiv) input2GutterRef.current = input2.gutterDiv;

			// 2-column mode (no base) vs 3-column mode (with base)
			const hasBase = Boolean(base);
			let baseC: ReturnType<typeof createEditorContainer> | null = null;

			if (hasBase) {
				// 3-column mode: create base column
				baseC = createEditorContainer(labels?.base || "Base", baseHeaderBg, false);

				// Arrange columns based on baseIndex
				const orderedColumns: HTMLDivElement[] = [];

				if (baseIndex === 0) {
					// Base on left: [base, input1, input2]
					orderedColumns.push(baseC.container, input1.container, input2.container);
				} else if (baseIndex === 1) {
					// Base in middle: [input1, base, input2] (default)
					orderedColumns.push(input1.container, baseC.container, input2.container);
				} else if (baseIndex === 2) {
					// Base on right: [input1, input2, base]
					orderedColumns.push(input1.container, input2.container, baseC.container);
				}

				orderedColumns.forEach((col) => {
					wrapper.appendChild(col);
				});
			} else {
				// 2-column mode: only input1 and input2
				wrapper.appendChild(input1.container);
				wrapper.appendChild(input2.container);
			}

			// Create result column if enabled
			let resultC: { container: HTMLDivElement; editorDiv: HTMLDivElement; gutterDiv: HTMLDivElement | null } | null = null;
			if (showResultColumn) {
				resultC = createEditorContainer(labels?.result || "Result", resultHeaderBg, true); // Enable gutter for error indicators
				// Store reference to result label for validation error indicators
				resultLabelRef.current = resultC.container.querySelector("div") as HTMLDivElement;
				// Store reference to result gutter for error/warning indicators
				if (resultC.gutterDiv) resultGutterRef.current = resultC.gutterDiv;
				wrapper.appendChild(resultC.container);
			}

			containerRef.current.appendChild(wrapper);

			// Create models
			const input1Model = monacoInstance.editor.createModel(original || "", language);
			const baseModel = hasBase ? monacoInstance.editor.createModel(base || "", language) : null;
			const input2Model = monacoInstance.editor.createModel(modified || "", language);

			// Create editors
			input1EditorRef.current = monacoInstance.editor.create(input1.editorDiv, {
				model: input1Model,
				readOnly: true,
				automaticLayout: true,
				folding: !showResultColumn,
				glyphMargin: false,
				...options,
				lineDecorationsWidth: showResultColumn ? 26 : 10,
			});

			// Only create base editor if base exists
			if (hasBase && baseC) {
				baseEditorRef.current = monacoInstance.editor.create(baseC.editorDiv, {
					model: baseModel,
					readOnly: true,
					automaticLayout: true,
					folding: !showResultColumn,
					glyphMargin: false,
					...options,
					lineDecorationsWidth: 10,
				});
			}

			input2EditorRef.current = monacoInstance.editor.create(input2.editorDiv, {
				model: input2Model,
				readOnly: true,
				automaticLayout: true,
				folding: !showResultColumn,
				glyphMargin: false,
				...options,
				lineDecorationsWidth: showResultColumn ? 26 : 10,
			});

			// Create result editor if enabled
			if (showResultColumn && resultC) {
				// Initialize result with "ours" (modified/input2) content
				const resultModel = monacoInstance.editor.createModel(modified || "", language);
				resultEditorRef.current = monacoInstance.editor.create(resultC.editorDiv, {
					model: resultModel,
					automaticLayout: true,
					folding: !showResultColumn,
					glyphMargin: false,
					...options,
					readOnly: false,
					lineDecorationsWidth: 26,
				});

				// Add onChange listener to detect manual edits
				resultModel.onDidChangeContent(() => {
					// Only mark as manually edited if this wasn't a programmatic update
					if (!isProgrammaticUpdate.current) {
						setIsResultManuallyEdited(true);
					}
				});
			}

			// Set theme
			monacoInstance.editor.setTheme(theme);

			// Compute conflicts
			const detectedConflicts = computeDiffs(baseModel, input1Model, input2Model);
			setConflicts(detectedConflicts);

			preventCreation.current = true;

			// Call onMount
			if (onMount && input1EditorRef.current) {
				onMount(input1EditorRef.current as unknown as monaco.editor.IStandaloneDiffEditor, monacoInstance);
			}
		}
	}, [options, theme, original, modified, base, showResultColumn, baseIndex, isMonacoMounting, computeDiffs, onMount, labels]);

	// Detect showResultColumn, baseIndex, or comparisonMode changes and trigger recreation
	const prevShowResultRef = useRef(showResultColumn);
	const prevBaseIndexRef = useRef(baseIndex);
	const prevComparisonModeRef = useRef(comparisonMode);
	useEffect(() => {
		const showResultChanged = prevShowResultRef.current !== showResultColumn;
		const baseIndexChanged = prevBaseIndexRef.current !== baseIndex;
		const comparisonModeChanged = prevComparisonModeRef.current !== comparisonMode;

		if ((showResultChanged || baseIndexChanged || comparisonModeChanged) && preventCreation.current) {
			prevShowResultRef.current = showResultColumn;
			prevBaseIndexRef.current = baseIndex;
			prevComparisonModeRef.current = comparisonMode;

			// Clear gutter views
			gutterViewsRef.current.forEach((view) => {
				view.remove();
			});
			gutterViewsRef.current.clear();

			// Clear decoration collections before disposing
			input1DecorationsRef.current?.set([]);
			input2DecorationsRef.current?.set([]);
			baseDecorationsRef.current?.set([]);
			input1DecorationsRef.current = null;
			input2DecorationsRef.current = null;
			baseDecorationsRef.current = null;

			// Dispose current editors and models
			const input1Model = input1EditorRef.current?.getModel();
			const baseModel = baseEditorRef.current?.getModel();
			const input2Model = input2EditorRef.current?.getModel();
			const resultModel = resultEditorRef.current?.getModel();

			input1EditorRef.current?.dispose();
			baseEditorRef.current?.dispose();
			input2EditorRef.current?.dispose();
			resultEditorRef.current?.dispose();

			input1Model?.dispose();
			baseModel?.dispose();
			input2Model?.dispose();
			resultModel?.dispose();

			preventCreation.current = false;
			setEditorKey((prev) => prev + 1);
		}
	}, [showResultColumn, baseIndex, comparisonMode]);

	// Create editor when ready
	useEffect(() => {
		if (!isMonacoMounting && monacoRef.current && containerRef.current && !preventCreation.current) {
			createEditor();
		}
	}, [isMonacoMounting, createEditor]);

	// Apply decorations when conflicts change
	useEffect(() => {
		if (isEditorReady && conflicts.length > 0) {
			applyDecorations();
			// Render checkbox gutters
			renderCheckboxGutters();
		}
	}, [isEditorReady, conflicts, applyDecorations, renderCheckboxGutters]);

	// Update result editor when conflicts or showResultColumn changes
	useEffect(() => {
		if (isEditorReady && conflicts.length > 0 && showResultColumn && resultEditorRef.current) {
			updateResultEditor(conflicts);
		}
	}, [isEditorReady, conflicts, showResultColumn, updateResultEditor]);

	// Add scroll listener for gutter updates (including result column indicators)
	useEffect(() => {
		if (!isEditorReady) return;

		// Update result gutter indicators on scroll
		const updateResultIndicators = () => {
			if (conflictIssues.length > 0) {
				renderConflictIssueMarkers(conflictIssues);
			}
		};

		const disposables: monaco.IDisposable[] = [];

		const updateGutters = () => {
			renderCheckboxGutters();
		};

		// Listen to scroll changes
		if (input1EditorRef.current) {
			disposables.push(input1EditorRef.current.onDidScrollChange(updateGutters));
		}
		if (input2EditorRef.current) {
			disposables.push(input2EditorRef.current.onDidScrollChange(updateGutters));
		}
		if (resultEditorRef.current && showResultColumn) {
			disposables.push(resultEditorRef.current.onDidScrollChange(updateResultIndicators));
			disposables.push(resultEditorRef.current.onDidLayoutChange(updateResultIndicators));
		}

		// Listen to view zone changes (using onDidLayoutChange as alternative)
		if (input1EditorRef.current) {
			disposables.push(input1EditorRef.current.onDidLayoutChange(updateGutters));
		}
		if (input2EditorRef.current) {
			disposables.push(input2EditorRef.current.onDidLayoutChange(updateGutters));
		}

		return () => {
			disposables.forEach((d) => {
				d?.dispose();
			});
		};
	}, [isEditorReady, renderCheckboxGutters, renderConflictIssueMarkers, showResultColumn, conflictIssues]);

	// Scroll synchronization
	useEffect(() => {
		if (!isEditorReady) return;

		const editors = [input1EditorRef.current, baseEditorRef.current, input2EditorRef.current];
		if (showResultColumn && resultEditorRef.current) {
			editors.push(resultEditorRef.current);
		}

		const disposables: monaco.IDisposable[] = [];
		let isScrolling = false;

		const syncScroll = (source: monaco.editor.IStandaloneCodeEditor) => {
			if (isScrolling) return;
			isScrolling = true;
			const scrollTop = source.getScrollTop();
			const scrollLeft = source.getScrollLeft();
			editors.forEach((editor) => {
				if (editor && editor !== source) {
					editor.setScrollTop(scrollTop);
					editor.setScrollLeft(scrollLeft);
				}
			});
			setTimeout(() => {
				isScrolling = false;
			}, 10);
		};

		editors.forEach((editor) => {
			if (editor) {
				disposables.push(
					editor.onDidScrollChange(() => {
						syncScroll(editor);
					}),
				);
			}
		});

		return () => {
			disposables.forEach((d) => {
				d?.dispose();
			});
		};
	}, [isEditorReady, showResultColumn]);

	// Cleanup
	useEffect(() => {
		return () => {
			// Clear decoration collections before disposing
			input1DecorationsRef.current?.set([]);
			input2DecorationsRef.current?.set([]);
			baseDecorationsRef.current?.set([]);

			// Get models before disposing editors
			const input1Model = input1EditorRef.current?.getModel();
			const baseModel = baseEditorRef.current?.getModel();
			const input2Model = input2EditorRef.current?.getModel();
			const resultModel = resultEditorRef.current?.getModel();

			// Dispose editors first
			input1EditorRef.current?.dispose();
			baseEditorRef.current?.dispose();
			input2EditorRef.current?.dispose();
			resultEditorRef.current?.dispose();

			// Then dispose models
			input1Model?.dispose();
			baseModel?.dispose();
			input2Model?.dispose();
			resultModel?.dispose();

			preventCreation.current = false;
			setIsEditorReady(false);
		};
	}, []);

	if (isMonacoMounting || !isEditorReady) {
		return <>{loading ?? <DefaultLoader />}</>;
	}

	return <div ref={containerRef} style={{ width, height }} className={className} />;
}
