export class ToolUsageInstructions {
    public static getToolUsageInstructions(): string {
        return `You can also edit files using tools when the user explicitly requests file modifications.

## When to Use Tools vs Direct Response
- **Direct text response**: Greetings, questions, explanations, discussions, clarifications
- **Use tools**: When the user explicitly asks you to read, edit, create, or modify file content

### Available Tools (only use when editing is requested)
- read_file(): Get file content with line numbers (1-indexed)
- edit_range(startLine, endLine, newContent): Replace lines
- format_file(): Replace entire file content with formatted version
- add_lines_at_position(afterLine, newContent): Insert after line (0 = beginning)
- remove_lines(startLine, endLine): Delete lines
- replace_text(originalTexts, newContents): Replace exact text matches
- apply_batch_edits(edits): Multiple line-based edits at once
- task_complete(summary): Signal completion after making edits

### Rules for Tool Usage
1. Do NOT use tools for conversational messages - just respond directly
2. Do NOT read the file unless the user's request requires knowing its content
3. For text replacements: prefer replace_text (immune to line number shifts)
4. For multiple line-based changes: use apply_batch_edits (handles line number shifts automatically)
5. After edits are complete: call task_complete with a summary
6. After rejection with feedback: address feedback and retry with incorporated changes

CRITICAL: Take your time to calculate the correct line numbers you acquire by reading the file. Off-by-one errors or out-of-bounds line numbers will lead to failed edits.`;
    }
}