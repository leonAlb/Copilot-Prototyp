import * as vscode from 'vscode';
import { z } from 'zod';
import { ProviderRegistry } from '../Provider/ProviderRegistry';
import { Logger } from '../../Utils/Logger';
import { ToolExecutionResult } from '../Toolbox/ToolExecutor';
import { AbstractLLMProvider, JSONResponse } from '../Provider/AbstractLLMProvider';
import { CHAT_SESSION_ID, MILESTONE_SESSION_ID } from '../../Utils/ChatSessionManager';

export abstract class BaseMilestone implements vscode.Disposable {
    // Store disposables for cleanup
    protected disposables: vscode.Disposable[] = [];
    // Maximum attempts for generating valid output in milestones
    protected maxAttempts: number = 3;
    protected providerRegistry: ProviderRegistry;
    protected provider!: AbstractLLMProvider; // Set at execution start
    protected milestoneName: string;
    protected readonly logger: Logger;

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR & SINGLETON IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    constructor(milestoneName: string, providerRegistry: ProviderRegistry) {
        this.milestoneName = milestoneName;
        this.providerRegistry = providerRegistry;
        this.logger = new Logger(milestoneName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPTS & SCHEMA IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    // System prompt defining the milestone task
    protected abstract getMilestonePrompt(): string;
    // Get user prompt specific to the milestone
    protected abstract getUserPrompt(): Promise<any>;
    // JSON schema definition for structured output
    protected abstract getSchema(): z.ZodObject<any>;

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & GENERATION METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Validate the generated output against expected criteria
    protected abstract validateGeneratedOutput(...args: any[]): { valid: boolean, reason: string } | boolean;

    // ────────────────────────────────────────────────────────────────────────
    // MAIN EXECUTION METHOD
    // ─────────────────────────────────────────────────────────────────────────

    // Executes the milestone logic using the stored provider (set via registerCommand)
    public abstract executeMilestone(): Promise<void>;

    protected async prepareUserPrompt(): Promise<boolean> {
        const userPrompt = await this.getUserPrompt();
        if (!userPrompt) {
            this.logger.error('Error creating user prompt. Aborting milestone execution.');
            vscode.window.showErrorMessage('Aborting Milestone: Missing User Prompt.');
            return false;
        }
        this.provider.addUserMessage(userPrompt);
        return true;
    }

    // Sends prompt to LLM and retrieves structured JSON response
    protected async generateLLMResponse(
        title: string,
        webSearch?: boolean
    ): Promise<JSONResponse> {
        const result: JSONResponse = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: true
        }, async () => {
            return await this.provider.generateStructuredJSON(
                this.getMilestonePrompt(),
                this.getSchema(),
                webSearch
            );
        });
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESULT HANDLING METHODS
    // ─────────────────────────────────────────────────────────────────────────/

    // Standardized handling for tool execution results to keep milestone code DRY
    protected handleToolResult(result: ToolExecutionResult | undefined): { accepted: boolean; feedback?: string; aborted?: boolean } {
        if (!result) {
            this.logger.error('Tool execution returned no result.');
            vscode.window.showErrorMessage('Failed to execute tool.');
            return { accepted: false, aborted: true };
        }

        if (result.userFeedback) {
            this.logger.log(`User requested changes: ${result.userFeedback}`);
            return { accepted: false, feedback: result.userFeedback };
        }

        if (result.aborted) {
            this.logger.log('User aborted the operation.');
            return { accepted: false, aborted: true };
        }

        this.logger.log('Tool executed successfully.');
        return { accepted: true };
    }

    // Handles common generation result scenarios
    protected handleGenerationResult(
        result: JSONResponse | undefined,
    ): { abort: boolean; retry: boolean } {

        if (!result) {
            this.logger.error('Generation failed unexpectedly');
            return { abort: true, retry: false };
        }

        if (result.type === 'api_error') {
            vscode.window.showErrorMessage('Generation failed due to API error. Aborting.');
            return { abort: true, retry: false };
        }

        if (result.type === 'no_output') {
            vscode.window.showWarningMessage('No output generated. Retrying...');
            this.provider.addUserMessage('There was no output. Try again. MAKE SURE TO OUTPUT THE CORRECT JSON STRUCTURE.');
            return { abort: false, retry: true };
        }

        return { abort: false, retry: false };
    }

    // Handles user preview feedback for generated content
    protected async handlePreviewResult(
        createContentPreviewFn: Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }>,
        attempts: number
    ): Promise<boolean> {
        const previewResult = await createContentPreviewFn;
        // Successfully accepted by user
        if (previewResult.accepted) {
            return false;
        }

        // User aborted
        if (previewResult.aborted) {
            vscode.window.showErrorMessage('Operation aborted by user.');
            return false;
        }

        // User rejected with feedback - prepare for retry
        if (previewResult.feedback && attempts < this.maxAttempts) {
            this.provider.addUserMessage(`The generated output was rejected. User FEEDBACK: "${previewResult.feedback}". Please regenerate addressing this feedback.`);
        }

        return true; // Continue to next attempt
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROVIDER & CLEAN UP METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Register a command for this milestone
    protected registerCommand(commandName: string): void {
        this.disposables.push(
            vscode.commands.registerCommand(`lecturepilot.${commandName}`, async () => {
                if (!this.providerRegistry) {
                    vscode.window.showErrorMessage('Provider registry not initialized.');
                    return;
                }
                const provider = this.providerRegistry.getCurrentProvider();
                if (!provider) {
                    vscode.window.showErrorMessage('No LLM provider available.');
                    return;
                }
                this.provider = provider;
                
                // Switch to milestone session (keeps chat session intact)
                this.provider.setActiveSession(MILESTONE_SESSION_ID);
                this.provider.clearChatSession(); // Clear only milestone session
                
                try {
                    await this.executeMilestone();
                } finally {
                    // Always restore chat session and clean up milestone session
                    this.provider.clearChatSession(MILESTONE_SESSION_ID);
                    this.provider.setActiveSession(CHAT_SESSION_ID);
                }
            })
        );
    }

    // Clean up resources if needed
    public dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}