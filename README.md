# Lecture Pilot

An AI-powered VS Code extension that helps university lecturers create structured lecture content — from outline to slides, teleprompter scripts, and quiz questions — using LLMs directly inside the editor.

## Features

### Milestone-Based Lecture Generation

Lecture Pilot guides you through a structured content creation workflow using **milestones**:

1. **Initialize Lecture** — Generate a structured lecture outline with slide titles from a topic description and desired slide count.
2. **Brainstorm Literature** — Get literature suggestions (textbooks, papers, online resources) relevant to your lecture topic, with web search support.
3. **Generate Slides from Titles** — Automatically fill each slide section with content based on the generated outline.
4. **Generate Teleprompter** — Create speaker notes/teleprompter scripts for each slide.
5. **Generate Quiz Questions** — Produce quiz questions (Multiple Choice, Single Choice, True/False) based on the lecture content.

### AI Chat Sidebar

A built-in chat sidebar lets you interact with the LLM directly. The AI agent can read and edit your lecture file using tools — all file changes are previewed in a diff view and require your explicit approval before being applied.

### Background Watchers

- **Complexity Watcher** — Monitors your lecture content as you edit and flags sections that may be too complex for students.
- **Format Watcher** — Checks formatting rules (e.g., line length) and raises diagnostics in the Problems panel.

Both watchers are configurable and trigger automatically after a set number of character changes.

### Multi-Provider LLM Support

- **Google Gemini** — Supports Gemini 2.5 and 3.0 models.
- **OpenAI** — Supports GPT-5 family models.

Switch providers and models at any time via the status bar or command palette.

### DSL-Based Lecture Format

Lectures are written in Markdown with a custom DSL using HTML comment tags:

```markdown
---
lehrvideo: true
...
---
<!-- scene name="Introduction" -->
<!-- slide -->
# Introduction
Slide content here...

<!-- teleprompter -->
Speaker notes for this slide...

<!-- quiz -->
## What is 2+2?
- 3 <!-- false -->
- 4 <!-- true -->
- 5 <!-- false -->
```

## Requirements

- **VS Code** 1.105.0 or later
- An API key for at least one supported LLM provider:
  - [Google AI Studio](https://aistudio.google.com/) (for Gemini models)
  - [OpenAI Platform](https://platform.openai.com/) (for GPT models)

## Getting Started

1. Install the extension (via `.vsix` or from source).
2. Open the Command Palette (`Ctrl+Shift+P`) and run **Lecture Pilot: Set API Key for Current Provider**.
3. Open or create a `.md` file.
4. Use the **Lecture Pilot** sidebar or run milestone commands from the Command Palette.

## Commands

All commands are available via `Ctrl+Shift+P` under the **Lecture Pilot** category:

| Command | Description |
|---|---|
| `Set Language for LLM` | Set response language (English / German) |
| `Set Model for LLM` | Choose the LLM model |
| `Set Thinking Level for LLM` | Set reasoning depth (Low / Medium / High) |
| `Set API Key for Current Provider` | Store your API key securely |
| `Clear API Key for Current Provider` | Remove stored API key |
| `Initialize Lecture` | Generate a lecture outline |
| `Brainstorm New Lecture` | Get literature suggestions |
| `Generate Content From Titles` | Fill slides with content |
| `Generate Teleprompter From Slides` | Create speaker notes |
| `Generate Quiz Questions` | Generate quiz questions |
| `Toggle Complexity Watcher` | Enable/disable complexity analysis |
| `Start Complexity Analysis` | Run complexity analysis manually |
| `Toggle Format Watcher` | Enable/disable format checking |
| `Start Format Analysis` | Run format analysis manually |

## Extension Settings

Configure via `File > Preferences > Settings` and search for **Lecture Pilot**:

| Setting | Default | Description |
|---|---|---|
| `lecturepilot.language` | `en` | Language for LLM responses (`en` or `de`) |
| `lecturepilot.model` | `gemini-2.5-flash-lite` | LLM model to use |
| `lecturepilot.thinking` | `low` | Thinking level: `low`, `medium`, or `high` |
| `lecturepilot.complexityChangesUntilAnalysis` | `200` | Character changes before complexity analysis triggers |
| `lecturepilot.complexityMinAnalysisIntervalSeconds` | `10` | Minimum seconds between complexity analyses |
| `lecturepilot.complexityAnalysisGenerationAttempts` | `3` | Retry attempts for complexity analysis |
| `lecturepilot.maxNumberOfCharsInLine` | `80` | Max characters per line for format checking |
| `lecturepilot.formatChangesUntilAnalysis` | `200` | Character changes before format analysis triggers |
| `lecturepilot.formatMinAnalysisIntervalSeconds` | `10` | Minimum seconds between format analyses |
| `lecturepilot.formatAnalysisGenerationAttempts` | `3` | Retry attempts for format analysis |

## Building from Source

```bash
# Install dependencies
npm install
cd webview-ui && npm install && cd ..

# Build everything (webview + extension)
npm run build:all

# Package as .vsix
npx @vscode/vsce package --allow-missing-repository
```

## Development

```bash
# Watch mode (extension + webview)
npm run watch:all

# Run tests
npm test

# Lint
npm run lint
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

## License

Apache License 2.0
