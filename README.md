# React Monaco JSON Merge

<div align="center">

**A powerful React component for 3-way JSON merging with semantic comparison, built on Monaco Editor**

[![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4.1-646CFF?logo=vite)](https://vite.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## ✨ Features

### Core Capabilities

- **🔀 3-Way Merge** - Compare base, theirs, and ours versions side-by-side
- **🎨 Monaco Editor Integration** - Powered by VS Code's Monaco Editor for a familiar editing experience
- **🧠 Semantic JSON Comparison** - Uses JSON Patch (RFC 6902) for intelligent, structure-aware diffing
- **📋 Schema-Aware** - Optional JSON Schema support for enhanced conflict detection and validation
- **✅ Interactive Resolution** - Checkboxes for accepting/rejecting changes
- **🔀 Smart Merging** - Automatically merges compatible conflicts
- **⚡ Real-time Validation** - JSON validation with error highlighting
- **🎯 4-Column Mode** - Optional result preview column for live merge preview
- **🎨 Theme Support** - Light and dark themes (VS Code/monaco themes)
- **♿ Accessible** - Keyboard navigation and screen reader support

### Technical Highlights

- **Zero Line-based Diffs** - Uses semantic JSON comparison, ignoring formatting changes
- **Array Matching by ID** - Schema-aware array item matching (not just by index)
- **Conflict Type Detection** - Identifies SAME_CHANGE, INPUT1_ONLY, INPUT2_ONLY, and TRUE_CONFLICT
- **Deep Merge Support** - Automatically merges nested objects when possible
- **TypeScript First** - Fully typed with comprehensive type definitions

## 🚀 Quick Start

### Installation

```bash
npm install react-monaco-json-merge
```

### Basic Usage

```tsx
import { JsonDiffMergeEditor } from 'react-monaco-json-merge';
import 'react-monaco-json-merge/dist/style.css';

function App() {
  const base = JSON.stringify({ name: "John", age: 30 }, null, 2);
  const theirs = JSON.stringify({ name: "John", age: 31, city: "NYC" }, null, 2);
  const ours = JSON.stringify({ name: "Jane", age: 30 }, null, 2);

  return (
    <JsonDiffMergeEditor
      base={base}
      original={theirs}
      modified={ours}
      showResultColumn={true}
      height="600px"
      onMergeResolve={(content, resolution) => {
        if (resolution?.isValid) {
          console.log('Merged JSON:', JSON.parse(content));
        }
      }}
    />
  );
}
```

## 📖 Documentation

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `base` | `string` | `""` | Common ancestor JSON (stringified) |
| `original` | `string` | `""` | "Theirs" version JSON (stringified) |
| `modified` | `string` | `""` | "Ours" version JSON (stringified) |
| `showResultColumn` | `boolean` | `false` | Show merged result preview column |
| `theme` | `string` | `"vs"` | Monaco Editor theme (`"vs"`, `"vs-dark"`, `"hc-black"`) |
| `height` | `string \| number` | `"100%"` | Editor height |
| `width` | `string \| number` | `"100%"` | Editor width |
| `schema` | `JSONSchema` | `undefined` | JSON Schema for validation and array matching |
| `labels` | `object` | `undefined` | Custom column labels |
| `onMergeResolve` | `function` | `undefined` | Callback when merge resolution changes |
| `options` | `object` | `{}` | Monaco Editor options |
| `comparisonMode` | `"split" \| "sequential"` | `"split"` | How to display the comparison |
| `baseIndex` | `0 \| 1 \| 2` | `1` | Position of base column (0=left, 1=middle, 2=right) |

### Advanced Example

```tsx
import { JsonDiffMergeEditor } from 'react-monaco-json-merge';
import type { JSONSchema } from 'react-monaco-json-merge';

const schema: JSONSchema = {
  type: "object",
  properties: {
    users: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" }
        },
        required: ["id"]
      }
    }
  }
};

function AdvancedEditor() {
  return (
    <JsonDiffMergeEditor
      base={baseJSON}
      original={theirsJSON}
      modified={oursJSON}
      schema={schema}
      showResultColumn={true}
      theme="vs-dark"
      height="700px"
      labels={{
        input1: "Remote Changes",
        base: "Common Ancestor",
        input2: "Local Changes",
        result: "Merged Result"
      }}
      onMergeResolve={(content, resolution) => {
        if (resolution?.isValid) {
          // Save merged content
          saveToFile(content);
        } else {
          // Handle validation errors
          console.error('Merge has conflicts:', resolution?.conflictIssues);
        }
      }}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        lineNumbers: 'on'
      }}
    />
  );
}
```

## 🏗️ Architecture

### Semantic vs Line-Based Diff

Unlike traditional diff tools that compare text line-by-line, this editor uses **semantic JSON comparison**:

1. **Parses JSON** to structured objects
2. **Generates JSON Patch** operations (RFC 6902)
3. **Groups patches** by JSON path
4. **Maps to line numbers** using jsonc-parser
5. **Applies Monaco decorations** based on JSON structure

**Benefits:**
- Ignores formatting changes (whitespace, key order)
- Schema-aware array matching (by ID, not index)
- Better conflict detection for nested JSON
- Highlights actual value changes, not formatting

### Conflict Types

The editor identifies four conflict types:

- **`SAME_CHANGE`** - Both sides made identical changes (auto-merged)
- **`INPUT1_ONLY`** - Only "theirs" changed (can be accepted)
- **`INPUT2_ONLY`** - Only "ours" changed (can be accepted)
- **`TRUE_CONFLICT`** - Both sides changed to different values (requires resolution)

### Smart Merging

When both checkboxes are selected for a `TRUE_CONFLICT`:
- If both values are objects: **deep merge** is performed
- If values are identical: uses either value
- If incompatible types: merge fails, shows warning

## 🛠️ Development

### Prerequisites

- **Node.js** >= 20.19.0
- **npm** >= 10.0.0

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd react-monaco-json-merge

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

```bash
# Development
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Code Quality
npm run type-check       # TypeScript type checking
npm run lint             # Lint code with Biome
npm run lint:fix         # Fix linting issues
npm run format           # Format code

# Testing
npm run test             # Run tests in watch mode
npm run test:run         # Run tests once
npm run test:ui          # Run tests with UI
npm run test:coverage    # Generate coverage report

# Utilities
npm run validate         # Run all checks (type-check + lint + test)
npm run clean            # Remove build artifacts
```

### Project Structure

```
react-monaco-json-merge/
├── src/
│   ├── components/
│   │   └── editor.tsx          # Main JsonDiffMergeEditor component
│   ├── data/
│   │   └── sampleData.ts       # Sample data for demo
│   ├── utils/
│   │   ├── diffMerge.ts        # Merge logic
│   │   ├── jsonPatchDiff.ts    # Diff computation
│   │   ├── editorDecorations.ts # Monaco decorations
│   │   ├── helpers.ts          # Utility functions
│   │   └── schema.ts           # Schema utilities
│   ├── types/
│   │   └── index.ts            # TypeScript definitions
│   ├── styles/
│   │   └── editor.css          # Editor styles
│   ├── Demo.tsx                # Demo application
│   └── main.tsx                # Entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🧪 Testing

The project includes comprehensive test coverage:

- **Unit Tests** - Utilities and helpers (94+ tests)
- **Integration Tests** - Full editor rendering scenarios
- **Rendering Tests** - Conflict detection and highlighting
- **Schema Tests** - JSON Schema variant handling

Run tests with:
```bash
npm run test
```

View coverage report:
```bash
npm run test:coverage
```

## 📦 Dependencies

### Core
- **React 19** - UI framework
- **Monaco Editor** - Code editor
- **fast-json-patch** - JSON Patch (RFC 6902) implementation
- **jsonc-parser** - JSON with comments parsing

### Utilities
- **fast-deep-equal** - Deep equality comparison
- **sort-keys** - Object key sorting

### Development
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Vitest** - Testing framework
- **Biome** - Linting and formatting

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Ensure all tests pass (`npm run validate`)
- Follow the existing code style (enforced by Biome)
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - The editor that powers this component
- [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch) - JSON Patch implementation
- [JSON Schema](https://json-schema.org/) - Schema validation standard

## 📞 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Made with ❤️ for better JSON merging experiences**
