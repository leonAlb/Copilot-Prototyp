import * as vscode from 'vscode';
import { BaseWatcher } from './BaseWatcher';
import { SettingsManager } from '../../ExtensionManager/SettingsManager';
import { ProviderRegistry } from '../Provider/ProviderRegistry';
import { FormattingInstructions } from '../Instructions/FormattingInstructions';
import z from 'zod';
import { LectureFileHelper } from '../../Utils/LectureFileHelper';
import { JSONResponse } from '../Provider/AbstractLLMProvider';
import { ToolExecutor } from '../Toolbox/ToolExecutor';

interface FormatAnalysisResult {
    suggestedCorrections: {
        originalText: string;
        correctedText: string;
    }[];
    changesMade: number;
};


export class FormatWatcher extends BaseWatcher {

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR & SETTINGS METHOD
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry) {
        super(providerRegistry, 'FormatWatcher');
        // Step 1: Load settings
        this.loadSettings();
        // Step 2: Register document change listener after settings are loaded
        this.registerDocumentChangeListener();
    }

    protected loadSettings(): void {
        this.changesUntilAnalysis = SettingsManager.getFormatChangesUntilAnalysis();
        this.minAnalysisIntervalMs = SettingsManager.getFormatMinAnalysisIntervalMs();
        this.analysisGenerationAttempts = SettingsManager.getFormatAnalysisGenerationAttempts();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPT METHODS
    // ─────────────────────────────────────────────────────────────────────────
    protected getAnalysisPrompt(): string {
        return `You are a formatting and layout assistant for lecture slides. Your ONLY job is to ensure that the content follows the provided FORMATTING RULES and layout standards. DO NOT rephrase, rewrite, or "improve" sentences for style, clarity, or pedagogy. DO NOT change content that already fits the formatting rules.

    ${FormattingInstructions.getFormattingInstructions()}

    YOUR APPROACH:
    - Only suggest corrections for formatting/layout issues (e.g., line too long, inconsistent bullet structure, whitespace problems).
    - If a line is too long and cannot be split without losing meaning, you may rephrase it, but the meaning must remain exactly the same.
    - NEVER rephrase, rewrite, or change sentences that are already within the allowed length and conform to formatting rules.
    - NEVER introduce changes just to "sound better" or for style.
    - NEVER add or remove content, only adjust layout/formatting.

    EXAMPLES:
    ✗ BAD: Changing a clear, short sentence to a different wording.
    ✗ BAD: Rewriting for style or clarity when not required by formatting rules.
    ✗ BAD: Mechanically inserting line breaks every N characters.
    ✓ GOOD: Splitting a long sentence into two lines if it exceeds the allowed length.
    ✓ GOOD: Converting a run-on explanation into bullet points ONLY if it is too long for a single line.

    OUTPUT FORMAT:
    - 'originalText': The EXACT text from the source (verbatim, including whitespace/line breaks)
    - 'correctedText': The minimally changed version that fixes ONLY the formatting/layout issue

    MATCHING REQUIREMENTS:
    - 'originalText' must match the source exactly for replacement to work
    - Include enough surrounding context to ensure a unique match

    If the user gives feedback on your suggestions, incorporate it in your next analysis. The user has the final say.`;
    }

    protected getUserPrompt(): string {
        return `Please analyze the following lecture slides for formatting adherence.
Each slide block includes the corresponding file line range.

CONTEXT:
${LectureFileHelper.getSlidesContentWithLineNumbers().map((slide, index) =>
            `--- SLIDE ${index + 1} START (File Lines: ${slide.startLine} - ${slide.endLine}) ---
${slide.content}
--- SLIDE ${index + 1} END ---`
        ).join('\n\n')}`;
    }

    // ───────────────────────────────────────────────────────────────────────── 
    // SCHEMA
    // ─────────────────────────────────────────────────────────────────────────

    protected getSchema(): z.ZodType<FormatAnalysisResult> {
        return z.object({
            suggestedCorrections: z.array(
                z.object({
                    originalText: z.string().describe('The EXACT text segment from the source that requires modification. Must match the source verbatim (including whitespace and line breaks) for text replacement to work. Only select text that violates formatting/layout rules.'),
                    correctedText: z.string().describe('The minimally changed version that fixes ONLY the formatting/layout issue. Do NOT rephrase, rewrite, or change for style, clarity, or pedagogy. Only rephrase if a line is too long and cannot be split without losing meaning.'),
                })
            ).describe('List of formatting/layout corrections. Each correction should address ONLY formatting or layout issues (e.g., line too long, bullet structure, whitespace). Do NOT suggest changes for style or clarity.'),
            changesMade: z.number().describe('Total number of formatting/layout changes suggested.'),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION METHODS
    // ─────────────────────────────────────────────────────────────────────────

    protected validateAnalysisResult(result: FormatAnalysisResult): boolean {
        return result.changesMade === result.suggestedCorrections.length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ANALYSIS METHODS
    // ─────────────────────────────────────────────────────────────────────────

    protected async performAnalysis(): Promise<void> {
        let attempts: number = 0;
        while (attempts < this.analysisGenerationAttempts) {
            attempts++;

            // Step 2: Send to LLM using BaseWatcher helper
            const result = await this.generateAnalysis(
                'Format Analysis in Progress',
                this.getAnalysisPrompt(),
                this.getUserPrompt()
            );

            if (this.isAborted) { return; }
            this.logger.log(`Generation attempt result: ${JSON.stringify(result)}`);

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }
            if (!result) { return; } 

            const analysisResult = result.data as FormatAnalysisResult;
            // Step 4: Validate output
            const isValid = this.getSchema().safeParse(analysisResult).success;
            if (!isValid) {
                this.logger.warn(`Invalid output format received.`);
                this.provider.addUserMessage('The response format was invalid. Please adhere strictly to the specified JSON format.');
                continue;
            }

            if (analysisResult.suggestedCorrections.length === 0) {
                this.logger.log('No formatting issues detected. Analysis complete.');
                vscode.window.showInformationMessage('FormatWatcher: No formatting issues detected.');
                return;
            }
            // Apply suggested corrections
            const feedbackReceived = await this.applyCorrections(analysisResult.suggestedCorrections);

            // Handle user feedback
            if (feedbackReceived.aborted) {
                vscode.window.showWarningMessage('Format correction application aborted by user.');
                this.logger.log('User aborted during correction application.');
                return;
            } else if (feedbackReceived.feedback) {
                this.logger.log(`User provided feedback: ${feedbackReceived.feedback}`);
                this.provider.addUserMessage(`User FEEDBACK on suggested corrections: ${feedbackReceived.feedback}`);
            } else {
                this.logger.log('All formatting corrections applied successfully without user feedback.');
                return;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────

    private async applyCorrections(corrections: FormatAnalysisResult['suggestedCorrections']): Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }> {
        const explanation = `Applied formatting corrections suggested by the FormatWatcher LLM analysis.`;

        // Extract original texts and corrected texts for the replace_text tool
        const originalTexts = corrections.map(c => c.originalText);
        const newContents = corrections.map(c => c.correctedText);

        // Use replace_text tool for text-based replacement (robust against line number shifts)
        const args = { 
            originalTexts, 
            newContents, 
            explanation 
        };

        const result = await ToolExecutor.executeTool('replace_text', args);

        return this.handleToolResult(result);
    }
}