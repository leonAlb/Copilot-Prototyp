import { BaseMilestone } from "./BaseMilestone";
import * as vscode from 'vscode';
import { z } from 'zod';
import { DSLRegExpressions } from "../../Utils/DSLTags";
import { ToolExecutor } from "../Toolbox/ToolExecutor";
import { JSONResponse } from "../Provider/AbstractLLMProvider";
import { ProviderRegistry } from "../Provider/ProviderRegistry";
import { LectureFileHelper } from "../../Utils/LectureFileHelper";
import { GeneralInstructions } from "../Instructions/GeneralInstructions";

interface LiteratureSuggestion {
    literatureName: string;
    literatureLink: string;
    literatureSummary: string;
}

export class BrainstormLiterature extends BaseMilestone {
    // Configuration parameters
    private literatureSuggestionsCount = 5; // Number of literature sources to suggest during brainstorming

    private literatureSuggestions: LiteratureSuggestion[] = []; // Store generated literature suggestions

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry) {
        super('BrainstormLiterature', providerRegistry);
        this.registerCommand('brainstormLiterature');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPTS & SCHEMA IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────
    // System prompt defining the milestone task
    protected getMilestonePrompt(): string {
        let milestonePrompt = `You are a literature research assistant helping a university professor build their lecture.

        ## Your Goal
        Suggest literature that would serve as excellent **foundational resources** for constructing lecture content.

        ## Selection Criteria
        1. **Textbooks**: Prioritize comprehensive textbooks that a professor could use as a primary reference to structure their entire lecture. The book should cover the topic systematically and in sufficient depth to serve as the backbone of the course material.
        2. **Research Papers/Articles**: Include at least one paper or article that excels at explaining a specific concept or aspect of the lecture topic. This should be something a professor could reference to deepen their understanding or provide students with additional reading on a particular subtopic.
        3. **Practical Resources**: Consider resources (websites, tutorials, documentation) that demonstrate real-world applications of the lecture concepts.
        4. **Availability**: Prefer sources that are easily accessible to students, such as open-access materials or widely available textbooks.

        **IMPORTANT**: TAKE YOUR TIME TO VALIDATE EACH SITE AND LINK YOU PROVIDE. MAKE SURE THEY ARE FUNCTIONAL AND LEAD TO THE CORRECT RESOURCE. AN ERROR 404 OR BROKEN LINK IS UNACCEPTABLE.

        ## Output Requirements
        - Suggest atleast ${this.literatureSuggestionsCount} sources
        - Literature may be in English or German
        - Output ONLY the JSON structure, no explanations
        - **IF WEBSEARCH IS ENABLED**: Use web search to find current, verified literature sources
        - **CRITICAL**: Verify that all links are functional and lead to the correct source`;

        return GeneralInstructions.combinePrompts(
            milestonePrompt,
            GeneralInstructions.getLanguagePrompt()
        );
    }

    // Extract lecture topic from active editor and formulate user prompt
    protected async getUserPrompt(): Promise<string | null> {

        const slideTitles: string[] = LectureFileHelper.getSlideTitles().map(slide => slide.title);
        slideTitles.slice(1, -2); // Remove first two and last two entries

        if (slideTitles.length === 0) {
            vscode.window.showErrorMessage('No slide titles found in the active editor. Please ensure the document is correctly formatted with slide titles.');
            return null;
        }

        return `The lecture covers the following topics:\n- ${slideTitles.join('\n- ')}\n\nBased on these topics, suggest literature sources that would help in constructing the lecture content.`;

    }

    protected getSchema(): z.ZodObject<any> {
        return z.object({
            literatureSuggestions: z.array(
                z.object({
                    literatureName: z.string().describe("The title of the literature."),
                    literatureLink: z.string().describe("A URL link to the literature."),
                    literatureSummary: z.string().describe("A brief summary of the literature. Maximum 3-5 sentences."),

                })
            ).min(this.literatureSuggestionsCount, `At least ${this.literatureSuggestionsCount} literature suggestions are required.`),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & CREATION IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    protected validateGeneratedOutput(output: LiteratureSuggestion[]): { valid: boolean, reason: string } | boolean {
        let reason = '';
        // Validate that at least a specific number of suggestions are provided
        if (output.length < this.literatureSuggestionsCount) {
            reason = `Only ${output.length} suggestions provided, but at least ${this.literatureSuggestionsCount} are required.`;
        }
        this.provider.addUserMessage(`ERROR: ${reason}. Please provide complete and sufficient suggestions as per the requirements.`);
        return reason === '' ? true : false;
    }

    private async createReferences(suggestions: LiteratureSuggestion[]): Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }> {
        // Prepare reference text for insertion
        let referenceText = `Here are the literature suggestions:\n\n`;

        suggestions.forEach((suggestion, index) => {
            referenceText += `### ${index + 1}. ${suggestion.literatureName}\n\n`;
            referenceText += `**Link:** ${suggestion.literatureLink}\n\n`;
            referenceText += `**Summary:** ${suggestion.literatureSummary}\n\n`;
        });

        // Check for active editor, if none is present create a new untitled document
        let document: vscode.TextDocument;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            document = activeEditor.document;
        } else {
            document = await vscode.workspace.openTextDocument({ content: '', language: 'markdown' });
            await vscode.window.showTextDocument(document);
            vscode.window.showInformationMessage('No active editor found. Created a new untitled document for inserting literature suggestions.');
        }
        const text = document.getText();
        const originalRegex = DSLRegExpressions.SLIDE_REGEX;
        const globalRegex = new RegExp(originalRegex.source, originalRegex.flags + 'g');
        const lastMatch = [...text.matchAll(globalRegex)].at(-1);
        const lastSlideTagLine = lastMatch
            ? text.substring(0, lastMatch.index + lastMatch[0].length).split('\n').length
            : 0;

        let result = await ToolExecutor.executeTool(
            'add_lines_at_position',
            {
                afterLine: lastSlideTagLine,
                newContent: referenceText,
                explanation: 'Inserting brainstormed literature suggestions at the end of the document.'
            });

        return this.handleToolResult(result);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN EXECUTION METHOD
    // ─────────────────────────────────────────────────────────────────────────

    public async executeMilestone(): Promise<void> {
        const isAvailable = await this.prepareUserPrompt();
        if (!isAvailable) { return; }

        let webSearch = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            {
                placeHolder: 'Enable web search to find current literature sources? (Recommended)'
            }
        ) === 'Yes';

        // Generate with feedback loop
        let attempts = 0;
        while (attempts < this.maxAttempts) {
            attempts++;

            // Generate structured output
            const result: JSONResponse = await this.generateLLMResponse(
                "Brainstorming literature...",
                webSearch
            );

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }

            // Validate generated literature suggestions
            this.literatureSuggestions = result.data.literatureSuggestions;
            const isValid = this.validateGeneratedOutput(this.literatureSuggestions);
            if (!isValid) {
                vscode.window.showWarningMessage("Created invalid output. Retrying");
                continue;
            }

            // Handle rejection/feedback or abortion
            const feedbackReceived = await this.handlePreviewResult(
                this.createReferences(this.literatureSuggestions),
                attempts
            );

            if (!feedbackReceived) {
                return;
            }
        }
        vscode.window.showErrorMessage(`Failed to generate satisfactory outline after ${this.maxAttempts} attempts.`);
    }
}