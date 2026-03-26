import OpenAI from "openai";
import * as vscode from 'vscode';
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { AbstractLLMProvider } from './AbstractLLMProvider';
import { ThinkingOptions } from '../../ExtensionManager/SettingsManager';
import { ToolExecutor } from "../Toolbox/ToolExecutor";
import { JSONResponse } from "./AbstractLLMProvider";

/**
 * OpenAI LLM Provider using OpenAI models.
 * Implements interaction with OpenAI API and tool handling.
 */
export class OpenAIProvider extends AbstractLLMProvider {

    constructor() {
        super('OpenAI');
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
        // Step 1: Initialize OpenAI client
        const openAI = await this.getAIClient();
        if (!openAI) {
            webview.postMessage({ command: 'stopLoading' });
            return;
        }
        this.logger.log('Initiating agent loop');

        try {
            // Step 2: Prepare conversation
            const { systemPrompt, tools } = this.prepareChatSession(userPrompt);

            // Step 3: Setup Agent Loop variables
            let iteration = 0;
            let consecutiveEmptyResponses = 0;

            // Step 4: Agent loop to handle model responses and tool calls
            while (iteration < this.maxIterations) {
                iteration++;

                // Log iteration start and notify UI
                this.logIterationHeader(iteration, webview);

                // Call OpenAI Responses API
                const startTime = performance.now();
                let result = await openAI.responses.create({
                    model: this.currentModel,
                    input: this.chatSession.getContents(this.activeSessionId),
                    instructions: systemPrompt,
                    tools: tools,
                    tool_choice: "auto", // Let model decide: tools for edits, text for conversation
                    text: {"format": { "type": "text" }},
                    reasoning: this.provideThinkingStyle()
                });
                const elapsedMs = performance.now() - startTime;

                // Log token usage for cost tracking
                this.logTokenUsage(result, elapsedMs);

                // Step 4b: Find ALL function calls in the output (skip reasoning items)
                const functionCallItems = result.output.filter((item: any) => item.type === 'function_call') as any[];
                const messageItem = result.output.find((item: any) => item.type === 'message') as any;

                if (functionCallItems.length > 0) {
                    consecutiveEmptyResponses = 0; // Reset counter on tool call

                    // Add all model output items (reasoning + all function_calls) to session first
                    for (const item of result.output) {
                        this.chatSession.addMessage(item, this.activeSessionId);
                    }

                    let shouldBreak = false;

                    // Execute each function call and always add its output to satisfy OpenAI's turn ordering
                    for (const functionCallItem of functionCallItems) {
                        const functionName = functionCallItem.name;
                        const args = JSON.parse(functionCallItem.arguments);

                        this.logger.log(`Output: function_call(${functionName})`);
                        this.logToolCall(functionName, args, webview);

                        try {
                            const toolResponse = await ToolExecutor.executeTool(functionName, args);

                            const status = toolResponse.aborted
                                ? 'aborted'
                                : toolResponse.success ? 'success' : 'failed';
                            const feedbackText = this.buildFeedbackMessage(toolResponse);

                            // Always add function_call_output to session
                            this.chatSession.addMessage({
                                type: 'function_call_output',
                                call_id: functionCallItem.call_id,
                                output: JSON.stringify({
                                    result: toolResponse,
                                    status,
                                    feedback: feedbackText
                                })
                            }, this.activeSessionId);

                            // Check for task_complete tool
                            if (functionName === 'task_complete' && toolResponse.success) {
                                this.logSummaryTaskCompletion(args.summary || 'Task completed', webview);
                                shouldBreak = true;
                                break;
                            }

                            // Check if user aborted
                            if (toolResponse.aborted) {
                                this.logTaskAbortion(webview);
                                shouldBreak = true;
                                break;
                            }

                            // Display tool execution in chat
                            this.logToolResponse(functionName, args, toolResponse, webview);
                        }
                        catch (toolError: any) {
                            // Add error output to satisfy OpenAI's requirement that every function_call has a function_call_output
                            this.chatSession.addMessage({
                                type: 'function_call_output',
                                call_id: functionCallItem.call_id,
                                output: JSON.stringify({
                                    result: { success: false, error: toolError?.message || 'Tool execution failed' },
                                    status: 'failed',
                                    feedback: 'Tool execution failed; see logs.'
                                })
                            }, this.activeSessionId);

                            this.checkToolErrors(toolError, iteration, webview);
                            return;
                        }
                    }

                    if (shouldBreak) { break; }
                    continue;
                }
                // Step 4d: Handle text/message responses without tool calls
                else if (messageItem) {
                    const textContent = messageItem.content?.[0]?.text || result.output_text || '';
                    this.logger.log(`Output: message(${textContent.length} chars)`);
                    if (textContent) {
                        this.addAssistantMessage(textContent);
                        webview.postMessage({
                            command: 'SendChatToReact',
                            content: `💭 ${textContent}`
                        });
                        break; // Non-empty text response ends the loop
                    }
                    consecutiveEmptyResponses++;
                    const abort = this.handleTextResponse(textContent, consecutiveEmptyResponses, webview);
                    if (abort) {
                        break;
                    }
                }
                // Step 4e: Handle text responses without tool calls
                else {
                    this.logger.log(`Output: no function_call`);
                    consecutiveEmptyResponses++;
                    const textResponse = result.output_text || '';
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
            this.checkAPIErrors(err, webview);
        }
    }

    public async generateStructuredJSON(
        systemPrompt: string,
        jsonSchema: z.ZodObject<any>,
        webSearch?: boolean
    ): Promise<JSONResponse> {
        const openAI = await this.getAIClient();
        if (!openAI) {
            this.logger.error('Failed to initialize AI client');
            vscode.window.showErrorMessage(`${this.getProviderName()} Error: Could not initialize AI client.`);
            return { type: 'api_error' };
        }

        try {
            const startTime = performance.now();
            const result = await openAI.responses.create({
                model: this.currentModel,
                input: this.chatSession.getContents(this.activeSessionId),
                instructions: systemPrompt,
                text: {
                    format: this.convertZodToProviderSchema(jsonSchema)
                },
                reasoning: this.provideThinkingStyle(),
                tools: webSearch ? [{ type: "web_search" }] : []
            });
            const elapsedMs = performance.now() - startTime;

            this.logTokenUsage(result, elapsedMs);
            this.logger.log(`Structured JSON output: ${result.output_text?.length || 0} chars`);
            const textResponse = result.output_text;

            if (!textResponse) {
                return { type: 'no_output' };
            }

            // Parse the JSON output
            const parsed = JSON.parse(textResponse);
            return { type: 'success', data: parsed };

        } catch (err: any) {
            this.checkAPIErrors(err);
            return { type: 'api_error' };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────
    protected checkAPIErrors(err: any, webview?: vscode.Webview): void {
        if (webview) {
            webview.postMessage({
                command: 'stopLoading'
            });
        }
        this.logger.error(`checkAPIErrors: ${err}`);
        if (err instanceof OpenAI.APIError) {
            if (webview) {
                webview.postMessage({
                    command: 'SendChatToReact',
                    content: [
                        `${this.getProviderName()} API Error`,
                        `Status: ${err.status}`,
                        `Type: ${err.type}`,
                        `Message : ${err.message}`
                    ].join('\n')

                });
            } else {
                vscode.window.showErrorMessage(`[${this.getProviderName()}] API Error: ${err.message}`);
            }
        } else {
            if (webview) {
                webview.postMessage({
                    command: 'SendChatToReact',
                    content: `${this.getProviderName()} Error: ${err.message}`
                });
            } else {
                vscode.window.showErrorMessage(`[${this.getProviderName()}] Error: ${err.message}`);
            }
        }
    }

    protected async getAIClient(): Promise<OpenAI | null> {
        if (this.aiClient) {
            return this.aiClient;
        }
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            return null;
        }

        this.aiClient = new OpenAI({ apiKey });
        this.logger.log('AI client initialized with API key');
        return this.aiClient;
    }

    public getSupportedModels(): string[] {
        return [
            'gpt-5.2',
            'gpt-5-nano', // High reasoning ist not recommended on nano, takes a long time
            'gpt-5-mini',
        ];
    }

    protected toolFormatting(tools: any[]): any[] {
        const makeStrictSchema = (schema: any): any => {
            if (!schema || typeof schema !== 'object') {
                return schema;
            }

            const result: any = { ...schema };

            // For object types: add additionalProperties: false and require all properties
            if (result.type === 'object') {
                result.additionalProperties = false;

                // OpenAI strict mode requires ALL properties to be in 'required'
                if (result.properties) {
                    result.required = Object.keys(result.properties);
                }
            }

            // Recursively process properties
            if (result.properties) {
                result.properties = { ...result.properties };
                for (const key of Object.keys(result.properties)) {
                    result.properties[key] = makeStrictSchema(result.properties[key]);
                }
            }

            // Recursively process array items
            if (result.items) {
                result.items = makeStrictSchema(result.items);
            }

            return result;
        };

        return tools.map(tool => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: makeStrictSchema(tool.parameters),
            strict: true
        }));
    }

    protected convertZodToProviderSchema(jsonSchema: z.ZodObject<any>): any {
        return zodTextFormat(jsonSchema, "Structured_JSON_Output");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MESSAGE HANDLING METHODS
    // ─────────────────────────────────────────────────────────────────────────

    public addUserMessage(message: any): void {
        this.chatSession.addMessage({
            role: 'user',
            content: message
        }, this.activeSessionId);
    }
    public addAssistantMessage(message: any): void {
        this.chatSession.addMessage({
            role: 'assistant',
            content: message
        }, this.activeSessionId);
    }

    /**
     * Adds a tool call and its response to the chat session.
     * @param modelOutput The full output array from the model (includes reasoning + function_call)
     * @param toolResult Object containing callId and output data
     * @param thinkingContext Unused for OpenAI (reasoning is included in modelOutput)
     */
    public addToolCallMessages(modelOutput: any, toolResult: any, thinkingContext?: any): void {
        // Add all model output items (reasoning + function_call) to conversation
        for (const item of modelOutput) {
            this.chatSession.addMessage(item, this.activeSessionId);
        }

        // Then add the function call output
        const output = toolResult.output;
        this.chatSession.addMessage({
            type: 'function_call_output',
            call_id: toolResult.callId,
            output: typeof output === 'string' ? output : JSON.stringify(output)
        }, this.activeSessionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOGGING METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Log token usage from API response for cost tracking.
     * Logs input tokens, output tokens, reasoning tokens (if present), and totals.
     * @param result The API response containing usage information
     */
    protected logTokenUsage(result: any, elapsedMs?: number): void {
        try {
            const usage = result?.usage;
            if (!usage) {
                this.logger.log('Token usage: Not available');
                return;
            }

            const inputTokens = usage.input_tokens || 0;
            const outputTokens = usage.output_tokens || 0;
            const totalTokens = usage.total_tokens || (inputTokens + outputTokens);
            const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

            const lines = [
                `[${this.getProviderName()} · ${this.currentModel}]`,
                '┌─── Token Usage ───┐',
                `│ Input:    ${inputTokens.toLocaleString().padStart(8)} tokens`,
                `│ Output:   ${outputTokens.toLocaleString().padStart(8)} tokens`,
                `│ Reason:   ${reasoningTokens.toLocaleString().padStart(8)} tokens`,
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

    // Not all models are reasoing-capable, gpt-5 supports it
    protected provideThinkingStyle(): any {
        const level = this.getThinkingLevel();
        if (level === ThinkingOptions.HIGH) {
            return { effort: "high" };
        } else if (level === ThinkingOptions.MEDIUM) {
            return { effort: "medium" };
        } else {
            return { effort: "low" };
        }
    }
}