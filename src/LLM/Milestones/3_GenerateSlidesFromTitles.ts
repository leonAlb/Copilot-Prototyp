import { BaseMilestone } from "./BaseMilestone";
import { ProviderRegistry } from "../Provider/ProviderRegistry";
import z from "zod";
import * as vscode from 'vscode';
import { BatchEditOperation, ToolExecutor } from "../Toolbox/ToolExecutor";
import { JSONResponse } from "../Provider/AbstractLLMProvider";
import { LectureFileHelper, RegexMatchTag } from '../../Utils/LectureFileHelper';
import { DSLRegExpressions } from "../../Utils/DSLTags";
import { GeneralInstructions } from "../Instructions/GeneralInstructions";
import { FormattingInstructions } from "../Instructions/FormattingInstructions";

export class GenerateSlidesFromTitles extends BaseMilestone {
    private slideTitles: RegexMatchTag[] = []; // Store extracted slide titles
    private slideContent: string[] = []; // Store generated slide content

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry) {
        super('GenerateContentFromTitles', providerRegistry);
        this.registerCommand('generateContentFromtTitles');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPTS & SCHEMA IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    protected getMilestonePrompt(): string {
        let milestonePrompt = `You are an expert lecture content generator. Always produce slides in this order: (1) Goals of this unit (you author the goals), (2) one slide per provided title in the given order, and (3) a Summary slide that synthesizes the generated content and states how the goals were addressed.
        
        ## Your Goal
        - Derive clear, measurable goals on the "Goals of this unit" slide using the full lecture context and the provided titles.
        - For each provided title, write a concise paragraph or bullet points that directly advance the goals you set; keep tone and style consistent and presentation-ready.
        - Include practical examples or code snippets when the topic is software-related; format any code for readability.
        - End with a "Summary" slide that synthesizes the generated content and states how the goals were addressed.
        - Titles can be in German or English; match the language and tone of each title in the corresponding slide content.
        
        ## Input
        - A list of slide titles (excluding the fixed "Goals of this unit" and "Summary" titles).
        
        ## Output Format
        Return an array of objects, each with:
        - "title": Echo the slide title exactly as provided (we use this for validation)
        - "content": The body content ONLY (no headings, no title repetition)
        
        The content field must:
        - Start directly with explanatory text, bullet points, or code
        - NOT begin with a markdown heading (# or ##)
        - NOT repeat the title text at the start. Do NOT start with a generic introductory sentence echoing the title.
        - Be formatted in markdown, including code blocks where appropriate
        `;
        
        return GeneralInstructions.combinePrompts(
            milestonePrompt,
            FormattingInstructions.getFormattingInstructions(),
            GeneralInstructions.getLanguagePrompt(),
        );
    }

    // Creates the user prompt without the fixed titles mentioned in the system prompt
    protected async getUserPrompt(): Promise<string> {
        this.slideTitles = LectureFileHelper.getSlideTitles(); // We use all titles and line numbers later in create slide content
        const slicedTitles = this.slideTitles.slice(1, -2); // Remove first two and last two entries since they are fixed titles

        return `Please generate content for the following slide titles: ${slicedTitles.map(title => title.title).join(", ")}
        Do not include the title itself in your generation`;
    }

    // The extra title is not necessary but helps preventing the LLM from adding titles to the content
    protected getSchema(): z.ZodObject<any> {
        return z.object({
            slides: z.array(
                z.object({
                    title: z.string().describe("The slide title (echoed from input for validation)"),
                    content: z.string().describe("The body content for this slide. Markdown-formatted text starting directly with explanatory content (paragraphs, bullet points, code blocks). Do NOT include the title as a heading. Do NOT start with a sentence echoing the title."),
                })
            ).describe("An array of slide objects.")
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & CREATION IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    protected validateGeneratedOutput(slides: Array<{ title: string, content: string }>): { valid: boolean; reason: string } {
        const expectedCount = this.slideTitles.length;
        if (slides.length !== expectedCount) {
            this.provider.addUserMessage(`The number of generated slides (${slides.length}) does not match the expected count (${expectedCount}). Please ensure you provide content for "Goals of this unit", each of the provided titles, and "Summary".`);
            return {
                valid: false,
                reason: `Expected ${expectedCount} slides, but got ${slides.length}.`,
            };
        }
        return { valid: true, reason: "" };
    }

    private async createSlideContent(): Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }> {
        // Create Batch Edit Operations to add slide content
        let batchEditOperations: BatchEditOperation[] = [];
        const explanation = `Added slide content based on generated output.`;
        // Exclude last slide line number for references
        const slideLineNumbers = LectureFileHelper.getLinenumberOfRegex(DSLRegExpressions.SLIDE_REGEX).slice(0, -1); 
        slideLineNumbers.forEach((slideLineNumber, index) => {
            batchEditOperations.push({
                type: 'add_lines_at_position',
                afterLine: slideLineNumber,
                newContent: this.slideContent[index],
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
                "Generating slide content..."
            );

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }

            const slides: Array<{ title: string, content: string }> = result.data.slides;
            this.slideContent = slides.map(slide => slide.content);

            // Validate generated slide contents
            const isValid = this.validateGeneratedOutput(slides);
            if (!isValid) {
                continue;
            }

            // Handle rejection/feedback or abortion
            const feedbackReceived = await this.handlePreviewResult(
                this.createSlideContent(),
                attempts
            );

            if (!feedbackReceived) {
                return;
            }
        }
        vscode.window.showErrorMessage(`Failed to generate satisfactory slide content after ${this.maxAttempts} attempts.`);
    }
}