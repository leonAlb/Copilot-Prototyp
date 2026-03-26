import * as vscode from 'vscode';
import { z } from 'zod';
import { GoogleGenAI } from "@google/genai";
import { AbstractLLMProvider, JSONResponse } from './AbstractLLMProvider';
import { ThinkingOptions } from '../../ExtensionManager/SettingsManager';
import { ToolExecutor } from '../Toolbox/ToolExecutor';

/**
 * Google LLM Provider using Google Gemini models.
 * Implements interaction with Google GenAI API and tool handling.
 */
export class GoogleProvider extends AbstractLLMProvider {

    constructor() {
        super('Google Gemini');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API CALL METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Agent loop.
     * Asks the LLM a question and handles tool calls iteratively until:
     * 1. The agent explicitly calls task_complete or gives a NON EMPTY text response
     * 2. The user aborts by providing empty feedback on rejection
     * 3. Maximum iterations are reached
     * 
     * @param userPrompt the initial user prompt message
     * @param webview the VSCode webview to communicate with the UI
     */
    public async askChatLLM(userPrompt: any, webview: vscode.Webview) {
        // Step 1: Initialize Google AI client
        const googleAI = await this.getAIClient();
        if (!googleAI) {
            webview.postMessage({ command: 'stopLoading' });
            return;
        }
        this.logger.log('Initiating agent loop');

        try {
            // Step 2: Validate user prompt and prepare conversation
            const { systemPrompt, tools } = this.prepareChatSession(userPrompt);

            // Step 3: Setup ReAct loop variables
            let iteration = 0;
            let consecutiveEmptyResponses = 0;

            // Step 4: Agent loop to handle model responses and tool calls
            while (iteration < this.maxIterations) {
                iteration++;

                // Log iteration start and notify UI
                this.logIterationHeader(iteration, webview);

                // Step 4a: Call Google Gemini model with current conversation
                const startTime = performance.now();
                let result = await googleAI.models.generateContent({
                    model: this.currentModel,
                    contents: this.chatSession.getContents(this.activeSessionId),
                    config: {
                        systemInstruction: systemPrompt,
                        tools,
                        thinkingConfig: this.provideThinkingStyle(),
                    }
                });
                const elapsedMs = performance.now() - startTime;

                // Log token usage for cost tracking
                this.logTokenUsage(result, elapsedMs);

                // Step 4b: Handle possible function calls
                const functionCall = result.functionCalls?.[0];

                if (functionCall) {
                    consecutiveEmptyResponses = 0; // Reset on tool call
                    const functionName = functionCall.name;
                    const args: any = functionCall.args;

                    // Extract thought signature from response parts for multi-turn thinking (Gemini 2.5+/3.0)
                    // The signature is on the first functionCall part and must be passed back
                    const thoughtSignature = this.handleThoughtSignature(result);

                    this.logToolCall(functionName!, args, webview);

                    try {
                        const toolResponse = await ToolExecutor.executeTool(functionName, args);

                        // Prepare function response status upfront
                        const status = toolResponse.aborted
                            ? 'aborted'
                            : toolResponse.success ? 'success' : 'failed';

                        // Check for task_complete tool
                        if (functionName === 'task_complete' && toolResponse.success) {
                            const summary = args.summary || 'Task completed';

                            this.logSummaryTaskCompletion(summary, webview);

                            // Add tool call and response to chat session (include thought signature if present)
                            this.addToolCallMessages(functionCall, { name: functionName, response: { result: toolResponse, status } }, thoughtSignature);
                            break;
                        }

                        // Display tool execution in chat (even if aborted/failed) for visibility
                        this.logToolResponse(functionName!, args, toolResponse, webview);

                        // Build feedback message for the model
                        const feedbackText = this.buildFeedbackMessage(toolResponse);

                        // Prepare function response with status and feedback
                        const functionResponsePart = {
                            name: functionName,
                            response: {
                                result: toolResponse,
                                status,
                                feedback: feedbackText
                            }
                        };

                        // Add function call from model, then function response from user (include thought signature if present)
                        this.addToolCallMessages(functionCall, functionResponsePart, thoughtSignature);

                        // Check if user aborted after response is recorded
                        if (toolResponse.aborted) {
                            this.logTaskAbortion(webview);
                            break;
                        }

                        // Continue to next iteration
                        continue;
                    }
                    catch (toolError: any) {
                        // Even on tool execution failure, emit a function response immediately after the call to satisfy Gemini turn ordering
                        const functionResponsePart = {
                            name: functionName,
                            response: {
                                result: { success: false, error: toolError?.message || 'Tool execution failed' },
                                status: 'failed',
                                feedback: 'Tool execution failed; see logs.'
                            }
                        };
                        this.addToolCallMessages(functionCall, functionResponsePart, thoughtSignature);

                        this.checkToolErrors(toolError, iteration, webview);
                        return;
                    }
                }
                // Step 4d: Handle text responses without tool calls
                else {
                    consecutiveEmptyResponses++;
                    const textResponse = result.text || '';
                    const abort = this.handleTextResponse(textResponse, consecutiveEmptyResponses, webview);
                    if (abort) {
                        break;
                    }
                }
            }
            // Step 5: Post-loop handling for incomplete tasks
            this.logEndOfIterations(iteration, webview);
        }
        catch (err: any) {
            // Stop loading indicator on error
            this.checkAPIErrors(err, webview);
        }
    }

    public async generateStructuredJSON(
        systemPrompt: string,
        jsonSchema: z.ZodObject<any>,
        webSearch?: boolean
    ): Promise<JSONResponse> {

        const googleAI = await this.getAIClient();
        if (!googleAI) {
            this.logger.error('Failed to initialize AI client');
            return { type: 'api_error' };
        }

        // Gemini 2.5 models and lower don't support tool use with structured JSON output
        const supportsToolsWithJson = this.currentModel.startsWith('gemini-3');
        const useWebSearch = webSearch && supportsToolsWithJson;

        if (webSearch && !supportsToolsWithJson) {
            vscode.window.showWarningMessage(`Web search & Tool use is not supported for Gemini models below 3.0! Proceeding without web search.`);
        }

        try {
            const startTime = performance.now();
            const result = await googleAI.models.generateContent({
                model: this.currentModel,
                contents: this.chatSession.getContents(this.activeSessionId),
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: "application/json",
                    responseJsonSchema: this.convertZodToProviderSchema(jsonSchema),
                    thinkingConfig: this.provideThinkingStyle(),
                    tools: useWebSearch ? [{ googleSearch: {} }] : []
                }
            });
            const elapsedMs = performance.now() - startTime;

            // Log token usage for cost tracking
            this.logTokenUsage(result, elapsedMs);

            if (!result || !result.text) {
                return { type: 'no_output' };
            }

            const parsed = jsonSchema.parse(JSON.parse(result.text));
            return { type: 'success', data: parsed };
        } catch (err: any) {
            this.checkAPIErrors(err);
            return { type: 'api_error' };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────
    protected async getAIClient(): Promise<GoogleGenAI | null> {
        if (this.aiClient) {
            return this.aiClient;
        }

        const apiKey = await this.getApiKey();
        if (!apiKey) {
            return null;
        }

        this.aiClient = new GoogleGenAI({ apiKey });
        this.logger.log('AI client initialized with API key');
        return this.aiClient;
    }

    public getSupportedModels(): string[] {
        return [
            'gemini-3-pro-preview',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
        ];
    }

    protected checkAPIErrors(err: any, webview?: vscode.Webview): void {
        if (webview) {
            webview.postMessage({
                command: 'stopLoading'
            });
        }
        const errorMessage: string = typeof err?.message === 'string' ? err.message : JSON.stringify(err);
        this.logger.error(errorMessage);

        const codeMatch = errorMessage.match(/"code"\s*:\s*"?([^",}]+)"?/);
        const statusMatch = errorMessage.match(/"status"\s*:\s*"([^"]+)"/);
        const messageMatch = errorMessage.match(/"message"\s*:\s*"([^"]+)"/);

        if (!codeMatch && !statusMatch && !messageMatch) {
            vscode.window.showErrorMessage(`Error using ${this.getProviderName()} API: ${errorMessage}`);

            return;
        }

        const code = codeMatch ? codeMatch[1] : 'Unknown';
        const status = statusMatch ? statusMatch[1] : 'Unknown';
        const message = messageMatch ? messageMatch[1].substring(0, 150) : 'No message provided';

        if (webview) {
            webview.postMessage({
                command: 'SendChatToReact',
                content: [`Error using ${this.getProviderName()} API!`,
                `Error Code: ${code}`,
                `Message: ${message}`,
                `Status: ${status}`
                ].join('\n')
            });
        } else {
            vscode.window.showErrorMessage(`Error using ${this.getProviderName()} API: Code=${code}, Message=${message}, Status=${status}`);
        }
    }

    protected toolFormatting(tools: any[]): any[] {
        return [{
            functionDeclarations: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }))
        }];
    }

    protected convertZodToProviderSchema(schema: z.ZodTypeAny): any {
        return z.toJSONSchema(schema);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MESSAGE HANDLING METHODS
    // ─────────────────────────────────────────────────────────────────────────
    public addUserMessage(userMessage: string): void {
        this.chatSession.addMessage({
            role: 'user',
            parts: [{ text: userMessage }]
        }, this.activeSessionId);
    }

    public addAssistantMessage(assistantMessage: string): void {
        this.chatSession.addMessage({
            role: 'model',
            parts: [{ text: assistantMessage }]
        }, this.activeSessionId);
    }

    /**
     * Adds a tool call and its response to the chat session.
     * @param modelOutput The function call from the model's output
     * @param toolResult The function response containing name and response data
     * @param thinkingContext Optional thought signature for multi-turn thinking (Gemini 3.0)
     */
    public addToolCallMessages(modelOutput: any, toolResult: any, thinkingContext?: any): void {
        // Build the function call part, including thought signature if present
        const functionCallPart: any = { functionCall: modelOutput };
        if (thinkingContext) {
            functionCallPart.thoughtSignature = thinkingContext;
        }

        this.chatSession.addMessages([
            {
                role: 'model',
                parts: [functionCallPart]
            },
            {
                role: 'user',
                parts: [{ functionResponse: toolResult }]
            }
        ], this.activeSessionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOGGING METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Log token usage from API response for cost tracking.
     * Logs input tokens, output tokens, thinking tokens (if present), and totals.
     * @param result The API response containing usageMetadata
     */
    protected logTokenUsage(result: any, elapsedMs?: number): void {
        try {
            const usage = result?.usageMetadata;
            if (!usage) {
                this.logger.log('Token usage: Not available');
                return;
            }

            const inputTokens = usage.promptTokenCount || 0;
            const outputTokens = usage.candidatesTokenCount || 0;
            const thoughtTokens = usage.thoughtsTokenCount || 0;
            const totalTokens = usage.totalTokenCount || (inputTokens + outputTokens);
            const cachedTokens = usage.cachedContentTokenCount || 0;

            const lines = [
                `[${this.getProviderName()} · ${this.currentModel}]`,
                '┌─── Token Usage ───┐',
                `│ Input:    ${inputTokens.toLocaleString().padStart(8)} tokens`,
                `│ Cached:   ${cachedTokens.toLocaleString().padStart(8)} tokens`,
                `│ Output:   ${outputTokens.toLocaleString().padStart(8)} tokens`,
                `│ Thinking: ${thoughtTokens.toLocaleString().padStart(8)} tokens`,
                `│ Total:    ${totalTokens.toLocaleString().padStart(8)} tokens`,
            ];
            if (elapsedMs !== undefined) {
                const seconds = (elapsedMs / 1000).toFixed(2);
                lines.push(`│ Time:     ${seconds.padStart(8)}s`);
            }
            lines.push('└───────────────────┘');

            // Log to developer console
            lines.forEach(l => this.logger.log(l));

            // Log to user-visible Output channel
            const ch = AbstractLLMProvider.metricsChannel;
            ch.appendLine(`[${new Date().toLocaleTimeString()}] ${lines[0]}`);
            lines.slice(1).forEach(l => ch.appendLine(l));
            ch.appendLine('');
        } catch (e) {
            this.logger.warn('Token usage: Could not parse usage metadata');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // THINKING CONFIG METHODS
    // ─────────────────────────────────────────────────────────────────────────

    protected provideThinkingStyle(): any {
        if (this.currentModel === 'gemini-2.5-pro') {
            return { thinkingBudget: -1 }; // Gemini 2.5 Pro does only support dynamic thinking
        }
        const level = this.getThinkingLevel();
        if (level === ThinkingOptions.HIGH) {
            return this.currentModel.startsWith('gemini-3') ? { thinkingLevel: "high" } : { thinkingBudget: -1 }; // Unlimited thinking budget
        } else if (level === ThinkingOptions.MEDIUM) {
            // Currently not supported in Gemini, fallback to high for Gemini 3, no thinking for others
            vscode.window.showInformationMessage(`[${this.getProviderName()}] Medium thinking level is not supported for the selected model. Using High thinking level instead.`);
            return this.currentModel.startsWith('gemini-3') ? { thinkingLevel: "high" } : { thinkingBudget: -1 };
        } else {
            return this.currentModel.startsWith('gemini-3') ? { thinkingLevel: "low" } : { thinkingBudget: 0 }; // Low or no thinking budget
        }
    }

    private handleThoughtSignature(result: any): string | undefined {
        try {
            const parts = result.candidates?.[0]?.content?.parts;
            if (parts && parts.length > 0 && parts[0].thoughtSignature) {
                this.logger.log(`Thought signature found (${parts[0].thoughtSignature.length} bytes)`);
                return parts[0].thoughtSignature;
            }
        } catch (e) {
            this.logger.log('No thought signature in response (older model or SDK)');
        }
    }
}


