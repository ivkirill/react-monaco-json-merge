import { useMemo, useState } from "react";
import { JsonDiffMergeEditor } from "./components/editor";
import { getSampleData } from "./data/sampleData";
import type { ResolutionInfo } from "./types";
import "./demo.css";

export function Demo() {
	const data = useMemo(() => getSampleData(), []);
	const [resolution, setResolution] = useState<ResolutionInfo | null>(null);
	const [mergedContent, setMergedContent] = useState<string>("");

	const handleMergeResolve = (content: string, res?: ResolutionInfo) => {
		setMergedContent(content);
		setResolution(res || null);
	};

	const saveMerge = () => {
		console.log("Merge resolved:", { mergedContent, resolution });
		alert("Merge resolution saved! Check console for details.");
	};

	return (
		<div className="demo-container">
			<header className="demo-header">
				<h1>Monaco JSON Diff Merge Editor - Demo</h1>
				<p>3-Way merge editor with semantic JSON comparison</p>
			</header>

			<div className="demo-content">
				<div className="info-panel">
					<h2>Sample Conflict Scenario</h2>
					<ul>
						<li>
							<strong>Base:</strong> Original user profile with 2 items
						</li>
						<li>
							<strong>Theirs:</strong> Changed email, added language setting, modified item counts, added diamond
						</li>
						<li>
							<strong>Ours:</strong> Changed name and theme, modified different item counts
						</li>
					</ul>

					<h3>How to use:</h3>
					<ol>
						<li>The editor shows 3 columns: Theirs (left), Base (middle), Ours (right)</li>
						<li>Conflicts are highlighted with checkboxes in the gutter</li>
						<li>Click checkboxes to accept/reject changes</li>
						<li>Enable "Result Column" to see the merged output</li>
					</ol>
				</div>

				<div className="editor-section">
					<div className="editor-container">
						<JsonDiffMergeEditor
							base={data.base}
							original={data.theirs}
							modified={data.ours}
							schema={data.schema}
							showResultColumn={true}
							theme="vs-dark"
							height="600px"
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
								<strong>Valid:</strong> {resolution.isValid ? "Yes" : "No"}
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
							{mergedContent && (
								<div>
									<strong>Merged Content:</strong>
									<pre>{mergedContent}</pre>
								</div>
							)}
							<button type="button" onClick={saveMerge} disabled={!resolution.isValid}>
								Save Merge
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
