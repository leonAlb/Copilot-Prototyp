
import * as assert from 'assert';
import * as vscode from 'vscode';
import { ToolExecutor } from '../../LLM/Toolbox/ToolExecutor';

suite('Tool Executor Integration Tests', () => {
    // Helper to create a document with content
    async function createTestDocument(content: string): Promise<vscode.TextEditor> {
        const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        return await vscode.window.showTextDocument(doc);
    }

    // Reset previewer after tests
    const originalPreviewer = ToolExecutor.previewer;
    teardown(async () => {
        ToolExecutor.previewer = originalPreviewer;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('read_file: returns numbered content', async () => {
        await createTestDocument('Line 1\nLine 2\nLine 3');
        const result = await ToolExecutor.executeTool('read_file', {});
        
        assert.strictEqual(result.success, true);
        assert.ok(result.data.content.includes('1 | Line 1'));
        assert.ok(result.data.content.includes('2 | Line 2'));
        assert.ok(result.data.content.includes('3 | Line 3'));
        assert.strictEqual(result.data.lineCount, 3);
    });

    test('read_lines: reads specific range', async () => {
        await createTestDocument('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
        const result = await ToolExecutor.executeTool('read_lines', { startLine: 2, endLine: 4 });

        assert.strictEqual(result.success, true);
        assert.ok(result.data.content.includes('2 | Line 2'));
        assert.ok(result.data.content.includes('3 | Line 3'));
        assert.ok(result.data.content.includes('4 | Line 4'));
        assert.ok(!result.data.content.includes('1 | Line 1'));
    });

    test('read_lines: returns error for invalid range', async () => {
        await createTestDocument('Line 1\nLine 2');
        const result = await ToolExecutor.executeTool('read_lines', { startLine: 5, endLine: 6 });

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('exceeds document length'));
    });

    test('edit_range: generates correct preview', async () => {
        await createTestDocument('Line 1\nLine 2\nLine 3');
        
        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' }; // Stop execution
        };

        await ToolExecutor.executeTool('edit_range', {
            startLine: 2,
            endLine: 2,
            newContent: 'New Line 2',
            explanation: 'Test edit'
        });

        assert.strictEqual(capturedPreview, 'Line 1\nNew Line 2\nLine 3');
    });

    test('add_lines_at_position: generates correct preview', async () => {
        await createTestDocument('Line 1\nLine 2');
        
        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' };
        };

        await ToolExecutor.executeTool('add_lines_at_position', {
            afterLine: 1,
            newContent: 'Inserted',
            explanation: 'Test insert'
        });

        assert.strictEqual(capturedPreview, 'Line 1\nInserted\nLine 2');
    });

    test('remove_lines: generates correct preview', async () => {
        await createTestDocument('Line 1\nLine 2\nLine 3');
        
        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' };
        };

        await ToolExecutor.executeTool('remove_lines', {
            startLine: 2,
            endLine: 2,
            explanation: 'Test remove'
        });

        assert.strictEqual(capturedPreview, 'Line 1\nLine 3');
    });

    test('replace_text: generates correct preview', async () => {
        await createTestDocument('Start A End\nStart B End');
        
        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' };
        };

        await ToolExecutor.executeTool('replace_text', {
            originalTexts: ['A', 'B'],
            newContents: ['X', 'Y'],
            explanation: 'Test replace'
        });

        assert.strictEqual(capturedPreview, 'Start X End\nStart Y End');
    });

    test('replace_text: fails if text not found', async () => {
        await createTestDocument('Content');
        const result = await ToolExecutor.executeTool('replace_text', {
            originalTexts: ['Missing'],
            newContents: ['Found'],
            explanation: 'Test fail'
        });

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('None of the original texts were found'));
    });

    test('apply_batch_edits: handles multiple operations correctly', async () => {
        await createTestDocument('1\n2\n3\n4\n5');
        
        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' };
        };

        await ToolExecutor.executeTool('apply_batch_edits', {
            edits: [
                { type: 'remove_lines', startLine: 1, endLine: 1 }, // Remove '1' -> 2,3,4,5
                { type: 'edit_range', startLine: 3, endLine: 3, newContent: 'Three' }, // Change '3' -> 'Three'
                { type: 'add_lines_at_position', afterLine: 5, newContent: 'Six' } // Add 'Six' at end
            ],
            explanation: 'Batch test'
        });
        
        assert.strictEqual(capturedPreview, '2\nThree\n4\n5\nSix');
    });

    test('apply_batch_edits: validates all edits before running', async () => {
        await createTestDocument('1\n2\n3');
        
        const result = await ToolExecutor.executeTool('apply_batch_edits', {
            edits: [
                { type: 'edit_range', startLine: 1, endLine: 1, newContent: 'ok' },
                { type: 'edit_range', startLine: 99, endLine: 100, newContent: 'bad' } // Invalid range
            ],
            explanation: 'Test validation'
        });

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Edit 2'));
    });
    
    test('format_file: generates correct preview', async () => {
        await createTestDocument('Old line 1\nOld line 2\nOld line 3');

        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' };
        };

        await ToolExecutor.executeTool('format_file', {
            newContent: 'New line 1\nNew line 2',
            explanation: 'Reformat entire file'
        });

        assert.strictEqual(capturedPreview, 'New line 1\nNew line 2');
    });

    test('executeTool: returns error for unknown tool', async () => {
        const result = await ToolExecutor.executeTool('nonexistent_tool', {});
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Unknown tool'));
    });

    test('executeTool: returns error for undefined tool name', async () => {
        const result = await ToolExecutor.executeTool(undefined, {});
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Invalid tool name'));
    });

    test('add_lines_at_position: inserts at beginning with afterLine=0', async () => {
        await createTestDocument('Line 1\nLine 2');

        let capturedPreview = '';
        ToolExecutor.previewer = async (uri, content, id) => {
            capturedPreview = content;
            return { choice: 'Abort' };
        };

        await ToolExecutor.executeTool('add_lines_at_position', {
            afterLine: 0,
            newContent: 'Prepended',
            explanation: 'Insert at beginning'
        });

        assert.strictEqual(capturedPreview, 'Prepended\nLine 1\nLine 2');
    });

    test('task_complete: returns success', async () => {
         const result = await ToolExecutor.executeTool('task_complete', {
             summary: 'Done',
             reasoning: 'Because',
             changesApplied: ['change1']
         });
         
         assert.strictEqual(result.success, true);
         assert.strictEqual(result.data.taskCompleted, true);
         assert.strictEqual(result.data.summary, 'Done');
    });
});
