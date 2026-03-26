import * as vscode from 'vscode';
import { ProviderRegistry } from '../Provider/ProviderRegistry';
import z from 'zod';
import type { JSONResponse } from '../Provider/AbstractLLMProvider';
import { LectureFileHelper } from '../../Utils/LectureFileHelper';
import { BaseWatcher } from './BaseWatcher';
import { SettingsManager } from '../../ExtensionManager/SettingsManager';

interface ComplexityAnalysisResult {
    issues: ComplexityIssue[];
    overallComplexityScore: number;
    summary: string;
}

interface ComplexityIssue {
    type: 'unexplained_abbreviation' | 'knowledge_gap' | 'complexity_peak' | 'missing_context' | 'unclear_transitions';
    description: string;
    suggestion: string;
}

export class ComplexityWatcher extends BaseWatcher {

    private expectedIssues: string[] = []; // List of expected issues to ignore

    private outputChannel: vscode.OutputChannel; // Output channel for Extension User to see analysis results

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR & SETTINGS METHOD
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry) {
        super(providerRegistry, 'ComplexityWatcher');
        this.outputChannel = vscode.window.createOutputChannel('LecturePilot Analysis');
        this.disposables.push(this.outputChannel);
        // Step 1: Load settings
        this.loadSettings();
        // Step 2: Register document change listener after settings are loaded
        this.registerDocumentChangeListener();
    }

    protected loadSettings(): void {
        this.changesUntilAnalysis = SettingsManager.getComplexityChangesUntilAnalysis();
        this.minAnalysisIntervalMs = SettingsManager.getComplexityMinAnalysisIntervalMs();
        this.analysisGenerationAttempts = SettingsManager.getComplexityAnalysisGenerationAttempts();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPT METHODS
    // ─────────────────────────────────────────────────────────────────────────

    protected getAnalysisPrompt(): string {
        const ignoredIssuesSection = this.expectedIssues.length > 0
            ? `
## 📋 USER FEEDBACK - SPECIFIC ISSUES TO IGNORE

The user has given this feedback about acceptable issues:
${this.expectedIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

**Do NOT report issues matching the user's feedback.**
`
            : '';

        const categoryIgnoreSection = `
## EVALUATE USER INTENT FOR ENTIRE CATEGORIES

Before generating your response, carefully think about whether the user is expressing satisfaction with an entire category. They can express this in English or German:

**Abbreviations Category:**
- English: "abbreviations are fine", "all abbreviations ok", "abbreviations fine", "no abbreviation issues"
- German: "Abkürzungen sind ok", "keine Abkürzungen Probleme", "Abkürzungen fein"
- If indicated → DO NOT report any unexplained_abbreviation issues

**Complexity Peaks Category:**
- English: "complexity is fine", "complexity peaks ok", "all complexity fine"
- German: "Komplexität ist ok", "Komplexitätsspitzen sind fein"
- If indicated → DO NOT report any complexity_peak issues

**Knowledge Gaps Category:**
- English: "knowledge gaps are fine", "no knowledge gap issues", "all concepts explained"
- German: "Wissenslücken sind ok", "Konzepte sind erklärt"
- If indicated → DO NOT report any knowledge_gap issues

**Missing Context Category:**
- English: "context is clear", "no context issues", "all context fine"
- German: "Kontext ist klar", "Kontextprobleme sind ok"
- If indicated → DO NOT report any missing_context issues

**Unclear Transitions Category:**
- English: "transitions are smooth", "flow is good", "no transition issues", "connections are clear"
- German: "Übergänge sind klar", "Übergänge sind smooth", "Fluss ist gut"
- If indicated → DO NOT report any unclear_transitions issues

**Your task:** Use your natural language understanding to detect when the user is satisfied with a category and exclude it from your issues list accordingly. It's okay to be flexible - if the meaning is clear, apply it.

Only include issues from categories the user is NOT satisfied with.
`;

        return `You are analyzing lecture content for pedagogical clarity. Review the following lecture material and identify issues.

## What to Look For

1. **Unexplained Abbreviations**: Any acronym or abbreviation used without being defined first (e.g., "API", "REST", "OOP" used before explanation)

2. **Knowledge Gaps / Plot Holes**: Concepts that are referenced or used but never properly introduced or explained. For example:
   - Mentioning "the factory pattern" without explaining what it is
   - Using technical terms without context
   - Assuming prior knowledge that wasn't covered

3. **Complexity Peaks**: Sections where multiple new concepts are introduced too quickly without sufficient explanation or examples

4. **Missing Context**: References to things "we discussed earlier" that weren't actually covered, or logical jumps that skip steps

5. **Unclear Transitions**: Abrupt or confusing shifts between topics across slides. Look for:
   - Sudden topic changes without explaining the connection
   - Missing bridge concepts that connect one slide to the next
   - Jumps in logical flow that leave the learner confused about why they're now on a new topic
   
**IMPORTANT on Transitions:** Only report if transitions are genuinely confusing or missing. Smooth topic progression is expected. Not every transition needs explicit connection language. If the lecture flows reasonably from one topic to the next, do NOT report it. Explaining diffrent topics in succession is normal if the general theme is maintained.

**IMPORTANT**: 
1) A lecture is allowed to be complex if the topic is inherently complex. Focus on clarity and explanation rather than simplification. Not every detail needs to be explained, only those that would confuse a learner by being significantly complex. 
2) If an issue is more than one of the above types only name it once, using the most appropriate type.
3) **It is completely valid and correct to report NO issues.** Do not fabricate problems just to fill the issues array. Only report genuine problems that would genuinely confuse or mislead a learner.

YOU SEARCH PEAKS NOT SMALL MISSUNDERSTANDINGS.
${ignoredIssuesSection}${categoryIgnoreSection}

Only report NEW, GENUINE issues. If the content is clear and well-structured, or if user feedback suggests satisfaction with categories, return appropriate empty or filtered issues array.`;
    }

    protected getUserPrompt(): string {
        const slideContents = LectureFileHelper.getSlidesContent();
        return ([
            `Please analyze the following lecture content for complexity issues:`,
            `${slideContents.map((slideContent, index) => `Slide ${index + 1} Content: ${slideContent}`).join('\n\n')}`
        ]).join('\n');
    }
    // ──────────────────────────────────────────────────────────────────────── 
    // SCHEMA
    // ─────────────────────────────────────────────────────────────────────────

    protected getSchema(): z.ZodType<ComplexityAnalysisResult> {
        return z.object({
            issues: z.array(z.object({
                type: z.enum(['unexplained_abbreviation', 'knowledge_gap', 'complexity_peak', 'missing_context', 'unclear_transitions']),
                description: z.string(),
                suggestion: z.string(),
            })),
            overallComplexityScore: z.number().min(0).max(10),
            summary: z.string(),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FEEDBACK METHODS
    // ─────────────────────────────────────────────────────────────────────────

    private async getUserFeedbackOnIssues(): Promise<void> {
        const choice = await vscode.window.showInformationMessage('Successfully analysed complexity. Would you like to mark any issues as expected/ignored?', 'Yes', 'No');
        if (choice === 'Yes') {

            const issuesToIgnore = await vscode.window.showInputBox({
                prompt: `List issues to mark as expected/acceptable. Can indicate satisfaction with entire categories.`,
                placeHolder: 'e.g., "abbreviation API, all complexity peaks are fine, Abkürzungen sind ok"'
            });

            if (issuesToIgnore) {
                // Store raw feedback - AI will interpret the user's intent naturally
                const newIssues = issuesToIgnore.split(',').map(issue => issue.trim()).filter(issue => issue.length > 0);
                this.expectedIssues = Array.from(new Set(newIssues)); // Remove duplicates
                this.logger.log(`Updated ignored issues list: ${this.expectedIssues.join(', ')}`);
            }
        }
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
                'Complexity Analysis',
                this.getAnalysisPrompt(),
                this.getUserPrompt()
            );

            if (this.isAborted) { return; }
            this.logger.log(`Generation attempt result: ${JSON.stringify(result)}`);

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }
            if (!result) { return; } 

            const analysisResult = result.data as ComplexityAnalysisResult;
            // Step 4: Validate output
            const isValid = this.getSchema().safeParse(analysisResult).success;
            if (!isValid) {
                this.logger.warn(`Invalid output format received.`);
                this.provider.addUserMessage('The response format was invalid. Please adhere strictly to the specified JSON format.');
                continue;
            }

            // Step 5: Display results or stop if no issues. Only loops if generation needs to be retried.
            if (analysisResult.issues.length > 0) {
                const choice = await vscode.window.showInformationMessage(
                    `Complexity analysis found ${analysisResult.issues.length} issues. View details?
                     (Check output channel: LecturePilot Analysis)`,
                    'Yes', 'Not now'
                );
                if (choice === 'Yes') {
                    this.displayAnalysisResults(analysisResult);
                    await this.getUserFeedbackOnIssues();
                    return;
                } else {
                    return;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────
    private displayAnalysisResults(analysisResult: ComplexityAnalysisResult): void {
        // Step 5a: Display Analysis general info
        this.outputChannel.clear();
        this.outputChannel.appendLine('--- Lecture Complexity Analysis ---\n');
        this.outputChannel.appendLine(`Overall Complexity Score: ${analysisResult.overallComplexityScore}/10\n`);
        this.outputChannel.appendLine(`Summary:\n${analysisResult.summary}\n`);
        // Step 5a: List Detected Issues
        this.outputChannel.appendLine('Detected Issues:\n');
        analysisResult.issues.forEach((issue, index) => {
            this.outputChannel.appendLine(`${index + 1}. Type: ${issue.type}`);
            this.outputChannel.appendLine(`   Description: ${issue.description}`);
            this.outputChannel.appendLine(`   Suggestion: ${issue.suggestion}\n`);
        });
        this.outputChannel.show(true);
    }

}