
# Copilot Architecture & Design Instructions

## Overview
This document provides a deep technical explanation of the architecture, design patterns, and extensibility strategies of the Lecture-Pilot VS Code extension. It is intended for future maintainers and contributors who want to understand the rationale behind the system's structure and how to extend it safely and effectively.

---

## 1. Architectural Principles

- **Separation of Concerns:** Each major responsibility (LLM provider, tool execution, workflow, UI, etc.) is encapsulated in its own module or class.
- **Extensibility:** The system is designed to allow new LLM providers, tools, workflows (milestones), and background agents (watchers) to be added with minimal changes to existing code.
- **Security:** All file edits are previewed in a diff view and require explicit user approval, preventing accidental or malicious changes.
- **Testability:** Core logic is separated from VS Code APIs where possible, and logging is centralized for easier debugging.
- **Design Patterns:** The codebase uses the Template Method, Factory, Singleton, and Command patterns to maximize flexibility and maintainability.

---

## 2. Core Components & Design Patterns

### 2.1 Provider Layer (LLM Abstraction)
- **Location:** `src/LLM/Provider/`
- **Key Classes:**
	- `AbstractLLMProvider` (Template Method pattern): Defines the common interface and shared logic for all LLM providers.
	- `GoogleProvider`, `OpenAIProvider`: Concrete implementations for each LLM API.
	- `ProviderRegistry` (Factory pattern): Central routing and lifecycle management for providers. Adding a new provider only requires registration here and a new class.
- **Extensibility:** To add a new provider, implement a subclass of `AbstractLLMProvider` and register it in `ProviderRegistry`.

### 2.2 Tool Execution Layer
- **Location:** `src/LLM/Toolbox/`
- **Key Classes:**
	- `Toolkit`: Defines the schema and metadata for all available tools (as JSON schemas).
	- `ToolExecutor`: Securely executes tool actions, handling all file operations and user approval.
- **Security:** All edits (even batch edits) are previewed in a diff view (`CompareChanges.ts`) and require user approval.
- **Extensibility:** To add a new tool, define its schema in `Toolkit` and implement its handler in `ToolExecutor`.

### 2.3 Milestones (Workflow Modules)
- **Location:** `src/LLM/Milestones/`
- **Key Class:** `BaseMilestone` (Template Method pattern)
- **Purpose:** Encapsulate discrete, structured content generation tasks (e.g., outline, slides, teleprompter, quiz).
- **Extensibility:** To add a new workflow, subclass `BaseMilestone`, define a Zod schema for output, and register the class in `extension.ts`.

### 2.4 Watchers (Background Agents)
- **Location:** `src/LLM/Watchers/`
- **Key Class:** `BaseWatcher`
- **Purpose:** Run background analysis (e.g., complexity, formatting) on document changes, debounced and throttled.
- **Extensibility:** To add a new watcher, subclass `BaseWatcher` and register it in `extension.ts`.

### 2.5 Domain Specific Language (DSL) & Parsing
- **Location:** `src/GlobalVariables/DSLTags.ts`, `src/Utils/LectureFileHelper.ts`
- **Purpose:** All lecture content is structured using custom tags (e.g., `<!-- SLIDE -->`, `<!-- TELEPROMPTER -->`). Regex-based parsing enables robust extraction and manipulation of slide content.
- **Extensibility:** New tags or parsing logic can be added centrally.

### 2.6 Webview UI (Frontend)
- **Location:** `webview-ui/`
- **Stack:** React + Vite + Tailwind CSS
- **Integration:** Communicates with the extension host via message passing. The `LectureChatProvider` routes messages and LLM responses.

---

## 3. Extending the System

### 3.1 Adding a New LLM Provider
1. Create a new class in `src/LLM/Provider/` extending `AbstractLLMProvider`.
2. Implement required methods (model support, API calls, tool handling).
3. Register the provider in `ProviderRegistry`.

### 3.2 Adding a New Tool
1. Define the tool schema in `Toolkit`.
2. Implement the handler in `ToolExecutor`.
3. Tools are automatically available to all providers via the agent loop.

### 3.3 Adding a New Milestone (Workflow)
1. Subclass `BaseMilestone` in `src/LLM/Milestones/`.
2. Define a Zod schema for the output.
3. Implement prompt and execution logic.
4. Register in `extension.ts`.

### 3.4 Adding a New Watcher
1. Subclass `BaseWatcher` in `src/LLM/Watchers/`.
2. Implement prompt and analysis logic.
3. Register in `extension.ts`.

---

## 4. Design Rationale & Patterns

- **Template Method:** Used in `AbstractLLMProvider`, `BaseMilestone`, and `BaseWatcher` to define the skeleton of operations, allowing subclasses to override specific steps.
- **Factory:** `ProviderRegistry` acts as a factory and router for LLM providers.
- **Singleton:** `APIKeyManager` ensures secure, centralized management of API keys.
- **Command:** VS Code commands are registered for all major actions, enabling easy extension and UI integration.
- **Centralized Logging:** All major classes use the `Logger` utility for consistent, prefixed logging.
- **Schema-Driven Validation:** Zod schemas enforce structured outputs from LLMs, ensuring reliability and safety.
- **User-in-the-Loop Security:** All file edits are mediated by a diff preview and explicit user approval.

---

## 5. Future-Proofing & Extensibility

- **Adding Providers:** The provider registry and abstract base class make it trivial to add new LLMs or switch APIs.
- **Adding Tools:** The toolkit and executor pattern allow new file operations or agent actions to be added without touching core logic.
- **Adding Workflows:** Milestones are modular and can be composed or extended for new academic or content-generation tasks.
- **Adding Watchers:** Background analysis can be expanded for new quality, compliance, or formatting checks.
- **DSL Evolution:** The tag-based DSL is easy to extend for new content types or metadata.
- **Frontend:** The React webview is decoupled from backend logic, allowing UI/UX improvements without backend changes.

---

## 6. Summary Table

| Component         | Pattern(s)         | Extensibility Point         | File(s) / Folder(s)                |
|-------------------|--------------------|-----------------------------|-------------------------------------|
| LLM Providers     | Template, Factory  | Add new provider class      | src/LLM/Provider/                   |
| Tool Execution    | Registry, Command  | Add tool schema/handler     | src/LLM/Toolbox/                    |
| Milestones        | Template           | Add new milestone class     | src/LLM/Milestones/                 |
| Watchers          | Template           | Add new watcher class       | src/LLM/Watchers/                   |
| DSL & Parsing     | Singleton, Utility | Add tags/regex              | src/GlobalVariables/, src/Utils/    |
| Webview UI        | MVC, Message Bus   | Add React components        | webview-ui/                         |
| Logging           | Singleton, Utility | Add logger usage            | src/Utils/Logger.ts                 |

---

## 7. Best Practices for Contributors
- Always use the provided base classes and patterns for new features.
- Register new commands, tools, milestones, or watchers in `extension.ts`.
- Use Zod schemas for all LLM outputs to ensure validation.
- Never bypass the diff preview for file edits.
- Write clear, prefixed log messages for all major actions.
- Keep UI and backend logic decoupled.

---

## 8. References
- See code comments and this file for rationale and extension points.
- For VS Code API usage, see the official documentation.
- For React UI, see `webview-ui/README.md`.

---

This document is intended to be updated as the system evolves. Please keep it current with all major architectural or extensibility changes.
