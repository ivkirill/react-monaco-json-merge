import { useCallback, useMemo, useState } from "react";
import { JsonDiffMergeEditor } from "./components/editor";
import { getSampleData } from "./data/sampleData";
import type { ResolutionInfo } from "./types";
import "./demo.css";

export function Demo() {
	const data = useMemo(() => getSampleData(), []);
	const [resolution, setResolution] = useState<ResolutionInfo | null>(null);
	const [mergedContent, setMergedContent] = useState<string>("");

	// Interactive controls
	const [showResultColumn, setShowResultColumn] = useState(true);
	const [theme, setTheme] = useState<"vs" | "vs-dark">("vs-dark");
	const [comparisonMode, setComparisonMode] = useState<"split" | "sequential">("split");
	const [baseIndex, setBaseIndex] = useState<0 | 1 | 2>(1);
	const [mode, setMode] = useState<"3-way" | "2-way">("3-way");
	const [height, setHeight] = useState("600px");

	// Monaco editor options
	const [readOnly, setReadOnly] = useState(false);
	const [lineNumbers, setLineNumbers] = useState<"on" | "off" | "relative">("on");
	const [minimap, setMinimap] = useState(true);
	const [wordWrap, setWordWrap] = useState<"on" | "off">("off");
	const [fontSize, setFontSize] = useState(13);

	const editorOptions = useMemo(
		() => ({
			readOnly,
			lineNumbers,
			minimap: { enabled: minimap },
			wordWrap,
			fontSize,
			theme,
		}),
		[readOnly, lineNumbers, minimap, wordWrap, theme, fontSize],
	);

	const handleMergeResolve = useCallback((content: string, res?: ResolutionInfo) => {
		setMergedContent(content);
		setResolution(res || null);
	}, []);

	const saveMerge = () => {
		console.log("Merge resolved:", { mergedContent, resolution });
		alert("Merge resolution saved! Check console for details.");
	};

	return (
		<div className="demo-container">
			<header className="demo-header">
				<h1>Monaco JSON Diff Merge Editor - Interactive Demo</h1>
				<p>Explore different configurations and modes</p>
			</header>

			<div className="demo-content">
				<div className="controls-panel">
					<h2>Editor Controls</h2>

					<div className="control-group">
						<label>
							<strong>Theme:</strong>
							<select value={theme} onChange={(e) => setTheme(e.target.value as "vs" | "vs-dark")}>
								<option value="vs">Light (vs)</option>
								<option value="vs-dark">Dark (vs-dark)</option>
							</select>
						</label>
					</div>

					<div className="control-group">
						<label>
							<strong>Mode:</strong>
							<div className="radio-group">
								<label>
									<input
										type="radio"
										name="mode"
										value="3-way"
										checked={mode === "3-way"}
										onChange={(e) => setMode(e.target.value as "3-way")}
									/>
									3-Way Merge (with base)
								</label>
								<label>
									<input
										type="radio"
										name="mode"
										value="2-way"
										checked={mode === "2-way"}
										onChange={(e) => setMode(e.target.value as "2-way")}
									/>
									2-Way Diff (no base)
								</label>
							</div>
						</label>
					</div>

					{mode === "3-way" && (
						<>
							<div className="control-group">
								<label>
									<strong>Base Position:</strong>
									<select value={baseIndex} onChange={(e) => setBaseIndex(Number(e.target.value) as 0 | 1 | 2)}>
										<option value="0">Left (Theirs - Base - Ours)</option>
										<option value="1">Middle (Theirs - Base - Ours)</option>
										<option value="2">Right (Theirs - Ours - Base)</option>
									</select>
								</label>
							</div>

							<div className="control-group">
								<label>
									<input
										type="checkbox"
										checked={showResultColumn}
										onChange={(e) => setShowResultColumn(e.target.checked)}
									/>
									Show Result Column
								</label>
							</div>
						</>
					)}

					<div className="control-group">
						<label>
							<strong>Comparison Mode:</strong>
							<select value={comparisonMode} onChange={(e) => setComparisonMode(e.target.value as "split" | "sequential")}>
								<option value="split">Split (side-by-side arrays)</option>
								<option value="sequential">Sequential (match by index)</option>
							</select>
						</label>
					</div>

					<div className="control-group">
						<label>
							<strong>Height:</strong>
							<select value={height} onChange={(e) => setHeight(e.target.value)}>
								<option value="400px">Small (400px)</option>
								<option value="600px">Medium (600px)</option>
								<option value="800px">Large (800px)</option>
								<option value="100vh">Full Screen</option>
							</select>
						</label>
					</div>

					<div className="info-section">
						<h3>Editor Options:</h3>

						<div className="control-group">
							<label>
								<input type="checkbox" checked={minimap} onChange={(e) => setMinimap(e.target.checked)} />
								<strong>Show Minimap</strong>
							</label>
						</div>

						<div className="control-group">
							<label>
								<input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
								<strong>Read Only</strong>
							</label>
						</div>

						<div className="control-group">
							<label>
								<strong>Line Numbers:</strong>
								<select value={lineNumbers} onChange={(e) => setLineNumbers(e.target.value as "on" | "off")}>
									<option value="on">On</option>
									<option value="off">Off</option>
								</select>
							</label>
						</div>

						<div className="control-group">
							<label>
								<strong>Word Wrap:</strong>
								<select value={wordWrap} onChange={(e) => setWordWrap(e.target.value as "on" | "off")}>
									<option value="off">Off</option>
									<option value="on">On</option>
								</select>
							</label>
						</div>

						<div className="control-group">
							<label>
								<strong>Font Size: {fontSize}px</strong>
								<input
									type="range"
									min="10"
									max="20"
									value={fontSize}
									onChange={(e) => setFontSize(Number(e.target.value))}
									style={{ width: "100%" }}
								/>
							</label>
						</div>
					</div>

					<div className="info-section">
						<h3>Current Configuration:</h3>
						<ul>
							<li>
								Mode: <strong>{mode === "3-way" ? "3-Way Merge" : "2-Way Diff"}</strong>
							</li>
							<li>
								Theme: <strong>{theme}</strong>
							</li>
							<li>
								Comparison: <strong>{comparisonMode}</strong>
							</li>
							{mode === "3-way" && (
								<li>
									Base at: <strong>{["Left", "Middle", "Right"][baseIndex]}</strong>
								</li>
							)}
							<li>
								Result column: <strong>{showResultColumn ? "Visible" : "Hidden"}</strong>
							</li>
						</ul>
					</div>

					<div className="info-section">
						<h3>About the Sample Data:</h3>
						<ul>
							<li>
								<strong>Theirs:</strong> Changed email, added language setting, modified item counts
							</li>
							<li>
								<strong>Ours:</strong> Changed name and theme, modified different item counts
							</li>
							<li>
								<strong>Conflicts:</strong> True conflicts on item counts, various one-sided changes
							</li>
						</ul>
					</div>
				</div>

				<div className="editor-section">
					<div className="editor-container">
						<JsonDiffMergeEditor
							base={mode === "3-way" ? data.base : undefined}
							original={data.theirs}
							modified={data.ours}
							schema={data.schema}
							showResultColumn={showResultColumn}
							theme={theme}
							height={height}
							comparisonMode={comparisonMode}
							baseIndex={baseIndex}
							options={editorOptions}
							onMergeResolve={handleMergeResolve}
							labels={{
								input1: "Theirs",
								base: "Base",
								input2: "Ours",
								result: "Result",
							}}
						/>
					</div>

					{resolution && (
						<div className="resolution-panel">
							<h3>Merge Resolution Status:</h3>
							<p>
								<strong>Valid:</strong> {resolution.isValid ? "✅ Yes" : "❌ No"}
							</p>
							{resolution.validationError && (
								<p className="error">
									<strong>Error:</strong> {resolution.validationError}
								</p>
							)}
							{resolution.warnings && resolution.warnings.length > 0 && (
								<div>
									<strong>Warnings:</strong>
									<ul>
										{resolution.warnings.map((w) => (
											<li key={w}>{w}</li>
										))}
									</ul>
								</div>
							)}
							{resolution.conflictIssues && resolution.conflictIssues.length > 0 && (
								<div>
									<strong>Conflict Issues:</strong>
									<ul>
										{resolution.conflictIssues.map((issue) => (
											<li key={`${issue.type}-${issue.conflictId}`} className={issue.type}>
												[{issue.type.toUpperCase()}] {issue.message}
											</li>
										))}
									</ul>
								</div>
							)}
							{mergedContent && (
								<div className="merged-preview">
									<strong>Merged Content Preview:</strong>
									<pre>
										{mergedContent.substring(0, 500)}
										{mergedContent.length > 500 ? "..." : ""}
									</pre>
								</div>
							)}
							<button type="button" onClick={saveMerge} disabled={!resolution.isValid}>
								{resolution.isValid ? "💾 Save Merge" : "⚠️ Fix Conflicts First"}
							</button>
						</div>
					)}
				</div>
			</div>

			<footer className="demo-footer">
				<p>
					<strong>Tip:</strong> Try switching between modes, themes, and configurations to see how the editor adapts!
				</p>
			</footer>
		</div>
	);
}
