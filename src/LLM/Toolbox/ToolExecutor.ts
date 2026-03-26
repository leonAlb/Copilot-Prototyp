import * as vscode from 'vscode';
import { showPreviewAndGetChoice, PreviewChoiceResult } from '../../Utils/CompareChanges';
import { Logger } from '../../Utils/Logger';

export interface ToolExecutionResult {
    success: boolean;
    data?: any;
    error?: string;
    userFeedback?: string;
    aborted?: boolean;
}

export interface BatchEditOperation {
    type: 'edit_range' | 'add_lines_at_position' | 'remove_lines';
    startLine?: number;
    endLine?: number;
    afterLine?: number;
    newContent?: string;
}

// Handler type for tools
type ToolHandler = (args: any) => Promise<ToolExecutionResult>;

// Type for the preview function (for dependency injection/testing)
export type Previewer = (
    documentUri: vscode.Uri,
    previewContent: string,
    editId: string
) => Promise<PreviewChoiceResult>;

/**
 * Executor for AI agent tools with security controls.
 * Prevents arbitrary code execution by controlling file operations.
 * All line-based tools use 1-indexed line numbers.
 */
export class ToolExecutor {
    private static editCounter = 0;
    private static readonly logger = new Logger('ToolExecutor');
    public static previewer: Previewer = showPreviewAndGetChoice; // Default previewer, can be overridden for testing

