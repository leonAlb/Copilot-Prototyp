import * as vscode from 'vscode';
import { z } from 'zod';
import { APIKeyManager } from '../../ExtensionManager/APIKeyManager';
import { ChatSessionManager, CHAT_SESSION_ID } from '../../Utils/ChatSessionManager';
import { ThinkingOptions } from '../../ExtensionManager/SettingsManager';
import { GeneralInstructions } from '../Instructions/GeneralInstructions';
import { Toolkit } from '../Toolbox/Toolkit';
import { Logger } from '../../Utils/Logger';
import { FormattingInstructions } from '../Instructions/FormattingInstructions';

export interface JSONResponse {
    type: 'success' | 'api_error' | 'no_output';
    data?: any;
}

/**
 * Abstract base class for LLM providers.
 * Implements common functionality shared across different providers.
 */
export abstract class AbstractLLMProvider {
    protected providerName: string; // Provider name, used for display, logging, and as identifier
    protected currentModel: string = ''; // Currently selected model ID
    protected aiClient: any = null; // Instance of the AI client
    protected chatSession: ChatSessionManager = new ChatSessionManager(); // Manages chat session context
    protected activeSessionId: string = CHAT_SESSION_ID; // Current active session
    protected maxIterations: number = 10; // Default maximum iterations for Agent loops
    protected thinkingLevel: ThinkingOptions = ThinkingOptions.LOW; // Default thinking level
    protected readonly logger: Logger;

    /** Shared OutputChannel for user-visible LLM metrics (token usage, timing). */
    protected static metricsChannel: vscode.OutputChannel = vscode.window.createOutputChannel('LLM-Metrics');

