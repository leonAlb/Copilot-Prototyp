import * as vscode from 'vscode';

const PREVIEW_SCHEME = 'lecturepilot-preview'; // Custom scheme for preview URIs

/**
 * Result of the preview choice, including optional user feedback on rejection.
 */
export interface PreviewChoiceResult {
    choice: 'Keep' | 'Discard' | 'Abort';
    feedback?: string; // User feedback when discarding (empty means abort)
}

/**
 * Shows a side-by-side diff preview of proposed changes and prompts the user to keep or discard them.
 * If discarded, prompts for feedback to help the agent improve.
 */
export async function showPreviewAndGetChoice(
    documentUri: vscode.Uri,
    previewContent: string,
    editId: string
): Promise<PreviewChoiceResult> {

    // Step 1: Create a unique URI for this preview using the custom scheme
        const previewUri = vscode.Uri.parse(`${PREVIEW_SCHEME}:${editId}`);

        // Step 2: Create a content provider that tells VS Code what content to show
        const provider = {
            provideTextDocumentContent: () => previewContent
        };

        // Step 3: Register the provider with VS Code for the custom scheme
        const disposable = vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider);

        try {
            // Step 4: Open a side-by-side diff view
            await vscode.commands.executeCommand('vscode.diff',
                documentUri, // Original file
                previewUri, //  Content comes from our provider
                `AI Proposed Changes`,
                {
                    preview: false, // Make it a permanent editor (open until notification is responded to)
                    preserveFocus: false // Take focus so user can review the changes
                }
            );

            const choice = await vscode.window.showInformationMessage(
                `Do you want to keep the proposed changes?`,
                'Keep',
                'Discard'
            );

            if (choice === 'Keep') {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                return { choice: 'Keep' };
            } else if (choice === 'Discard') {
                // Keep diff view open so user can reference it while giving feedback
                const feedback = await vscode.window.showInputBox({
                    prompt: 'What was wrong with the proposed changes? (Leave empty to abort the task)',
                    placeHolder: 'e.g., "Wrong formatting", "Missing error handling", "Incorrect logic"',
                    ignoreFocusOut: true
                });

                // Now close the diff view after feedback is collected
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

                if (feedback === undefined || feedback.trim() === '') {
                    return { choice: 'Abort' };
                }

                return { choice: 'Discard', feedback: feedback.trim() };
            } else {
                // User closed the dialog without choosing - treat as abort
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                return { choice: 'Abort' };
            }
        } finally {
            // Clean up
            disposable.dispose();
        }
}