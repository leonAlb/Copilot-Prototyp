import { z } from "zod";
import * as vscode from 'vscode';
import { DSLTags } from '../../Utils/DSLTags';
import { BaseMilestone } from "./BaseMilestone";
import { GeneralInstructions } from '../Instructions/GeneralInstructions';
import type { JSONResponse } from '../Provider/AbstractLLMProvider';
import { ProviderRegistry } from "../Provider/ProviderRegistry";
import { ToolExecutor } from "../Toolbox/ToolExecutor";

export class InitializeLecture extends BaseMilestone {

    private titles: string[] = []; // Store generated titles
    private slideCount: number = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────
    constructor(providerRegistry: ProviderRegistry) {
        super('InitializeLecture', providerRegistry);
        this.registerCommand('initializeLecture');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPTS & SCHEMA IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    // Get the initialization prompt for generating lecture outlines
    protected getMilestonePrompt(): string {
        let milestonePrompt = `You are a lecture outline generator. Output ONLY the JSON structure, no explanations.

RULES:
1. Output exactly N titles where N is the requested slide count. Not N+1, not N-1, exactly N.
2. First title: Learning goals ("Goals of this Unit" / "Lernziele")
3. Second-to-last title: Summary ("Summary" / "Zusammenfassung")
4. Last title: References ("References" / "Literatur")
5. Use only ONE language variant based on the user's language preference.

STRICT FORMATTING RULES:
- Do NOT include "Scene X", "Slide X", "Part X" or numbers in the titles.
- Titles should be just the topic name.
- BAD: "Scene 1: Introduction", "1. Introduction"
- GOOD: "Introduction"

COUNTING EXAMPLE:
If user requests 5 slides, output exactly 5 titles:
Example, not actual output:
["Goals of this Unit", "Topic A", "Topic B", "Summary", "References"]

COMMON MISTAKE TO AVOID:
Do NOT add extra slides. If asked for 10 slides, the array must have length 10, not 11.`;

        return GeneralInstructions.combinePrompts(
            milestonePrompt,
            GeneralInstructions.getLanguagePrompt()
        );
    }

    // Get user prompt for lecture topic and number of slides
    protected async getUserPrompt(): Promise<string | null> {

        const userInput = await vscode.window.showInputBox({
            prompt: 'What should the lecture be about? (Amount of slides will be asked next)',
            placeHolder: 'E.g., "This lecture covers the basics of machine learning."'
        });

        const amountOfSlides = await vscode.window.showInputBox({
            prompt: 'How many slides should the lecture have?',
            placeHolder: 'E.g., "10"'
        });

        if (!userInput || !amountOfSlides) {
            vscode.window.showErrorMessage('Lecture initialization cancelled. Summary and amount of slides are required.');
            return null;
        }
        if (Number.isNaN(parseInt(amountOfSlides))) {
            vscode.window.showErrorMessage('Please enter a valid number for the amount of slides.');
            return null;
        }

        this.slideCount = parseInt(amountOfSlides);
        const userPrompt = [
            `Topic: ${userInput.charAt(0).toUpperCase() + userInput.slice(1)} `,
            `Required slides: EXACTLY ${this.slideCount} (array length must be ${this.slideCount})`
        ].join('\n');

        return userPrompt;
    }

    // Define the schema for the lecture outline
    protected getSchema(): z.ZodObject<any> {
        return z.object({
            title: z.array(
                z.string().describe("A concise and descriptive name for a title in the lecture outline")
            ).describe("An array of concise and descriptive titles for the lecture outline")
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & GENERATION IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    protected validateGeneratedOutput(titles: string[], expectedSlides: number): boolean {

        let isValid = titles.length === expectedSlides;

        if (!isValid) {
            this.provider.addUserMessage(`ERROR: You generated ${this.titles.length} slides. I need EXACTLY ${this.slideCount}.
                         ${this.titles.length > this.slideCount
                    ? `Remove ${this.titles.length - this.slideCount} slide(s).`
                    : `Add ${this.slideCount - this.titles.length} slide(s).`} The array length must be ${this.slideCount}.`);
        }
        return isValid;
    }

    // Generate outline and handle user preview/acceptance
    private async createOutline(titles: string[]): Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor.');
            return { accepted: false, aborted: true };
        }

        const outline = this.formatOutlineAsDSL(titles);

        let result = await ToolExecutor.executeTool(
            'add_lines_at_position',
            {
                afterLine: 0,
                newContent: outline,
                explanation: 'Initialized lecture outline with generated titles.'
            }
        );
        return this.handleToolResult(result);
    }

    private formatOutlineAsDSL(titles: string[]): string {
        // Frontmatter for initializing lecture
        let outline = DSLTags.HEADER_FRONTMATTER;

        // Build outline (Leave spaces for readability)
        const titlesWithStartEndTag = titles.map((name) => {
            return this.createSlideLayout(name);
        }).join(`\n${DSLTags.SLIDE_SEPARATOR}`);

        outline += titlesWithStartEndTag;
        outline += `\n${DSLTags.SLIDE_SEPARATOR}`;

        return outline;
    }

    private createSlideLayout(name: string): string {
        return [
            ``,
            `${DSLTags.START_TAG}${DSLTags.TITLE_TAG}="${name}"${DSLTags.END_TAG}`,
            `${DSLTags.START_TAG}${DSLTags.SLIDE_TAG}${DSLTags.END_TAG}\n\n`,
            `${DSLTags.START_TAG}${DSLTags.TELEPROMPTER_TAG}${DSLTags.END_TAG}\n\n`,
            `${DSLTags.START_TAG}${DSLTags.QUIZ_TAG}${DSLTags.END_TAG}\n\n`,
        ].join('\n');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // MAIN EXECUTION METHOD
    // ─────────────────────────────────────────────────────────────────────────
    public async executeMilestone(): Promise<void> {
        const isAvailable = await this.prepareUserPrompt();
        if (!isAvailable) { return; }

        // Generate with feedback loop
        let attempts = 0;
        while (attempts < this.maxAttempts) {
            attempts++;

            // Generate structured output
            const result: JSONResponse = await this.generateLLMResponse(
                "Generating lecture outline..."
            );

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }

            // Validate generated titles
            this.titles = result.data.title;
            const isValid = this.validateGeneratedOutput(this.titles, this.slideCount);
            if (!isValid) {
                vscode.window.showWarningMessage("Created invalid output. Retrying");
                continue;
            }


            // Handle rejection/feedback or abortion
            const feedbackReceived = await this.handlePreviewResult(
                this.createOutline(this.titles),
                attempts
            );

            if (!feedbackReceived) {
                return;
            }
        }
        vscode.window.showErrorMessage(`Failed to generate satisfactory outline after ${this.maxAttempts} attempts.`);
    }
}