    constructor(providerName: string) {
        this.providerName = providerName;
        this.logger = new Logger(providerName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROVIDER METADATA METHODS
    // ─────────────────────────────────────────────────────────────────────────
    // Get the provider's name
    public getProviderName(): string {
        return this.providerName;
    }

    // Get the list of supported model IDs for this provider
    public abstract getSupportedModels(): string[];

    // Check if a model is supported by this provider by its ID
    public supportsModel(modelId: string): boolean {
        return this.getSupportedModels().includes(modelId);
    }

    // Set the current model if supported
    public setModel(modelId: string): void {
        if (this.supportsModel(modelId)) {
            this.currentModel = modelId;
            this.logger.log(`Model set to: ${modelId}`);
        } else {
            this.logger.warn(`Unsupported model: ${modelId}`);
        }
    }

    public getThinkingLevel(): ThinkingOptions {
        return this.thinkingLevel;
    }

    public setThinkingLevel(level: ThinkingOptions): void {
        this.thinkingLevel = level;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API CLIENT METHODS
    // ─────────────────────────────────────────────────────────────────────────
    // Abstract method to initialize and return the AI client instance
    protected abstract getAIClient(): Promise<any>;

    // Retrieve the API key for this provider from the APIKeyManager
    protected async getApiKey(): Promise<string | undefined> {
        try {
            const keyManager = APIKeyManager.getInstance();
            return await keyManager.getApiKey(this.providerName);
        } catch (error) {
            this.logger.error(`Failed to get API key: ${error}`);
            return undefined;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHAT INTERACTION METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Manual general chat interaction with the LLM
    public abstract askChatLLM(userPrompt: any, webview: any): Promise<void>;

    protected prepareChatSession(userPrompt: string): { systemPrompt: string, tools: any[] } {
        // Set Chat Session to general chat
        this.setActiveSession(CHAT_SESSION_ID);
        // User prompt handling
        if (!userPrompt) {
            throw new Error(`${this.getProviderName()} Invalid message format`);
        }
        this.addUserMessage(userPrompt);

        // System prompt handling
        const systemPrompt = GeneralInstructions.combinePrompts(
            GeneralInstructions.getLectureEditingPrompt(),
            FormattingInstructions.getFormattingInstructionsForChat(),
        );

        // Tool handling - toolFormatting already returns an array, don't wrap again
        const toolList = this.toolFormatting(Toolkit.getAllTools());
        this.logger.log(`Available tools: ${Toolkit.getAllTools().map(t => t.name).join(', ')}`);

        return { systemPrompt, tools: toolList };
    }

    protected buildFeedbackMessage(toolResponse: any): string {
        let feedbackText = '';
        if (toolResponse.userFeedback) {
            feedbackText = `User rejected with feedback: "${toolResponse.userFeedback}". Please address this and try again.`;
        } else if (!toolResponse.success) {
            feedbackText = `FAILED: ${toolResponse.error}. Try a different approach.`;
        } else {
            feedbackText = 'SUCCESS: Continue with your task or call task_complete if done.';
        }

        this.logger.log(`Feedback to model: ${feedbackText}`);
        return feedbackText;
    }

    protected handleTextResponse(textResponse: string, consecutiveEmptyResponses: number, webview: vscode.Webview): Boolean {
        if (textResponse) {
            // Add the text to session
            this.addAssistantMessage(textResponse);
            // Display intermediate reasoning to user
            webview.postMessage({
                command: 'SendChatToReact',
                content: `💭 ${textResponse}`
            });
            return true; // Abort due to non-empty response
        }

        // Give the model one more chance with a stronger prompt
        this.addUserMessage([
            "CRITICAL: You have provided an empty response without using any tools. This is wasting API calls.",
            "You MUST either:",
            `1. Call a tool to take action(read_file, edit_range, add_lines_at_position, etc.)`,
            `2. Call task_complete if there is nothing to do or you cannot help further.`,
        ].join('\n'));

        if (consecutiveEmptyResponses >= 2) {
            this.logger.log(`⚠️ Aborting: Model provided ${consecutiveEmptyResponses} consecutive empty responses`);
            webview.postMessage({
                command: 'SendChatToReact',
                content: `⚠️ Aborting: Model provided ${consecutiveEmptyResponses} consecutive empty responses without taking action.`
            });
            return true; // Indicate to abort
        }
        return false; // Continue if not aborting
    }

    protected abstract provideThinkingStyle(): any;

    // Sets the active session for subsequent operations
    public setActiveSession(sessionId: string): void {
        this.activeSessionId = sessionId;
        this.logger.log(`Active session set to: ${sessionId}`);
    }

    // Gets the current active session ID
    public getActiveSessionId(): string {
        return this.activeSessionId;
    }

    // Clears the specified session (defaults to active session)
    public clearChatSession(sessionId?: string): void {
        this.chatSession.clearSession(sessionId ?? this.activeSessionId);
    }

    public abstract addUserMessage(message: any): void;

    public abstract addAssistantMessage(message: any): void;

    /**
     * Adds a tool call and its response to the chat session.
     * @param modelOutput The model's output containing the function call (and reasoning if applicable)
     * @param toolResult The result of executing the tool
     * @param thinkingContext Optional provider-specific thinking context (thought signature for Google, unused for OpenAI)
     */
    public abstract addToolCallMessages(modelOutput: any, toolResult: any, thinkingContext?: any): void;

    // ─────────────────────────────────────────────────────────────────────────
    // TOOL HANDLING METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Tool formatting method specific to the provider
    protected abstract toolFormatting(tools: any[]): any[];

    // Handles tool execution errors by logging and notifying the webview
    protected checkToolErrors(toolError: any, iteration: number, webview: vscode.Webview) {
        this.logger.log(`Tool execution error: ${toolError.message}`);

        webview.postMessage({
            command: 'stopLoading'
        });

        this.logger.error(`Iteration ${iteration} Tool execution failed: ${toolError.message}`);

        webview.postMessage({
            command: 'SendChatToReact',
            content: `❌ Tool execution failed: ${toolError.message}`
        });
    }

    // Log tool call details and notify the webview
    protected logToolCall(functionName: string, args: any, webview: vscode.Webview): void {
        this.logger.log(`\n═══ Tool Call: ${functionName} ═══`);
        this.logger.log(`Arguments: ${JSON.stringify(args, null, 2)}`);

        webview.postMessage({
            command: 'toolExecuting',
            toolName: functionName
        });
    }

    // Log tool response details and notify the webview
    protected logToolResponse(functionName: string, args: any, toolResponse: any, webview: vscode.Webview): void {
        let explanation = toolResponse.data?.message || args.explanation || `Executed ${functionName}`;
        if (toolResponse.success) {
            this.logger.log(`✓ Tool succeeded: ${explanation}`);
            webview.postMessage({
                command: 'SendChatToReact',
                content: `🔧 ${explanation}`
            });
        } else if (toolResponse.userFeedback) {
            this.logger.log(`Tool rejected with feedback: "${toolResponse.userFeedback}"`);
            // User rejected with feedback - inform the agent
            webview.postMessage({
                command: 'SendChatToReact',
                content: `⚠️ Edit rejected. User feedback: "${toolResponse.userFeedback}"`
            });
        } else {
            this.logger.log(`Tool failed: ${toolResponse.error}`);
        }
    }

    // Check and handle API-specific errors
    protected abstract checkAPIErrors(err: any, webview?: vscode.Webview): void;

    // ─────────────────────────────────────────────────────────────────────────
    // STRUCTURED OUTPUT METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Generate structured JSON output based on the provided schema
    public abstract generateStructuredJSON(
        systemPrompt: string,
        responseSchema: z.ZodSchema<any>,
        webSearch?: boolean
    ): Promise<JSONResponse>;

    // Convert Zod schema to provider-specific schema format
    protected abstract convertZodToProviderSchema(schema: z.ZodTypeAny): any;

    // ─────────────────────────────────────────────────────────────────────────
    // LOGGING HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────
    protected logIterationHeader(iteration: number, webview: vscode.Webview): void {
        this.logger.log(`\n${this.getProviderName()} ═══ Iteration ${iteration}/${this.maxIterations} ═══`);
        this.logger.log(`Conversation history length: ${this.chatSession.getContents(this.activeSessionId).length} messages`);
        this.logger.log(`${this.getProviderName()} Sending request to model: ${this.currentModel}`);

        webview.postMessage({
            command: 'startLoading'
        });
    }

    protected logSummaryTaskCompletion(summary: string, webview: vscode.Webview): void {
        this.logger.log('✅ Task completed successfully');
        this.logger.log(`Summary: ${summary}`);

        webview.postMessage({
            command: 'SendChatToReact',
            content: `${summary}`
        });
    }

    protected logTaskAbortion(webview: vscode.Webview): void {
        this.logger.log('❌ Task aborted by user');
        webview.postMessage({
            command: 'SendChatToReact',
            content: '❌ Task aborted by user.'
        });
    }

    protected logEndOfIterations(iteration: number, webview: vscode.Webview): void {
        this.logger.log(`${this.getProviderName()} End of Iteration ${iteration}`);
        webview.postMessage({
            command: 'stopLoading'
        });

        if (iteration >= this.maxIterations) {
            this.logger.log(`⚠️ Maximum iterations (${this.maxIterations}) reached without completion`);
            webview.postMessage({
                command: 'SendChatToReact',
                content: [
                    `⚠️ Maximum iterations reached. The task may not be fully complete.`,
                    `Please review the current state and consider taking manual actions if necessary.`
                ].join(`\n`)
            });
        }
        this.logger.log('════════════════════════════════════════════════════════════');
    }

    protected abstract logTokenUsage(result: any): void;
}