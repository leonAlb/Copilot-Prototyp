import * as vscode from 'vscode';
import { ProviderRegistry } from '../Provider/ProviderRegistry';
import { Logger } from '../../Utils/Logger';
import { LectureFileHelper } from '../../Utils/LectureFileHelper';
import { AbstractLLMProvider, JSONResponse } from '../Provider/AbstractLLMProvider';
import z from 'zod';
import { ToolExecutionResult } from '../Toolbox/ToolExecutor';
import { WATCHER_SESSION_ID } from '../../Utils/ChatSessionManager';

export abstract class BaseWatcher implements vscode.Disposable {
    // Configurations (Can be set in Settings)
    protected watcherName: string; // Name of the watcher
    protected changesUntilAnalysis!: number; // Number of changes before triggering analysis
    protected minAnalysisIntervalMs!: number; // Minimum interval between analyses in milliseconds
    protected analysisGenerationAttempts!: number; // Number of attempts for generation

    // state
    protected changeCount: number = 0; // Count of changes made
    protected isAnalyzing: boolean; // To prevent overlapping analyses
    protected isActive: boolean; // Whether the watcher is active
    protected lastAnalysisTime: number = 0; // Timestamp of the last analysis
    protected isAborted: boolean = false; // Flag to indicate if analysis was aborted

    // Helpers
    protected disposables: vscode.Disposable[] = []; // Store disposables for cleanup
    protected providerRegistry: ProviderRegistry; // Reference to provider registry
    protected provider!: AbstractLLMProvider; // Current LLM provider
    protected readonly logger: Logger; // Logger instance

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR & SETTINGS METHOD
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry, watcherName: string) {
        this.watcherName = watcherName;
        this.isActive = false;
        this.isAnalyzing = false;
        this.providerRegistry = providerRegistry;
        this.logger = new Logger(watcherName);
        this.registerCommand();
    }

    protected abstract loadSettings(): void;

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPT METHODS
    // ─────────────────────────────────────────────────────────────────────────
    protected abstract getAnalysisPrompt(): string;

    protected abstract getUserPrompt(): string;

    // ─────────────────────────────────────────────────────────────────────────
    // SCHEMA
    // ─────────────────────────────────────────────────────────────────────────
    protected abstract getSchema(): z.ZodType<any>;

    // ─────────────────────────────────────────────────────────────────────────
    // LISTENER METHODS
    // ─────────────────────────────────────────────────────────────────────────
    protected registerDocumentChangeListener(): void {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                // Quickest Check: Are we watching?
                if (!this.isActive) {
                    return;
                }
                // Second Check: Is it a lecture file?
                if (!LectureFileHelper.isLectureFile(event.document)) {
                    return;
                }
                // Calculate actual content changes (characters added/removed)
                const changesAmount = event.contentChanges.reduce((total, change) => {
                    // Count characters added + characters removed for accurate tracking
                    const added = change.text.length;
                    const removed = change.rangeLength;
                    this.logger.log(`${this.changeCount} - Change detected: +${added} -${removed}`);
                    return total + added + removed;
                }, 0);

                this.changeCount += changesAmount;

                // Trigger analysis if threshold reached
                if (this.changeCount >= this.changesUntilAnalysis) {
                    this.logger.log(`Change threshold reached (${this.changeCount} characters changed). Triggering analysis.`);
                    await this.triggerAnalysis();
                }
            })

        );


        // Reset accumulator when switching files
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.changeCount = 0;
            })
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER & ANALYSIS METHODS
    // ─────────────────────────────────────────────────────────────────────────
    private async triggerAnalysis(force?: boolean): Promise<void> {
        this.changeCount = 0;
        const now = Date.now();

        // Guards (skip if force)
        if (!force) {
            if (now - this.lastAnalysisTime < this.minAnalysisIntervalMs) {
                this.logger.warn('Analysis throttled - too soon since last analysis');
                return;
            }
            if (this.isAnalyzing) {
                this.logger.warn('Analysis already in progress');
                return;
            }
            if (!this.provider) {
                this.logger.error('No LLM provider available');
                return;
            }
        } else {
            this.logger.log('Force triggering analysis, bypassing throttling.');
        }

        this.isAnalyzing = true;
        this.lastAnalysisTime = now;
        this.setupChatSession();

        try {
            await this.performAnalysis();
        } catch (error) {
            this.logger.error(`Analysis failed: ${error}`);
        } finally {
            this.isAnalyzing = false;
        }
    }

    protected abstract performAnalysis(): Promise<void>;

    // ─────────────────────────────────────────────────────────────────────────
    // GENERATION RESULT HANDLING METHODS
    // ─────────────────────────────────────────────────────────────────────────

    protected async generateAnalysis(
        progressTitle: string,
        systemPrompt: string,
        userPrompt: string
    ): Promise<JSONResponse | undefined> {

        this.provider.addUserMessage(userPrompt);
        this.isAborted = false;

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `LecturePilot: ${progressTitle}`,
            cancellable: true
        }, async (_progress, token) => {
            token.onCancellationRequested(() => {
                this.abort();
            });

            if(this.isAborted) { return undefined;}

            return await this.provider.generateStructuredJSON(
                systemPrompt,
                this.getSchema()
            );
        });
    }

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

    // ─────────────────────────────────────────────────────────────────────────
    // TOOL UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

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

    // ─────────────────────────────────────────────────────────────────────────
    // PROVIDER & CLEAN UP METHODS
    // ─────────────────────────────────────────────────────────────────────────

    protected registerCommand(): void {
        this.disposables.push(
            vscode.commands.registerCommand(`lecturepilot.toggle${this.watcherName}`, async () => {

                const setupSuccess = await this.setupProvider();
                if (!setupSuccess) {
                    vscode.window.showErrorMessage(`Cannot toggle ${this.watcherName}: No LLM provider available.`);
                    return;
                }

                // Toggle watching state
                this.isActive = !this.isActive;
                if (this.isActive) {
                    vscode.window.showInformationMessage(`${this.watcherName} activated.`);
                    this.logger.log(`${this.watcherName} activated.`);
                } else {
                    vscode.window.showInformationMessage(`${this.watcherName} deactivated.`);
                    this.logger.log(`${this.watcherName} deactivated.`);
                }
            }
            ));

        this.disposables.push(
            vscode.commands.registerCommand(`lecturepilot.run${this.watcherName}`, async () => {

                const setupSuccess = await this.setupProvider();
                if (!setupSuccess) {
                    vscode.window.showErrorMessage(`Cannot run ${this.watcherName}: No LLM provider available.`);
                    return;
                }

                vscode.window.showInformationMessage(`Manually triggering ${this.watcherName} analysis.`);
                await this.triggerAnalysis(true);
            }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────

    public abort(): void {
        this.isAborted = true;
        this.logger.log('Analysis aborted.');
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
    }

    private setupChatSession(): void {
        const watcherSessionId = `${WATCHER_SESSION_ID}_${this.watcherName}`;
        this.provider.setActiveSession(watcherSessionId);
        this.provider.clearChatSession(watcherSessionId);
    }

    private async setupProvider(): Promise<boolean> {
        // Ensure provider registry is set
        if (!this.providerRegistry) {
            this.logger.error('No provider registry available');
            return false;
        }
        // Get current provider
        const provider = this.providerRegistry.getCurrentProvider();
        if (!provider) {
            this.logger.error('No LLM provider available');
            return false;
        }
        this.provider = provider;
        return true;
    }
}