    /** Tool registry mapping names to handlers */
    private static readonly toolHandlers: Record<string, ToolHandler> = {
        'read_file': () => ToolExecutor.readFile(),
        'read_lines': (args) => ToolExecutor.readLines(args.startLine, args.endLine),
        'edit_range': (args) => ToolExecutor.editRange(args.startLine, args.endLine, args.newContent, args.explanation),
        'format_file': (args) => ToolExecutor.formatFile(args.newContent, args.explanation),
        'replace_text': (args) => ToolExecutor.replaceText(args.originalTexts, args.newContents, args.explanation),
        'add_lines_at_position': (args) => ToolExecutor.addLinesAtPosition(args.afterLine, args.newContent, args.explanation),
        'remove_lines': (args) => ToolExecutor.removeLines(args.startLine, args.endLine, args.explanation),
        'apply_batch_edits': (args) => ToolExecutor.applyBatchEdits(args.edits, args.explanation),
        'task_complete': (args) => ToolExecutor.taskComplete(args.summary, args.reasoning, args.changesApplied),
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Get active editor or error
    private static getActiveEditor(): { editor: vscode.TextEditor } | ToolExecutionResult {
        const editor = vscode.window.activeTextEditor;
        return editor ? { editor } : { success: false, error: 'No active file in editor' };
    }

    // Generate unique edit ID
    private static generateEditId(prefix: string): string {
        return `${prefix}_${++this.editCounter}_${Date.now()}`;
    }

    // Validate line numbers are within document bounds
    private static validateLineNumbers(
        doc: vscode.TextDocument,
        startLine: number,
        endLine: number
    ): ToolExecutionResult | null {
        if (startLine < 1 || endLine < 1) {
            return { success: false, error: `Line numbers must be >= 1. Got startLine=${startLine}, endLine=${endLine}` };
        }
        if (startLine > endLine) {
            return { success: false, error: `startLine (${startLine}) cannot be greater than endLine (${endLine})` };
        }
        if (endLine > doc.lineCount) {
            return { success: false, error: `endLine (${endLine}) exceeds document length (${doc.lineCount} lines)` };
        }
        return null; // No error
    }

    // Handle user preview result
    private static async handlePreviewResult(
        result: { choice: string; feedback?: string },
        documentUri: vscode.Uri,
        applyFn: () => Promise<boolean>,
        editId: string,
        successMessage: string,
        operationName: string
    ): Promise<ToolExecutionResult> {
        if (result.choice === 'Keep') {
            const success = await applyFn();
            if (!success) {
                return { success: false, error: `Failed to apply ${operationName}` };
            }
            return { success: true, data: { editId, message: successMessage } };
        }

        // Restore original document view
        const doc = await vscode.workspace.openTextDocument(documentUri);
        await vscode.window.showTextDocument(doc);

        if (result.choice === 'Discard' && result.feedback) {
            return {
                success: false,
                error: `${operationName} rejected by user. User feedback: "${result.feedback}"`,
                userFeedback: result.feedback
            };
        }

        return { success: false, error: 'Task aborted by user', aborted: true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /** Main entry point - executes a tool by name */
    public static async executeTool(toolName: string | undefined, args: any): Promise<ToolExecutionResult> {
        if (!toolName) {
            this.logger.warn('No tool name provided');
            return { success: false, error: `Invalid tool name: ${toolName}` };
        }

        const handler = this.toolHandlers[toolName];
        if (!handler) {
            this.logger.warn(`Unknown tool: "${toolName}"`);
            return {
                success: false,
                error: `Unknown tool: "${toolName}". Available: ${Object.keys(this.toolHandlers).join(', ')}`
            };
        }
        this.logger.log(`Executing tool: "${toolName}" with args: ${JSON.stringify(args)}`);
        return handler(args);
    }

    /** Signals task completion by agent */
    private static async taskComplete(
        summary: string,
        reasoning: string,
        changesApplied?: string[]
    ): Promise<ToolExecutionResult> {
        this.logger.log(`Task completed: ${JSON.stringify({ summary, reasoning, changesApplied })}`);
        return {
            success: true,
            data: {
                taskCompleted: true,
                summary,
                reasoning,
                changesApplied: changesApplied || [],
                message: summary
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read Tools
    // ─────────────────────────────────────────────────────────────────────────

    private static async readFile(): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const { document } = editor;
        
        // Split content and add line numbers (e.g., "1 | const x = 5;")
        const fullContent = document.getText();
        const numberedContent = fullContent
            .split('\n')
            .map((line, index) => `${index + 1} | ${line}`)
            .join('\n');

        return {
            success: true,
            data: {
                content: numberedContent,
                language: document.languageId,
                lineCount: document.lineCount,
                message: `Read file with ${document.lineCount} lines (line numbers added)`
            }
        };
    }

    private static async readLines(startLine: number, endLine: number): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const { document } = editor;
        
        const validationError = this.validateLineNumbers(document, startLine, endLine);
        if (validationError) { return validationError; }

        const maxLine = Math.min(endLine, document.lineCount);
        const lines: string[] = [];
        
        // Loop through the requested range and add line numbers
        for (let i = startLine - 1; i < maxLine; i++) {
            const lineText = document.lineAt(i).text;
            // Add the correct 1-indexed line number to the output
            lines.push(`${i + 1} | ${lineText}`);
        }

        return {
            success: true,
            data: {
                content: lines.join('\n'),
                language: document.languageId,
                message: `Read lines ${startLine}-${maxLine} (line numbers added)`
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Edit Tools (Text-based)
    // ─────────────────────────────────────────────────────────────────────────

    private static normalizeToLF(text: string): string {
        return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    private static convertToDocumentEOL(text: string, eol: vscode.EndOfLine): string {
        if (eol === vscode.EndOfLine.CRLF) {
            return text.replace(/\n/g, '\r\n');
        }
        return text;
    }

    /**
     * Replace specific text segments in the active file.
     * Robust against EOL mismatches between LLM output and document content.
     */
    private static async replaceText(
        originalTexts: string[],
        newContents: string[],
        explanation: string
    ): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const doc = editor.document;
        const documentUri = doc.uri;

        if (!originalTexts || !newContents || originalTexts.length !== newContents.length) {
            return { success: false, error: 'originalTexts and newContents arrays must be provided and have the same length' };
        }

        if (originalTexts.length === 0) {
            return { success: false, error: 'At least one replacement pair must be provided' };
        }

        const documentEOL = doc.eol;
        const fullText = doc.getText();
        
        // Normalize document text to LF for consistent matching
        let workingText = this.normalizeToLF(fullText);
        const notFoundTexts: string[] = [];

        // Perform all replacements on LF-normalized text
        for (let i = 0; i < originalTexts.length; i++) {
            const normalizedOriginal = this.normalizeToLF(originalTexts[i]);
            const normalizedNew = this.normalizeToLF(newContents[i]);

            if (workingText.indexOf(normalizedOriginal) === -1) {
                notFoundTexts.push(originalTexts[i].substring(0, 50)); // Store a snippet for logging
                continue;
            }

            // Replace all occurrences of this text
            workingText = workingText.split(normalizedOriginal).join(normalizedNew);
        }

        // Warn if some texts were not found, but continue with those that were
        if (notFoundTexts.length === originalTexts.length) {
            return { 
                success: false, 
                error: `None of the original texts were found in the document. First snippet: "${notFoundTexts[0]}"` 
            };
        }

        if (notFoundTexts.length > 0) {
            this.logger.warn(`${notFoundTexts.length} text segment(s) not found: ${notFoundTexts.join('; ')}`);
        }

        // Convert back to document's native EOL format for preview
        const previewText = this.convertToDocumentEOL(workingText, documentEOL);
        const editId = this.generateEditId('replace_text');

        try {
            const result = await this.previewer(documentUri, previewText, editId);

            return this.handlePreviewResult(
                result,
                documentUri,
                async () => {
                    const freshDoc = await vscode.workspace.openTextDocument(documentUri);
                    const freshEditor = await vscode.window.showTextDocument(freshDoc);
                    
                    return freshEditor.edit(editBuilder => {
                        const wholeDocRange = new vscode.Range(
                            freshDoc.positionAt(0),
                            freshDoc.positionAt(freshDoc.getText().length)
                        );
                        editBuilder.replace(wholeDocRange, previewText);
                    }, { undoStopBefore: true, undoStopAfter: true });
                },
                editId,
                `Replaced ${originalTexts.length - notFoundTexts.length} text segment(s): ${explanation}`,
                'Replace Text'
            );
        } catch (err: any) {
            return { success: false, error: `Error replacing text: ${err.message}` };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Edit Tools (Line-based)
    // ─────────────────────────────────────────────────────────────────────────

    private static async formatFile(newContent: string, explanation: string): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const documentUri = editor.document.uri;
        const editId = this.generateEditId('format');

        try {
            const result = await this.previewer(documentUri, newContent, editId);

            return this.handlePreviewResult(
                result,
                documentUri,
                async () => {
                    const doc = await vscode.workspace.openTextDocument(documentUri);
                    const newEditor = await vscode.window.showTextDocument(doc);
                    return newEditor.edit(editBuilder => {
                        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                        editBuilder.replace(fullRange, newContent);
                    }, { undoStopBefore: true, undoStopAfter: true });
                },
                editId,
                `Formatting applied: ${explanation}`,
                'Formatting'
            );
        } catch (err: any) {
            return { success: false, error: `Error applying formatting: ${err.message}` };
        }
    }

    /**
     * Replace content between startLine and endLine (inclusive) with newContent.
     * Line numbers are 1-indexed.
     */
    private static async editRange(
        startLine: number,
        endLine: number,
        newContent: string,
        explanation: string
    ): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const doc = editor.document;
        const documentUri = doc.uri;

        const validationError = this.validateLineNumbers(doc, startLine, endLine);
        if (validationError) { return validationError; }

        // Calculate the range to replace (0-indexed internally)
        const startPos = new vscode.Position(startLine - 1, 0);
        const endLineIdx = endLine - 1;
        const endPos = new vscode.Position(endLineIdx, doc.lineAt(endLineIdx).text.length);
        
        // Generate preview content
        const fullText = doc.getText();
        const lines = fullText.split('\n');
        const beforeLines = lines.slice(0, startLine - 1);
        const afterLines = lines.slice(endLine);
        const previewContent = [...beforeLines, newContent, ...afterLines].join('\n');

        const editId = this.generateEditId('edit_range');

        try {
            const result = await this.previewer(documentUri, previewContent, editId);

            return this.handlePreviewResult(
                result,
                documentUri,
                async () => {
                    const freshDoc = await vscode.workspace.openTextDocument(documentUri);
                    const newEditor = await vscode.window.showTextDocument(freshDoc);
                    return newEditor.edit(editBuilder => {
                        const range = new vscode.Range(startPos, endPos);
                        editBuilder.replace(range, newContent);
                    }, { undoStopBefore: true, undoStopAfter: true });
                },
                editId,
                `Edit applied (lines ${startLine}-${endLine}): ${explanation}`,
                'Edit'
            );
        } catch (err: any) {
            return { success: false, error: `Error applying edit: ${err.message}` };
        }
    }

    /**
     * Insert new content after the specified line number.
     * Use afterLine=0 to insert at the beginning of the file.
     * Line numbers are 1-indexed.
     */
    private static async addLinesAtPosition(
        afterLine: number,
        newContent: string,
        explanation: string
    ): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const doc = editor.document;
        const documentUri = doc.uri;

        if (afterLine < 0) {
            return { success: false, error: `afterLine must be >= 0. Got ${afterLine}` };
        }
        if (afterLine > doc.lineCount) {
            return { success: false, error: `afterLine (${afterLine}) exceeds document length (${doc.lineCount} lines)` };
        }

        // Execute insertion
        let insertPosition: vscode.Position;
        let contentToInsert: string;

        if (afterLine === 0) {
            insertPosition = new vscode.Position(0, 0);
            contentToInsert = newContent + '\n';
        } else {
            const lineIdx = afterLine - 1;
            const lineText = doc.lineAt(lineIdx).text;
            insertPosition = new vscode.Position(lineIdx, lineText.length);
            contentToInsert = '\n' + newContent;
        }

        // Generate preview content
        const previewLines = doc.getText().split('\n');
        const newLines = newContent.split(/\r?\n/);
        previewLines.splice(afterLine, 0, ...newLines);
        
        const previewContent = previewLines.join('\n');
        const editId = this.generateEditId('add_lines');

        try {
            const result = await this.previewer(documentUri, previewContent, editId);

            return this.handlePreviewResult(
                result,
                documentUri,
                async () => {
                    const freshDoc = await vscode.workspace.openTextDocument(documentUri);
                    const newEditor = await vscode.window.showTextDocument(freshDoc);
                    return newEditor.edit(editBuilder => {
                        editBuilder.insert(insertPosition, contentToInsert);
                    }, { undoStopBefore: true, undoStopAfter: true });
                },
                editId,
                `Added content after line ${afterLine}: ${explanation}`,
                'Insert'
            );
        } catch (err: any) {
            return { success: false, error: `Error inserting content: ${err.message}` };
        }
    }

    /**
     * Remove lines from startLine to endLine (inclusive).
     * Line numbers are 1-indexed.
     */
    private static async removeLines(
        startLine: number,
        endLine: number,
        explanation: string
    ): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const doc = editor.document;
        const documentUri = doc.uri;

        const validationError = this.validateLineNumbers(doc, startLine, endLine);
        if (validationError) { return validationError; }

        // Calculate the range to delete
        let startPos: vscode.Position;
        let endPos: vscode.Position;
        
        if (endLine < doc.lineCount) {
            // Standard case: Delete from start of startLine to start of (endLine + 1)
            startPos = new vscode.Position(startLine - 1, 0);
            endPos = new vscode.Position(endLine, 0);
        } else {
            // EDGE CASE: Deleting the last line(s) of the file
            if (startLine === 1) {
                // Deleting the entire file content
                startPos = new vscode.Position(0, 0);
            } else {
                const prevLineIdx = startLine - 2; 
                startPos = new vscode.Position(prevLineIdx, doc.lineAt(prevLineIdx).text.length);
            }
            // End position is the very end of the document
            const lastLineIdx = doc.lineCount - 1;
            endPos = new vscode.Position(lastLineIdx, doc.lineAt(lastLineIdx).text.length);
        }

        // Generate preview content
        const fullText = doc.getText();
        const lines = fullText.split('\n');
        const beforeLines = lines.slice(0, startLine - 1);
        const afterLines = lines.slice(endLine);
        const previewContent = [...beforeLines, ...afterLines].join('\n');

        const editId = this.generateEditId('remove');

        try {
            const result = await this.previewer(documentUri, previewContent, editId);

            return this.handlePreviewResult(
                result,
                documentUri,
                async () => {
                    const freshDoc = await vscode.workspace.openTextDocument(documentUri);
                    const newEditor = await vscode.window.showTextDocument(freshDoc);
                    return newEditor.edit(editBuilder => {
                        const range = new vscode.Range(startPos, endPos);
                        editBuilder.delete(range);
                    }, { undoStopBefore: true, undoStopAfter: true });
                },
                editId,
                `Removed lines ${startLine}-${endLine}: ${explanation}`,
                'Remove'
            );
        } catch (err: any) {
            return { success: false, error: `Error removing lines: ${err.message}` };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Batch Edit Tool
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply multiple edits in a single operation.
     * Edits are sorted and applied from bottom to top to preserve line numbers.
     */
    private static async applyBatchEdits(
        edits: BatchEditOperation[],
        explanation: string
    ): Promise<ToolExecutionResult> {
        const editorResult = this.getActiveEditor();
        if ('success' in editorResult) { return editorResult; }

        const { editor } = editorResult;
        const doc = editor.document;
        const documentUri = doc.uri;

        if (!edits || edits.length === 0) {
            return { success: false, error: 'No edits provided' };
        }

        // Validate all edits first
        for (let i = 0; i < edits.length; i++) {
            const edit = edits[i];
            if (edit.type === 'edit_range' || edit.type === 'remove_lines') {
                if (edit.startLine === undefined || edit.endLine === undefined) {
                    return { success: false, error: `Edit ${i + 1}: ${edit.type} requires startLine and endLine` };
                }
                const validationError = this.validateLineNumbers(doc, edit.startLine, edit.endLine);
                if (validationError) {
                    return { success: false, error: `Edit ${i + 1}: ${validationError.error}` };
                }
            } else if (edit.type === 'add_lines_at_position') {
                if (edit.afterLine === undefined) {
                    return { success: false, error: `Edit ${i + 1}: add_lines_at_position requires afterLine` };
                }
                if (edit.afterLine < 0 || edit.afterLine > doc.lineCount) {
                    return { success: false, error: `Edit ${i + 1}: afterLine (${edit.afterLine}) out of bounds` };
                }
                if (edit.newContent === undefined) {
                    return { success: false, error: `Edit ${i + 1}: add_lines_at_position requires newContent` };
                }
            }
            if ((edit.type === 'edit_range' || edit.type === 'add_lines_at_position') && edit.newContent === undefined) {
                return { success: false, error: `Edit ${i + 1}: ${edit.type} requires newContent` };
            }
        }

        // Sort edits by line number (descending) to apply bottom-to-top
        // This preserves line numbers for earlier edits
        const sortedEdits = [...edits].map((edit, originalIndex) => ({ edit, originalIndex }));
        sortedEdits.sort((a, b) => {
            const lineA = a.edit.startLine ?? a.edit.afterLine ?? 0;
            const lineB = b.edit.startLine ?? b.edit.afterLine ?? 0;
            return lineB - lineA; // Descending order (bottom first)
        });

        // Generate preview by applying all edits to a copy of the content
        let previewLines = doc.getText().split('\n');
        
        for (const { edit } of sortedEdits) {
            if (edit.type === 'edit_range') {
                const before = previewLines.slice(0, edit.startLine! - 1);
                const after = previewLines.slice(edit.endLine!);
                const newContentLines = edit.newContent!.split('\n');
                previewLines = [...before, ...newContentLines, ...after];
            } else if (edit.type === 'add_lines_at_position') {
                const before = previewLines.slice(0, edit.afterLine!);
                const after = previewLines.slice(edit.afterLine!);
                const newContentLines = edit.newContent!.split('\n');
                previewLines = [...before, ...newContentLines, ...after];
            } else if (edit.type === 'remove_lines') {
                const before = previewLines.slice(0, edit.startLine! - 1);
                const after = previewLines.slice(edit.endLine!);
                previewLines = [...before, ...after];
            }
        }

        const previewContent = previewLines.join('\n');
        const editId = this.generateEditId('batch');

        try {
            const result = await this.previewer(documentUri, previewContent, editId);

            return this.handlePreviewResult(
                result,
                documentUri,
                async () => {
                    // Apply the final content (preview is already the correct result)
                    const freshDoc = await vscode.workspace.openTextDocument(documentUri);
                    const newEditor = await vscode.window.showTextDocument(freshDoc);
                    return newEditor.edit(editBuilder => {
                        const fullRange = new vscode.Range(
                            freshDoc.positionAt(0),
                            freshDoc.positionAt(freshDoc.getText().length)
                        );
                        editBuilder.replace(fullRange, previewContent);
                    }, { undoStopBefore: true, undoStopAfter: true });
                },
                editId,
                `Batch edit completed (${edits.length} operations): ${explanation}`,
                'Batch edit'
            );
        } catch (err: any) {
            return { success: false, error: `Error applying batch edits: ${err.message}` };
        }
    }
}