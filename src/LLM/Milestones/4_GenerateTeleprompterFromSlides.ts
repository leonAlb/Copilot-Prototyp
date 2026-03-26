import * as vscode from 'vscode';
import z from "zod";
import { ProviderRegistry } from "../Provider/ProviderRegistry";
import { BaseMilestone } from "./BaseMilestone";
import { JSONResponse } from "../Provider/AbstractLLMProvider";
import { BatchEditOperation, ToolExecutor } from "../Toolbox/ToolExecutor";
import { DSLRegExpressions } from "../../Utils/DSLTags";
import { LectureFileHelper } from "../../Utils/LectureFileHelper";
import { GeneralInstructions } from "../Instructions/GeneralInstructions";

export class GenerateTeleprompterFromSlides extends BaseMilestone {
    private slideContents: string[] = []; // Store extracted slide contents
    private teleprompterScripts: string[] = []; // Store generated teleprompter scripts

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry) {
        super('GenerateTeleprompterFromSlides', providerRegistry);
        this.registerCommand('generateTeleprompterFromSlides');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPTS & SCHEMA IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────
    protected getMilestonePrompt(): string {
        let milestonePrompt = `You are an expert teleprompter script writer creating a cohesive lecture narrative.

        ## Your Goal
        Create teleprompter scripts that form ONE CONTINUOUS LECTURE, not separate isolated segments.
        
        Think of this as writing a single flowing speech that happens to be divided by slides — the audience should never feel a jarring break between topics.

        ## Writing Guidelines
        - **Transitions are key**: End each script with a natural lead-in to the next topic. Use phrases like "Now that we understand X, let's see how it connects to...", "Building on this idea...", "This brings us to..."
        - **Maintain narrative thread**: Reference previous concepts naturally ("As we saw earlier...", "Remember when we discussed...")
        - **Conversational tone**: Write as if speaking to students directly, not reading a textbook
        - **Explain, don't recite**: If slides contain code or examples, explain the "why" and walk through them step by step
        - **Match the slide's language**: German slides get German scripts, English slides get English scripts

        ## What to Avoid
        - Starting each script from scratch as if it's a new topic
        - Abrupt endings that feel like a hard stop
        - Including slide titles in the spoken text
        - Overly complex sentences that are hard to read aloud
        - Robotic or formal academic language

        ## Input
        A list of slide contents in order.`;
        return GeneralInstructions.combinePrompts(
            milestonePrompt,
            GeneralInstructions.getLanguagePrompt()
        );
    }

    protected async getUserPrompt(): Promise<string> {
        this.slideContents = LectureFileHelper.getSlidesContent();
        this.logger.log(`Extracted ${this.slideContents.length} slides for teleprompter generation.`);
        return `
Generate teleprompter scripts for the following slide contents, ensuring a smooth, continuous lecture flow:
Slide Contents:
${this.slideContents.map((content, index) => `Slide ${index + 1}:\n${content}`).join('\n\n')}`;
    }

    // Define the schema for the lecture outline
    protected getSchema(): z.ZodObject<any> {
        return z.object({
            scripts: z.array(
                z.string().describe("A cohesive teleprompter script that flows naturally into the next slide's topic.")
            ).describe("An array of teleprompter scripts corresponding to each slide. Every component must contribute to a single continuous lecture narrative."),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & GENERATION IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    protected validateGeneratedOutput(teleprompterScripts: string[]): boolean {
        if(teleprompterScripts.length === this.slideContents.length) {
            return true;
        }
        const errorMsg = `The number of generated teleprompter scripts (${teleprompterScripts.length}) does not match the number of slides (${this.slideContents.length}).`;
        vscode.window.showErrorMessage(errorMsg + " Retrying generation...");
        this.provider.addUserMessage(errorMsg + " Please regenerate the teleprompter scripts ensuring the count matches the slides.");
        return false;
    }

    private async createTeleprompterContent(): Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }> {
        let batchEditOperations: BatchEditOperation[] = [];
        const explanation = `Added teleprompter content based on generated output.`;
        const teleprompterLines = LectureFileHelper.getLinenumberOfRegex(DSLRegExpressions.TELEPROMPTER_REGEX);

        teleprompterLines.forEach((teleprompterLine, index) => {
            batchEditOperations.push({
                type: 'add_lines_at_position',
                afterLine: teleprompterLine,
                newContent: this.teleprompterScripts[index],
            });
        });

        // Prepare arguments for the batch edit tool
        const args = { edits: batchEditOperations, explanation: explanation };

        // Execute the batch edit tool
        let result = await ToolExecutor.executeTool(
            'apply_batch_edits',
            args
        );

        return this.handleToolResult(result);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN EXECUTION METHOD
    // ─────────────────────────────────────────────────────────────────────────

    public async executeMilestone(): Promise<void> {
        const isAvailable = await this.prepareUserPrompt();
        if (!isAvailable) { return; }

        let attempts = 0;
        while (attempts < this.maxAttempts) {
            attempts++;
            // Generate structured output
            const result: JSONResponse = await this.generateLLMResponse(
                "Generating teleprompter scripts..."
            );

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }

            this.teleprompterScripts = result.data.scripts;

            // Validate generated teleprompter scripts
            const isValid = this.validateGeneratedOutput(this.teleprompterScripts);
            if (!isValid) {
                continue;
            }

            // Handle rejection/feedback or abortion
            const feedbackReceived = await this.handlePreviewResult(
                this.createTeleprompterContent(),
                attempts
            );

            if (!feedbackReceived) {
                return;
            }
        }
        vscode.window.showErrorMessage(`Failed to generate satisfactory teleprompter scripts after ${this.maxAttempts} attempts.`);
    }
}