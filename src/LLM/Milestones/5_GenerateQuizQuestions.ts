import z from "zod";
import { DSLRegExpressions, DSLTags } from "../../Utils/DSLTags";
import { LectureFileHelper } from "../../Utils/LectureFileHelper";
import { GeneralInstructions } from "../Instructions/GeneralInstructions";
import { ProviderRegistry } from "../Provider/ProviderRegistry";
import { BaseMilestone } from "./BaseMilestone";
import { QuizTypes, GeneratedQuizQuestion } from './QuizTypes';
import * as vscode from 'vscode';
import { BatchEditOperation, ToolExecutor } from "../Toolbox/ToolExecutor";
import { JSONResponse } from "../Provider/AbstractLLMProvider";

export class GenerateQuizQuestions extends BaseMilestone {
    private slideContents: string[] = []; // Store extracted slide contents
    private quizQuestions: GeneratedQuizQuestion[] = []; // Store generated quiz questions

    private numberOfQuestions: number = 0;
    private selectedTypes: string[] = []; // Store selected quiz types

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    constructor(providerRegistry: ProviderRegistry) {
        super('GenerateQuizQuestions', providerRegistry);
        this.registerCommand('generateQuizQuestions');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROMPTS & SCHEMA IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────
    protected getMilestonePrompt(): string {
        let milestonePrompt = `You are an expert educational content creator and learning assessment specialist with deep knowledge of pedagogical best practices.

## Your Goal
Analyze the provided lecture slides and create strategically placed quiz questions that maximize learning retention and engagement.

## Quiz Types Available
You will generate different quiz question types based on the schema provided:
${this.selectedTypes.map(type => `- ${type}`).join('\n')}

The User will be prompted to select from these formats, which he wants you to use for the questions.
Additonally, the User will specificy the number of questions to generate.
You will receive all slides content as input. Slides are separated by ${DSLTags.SLIDE_SEPARATOR}.

Choose the format that best fits each question's complexity and content from the user selection.
Atleast one question must be generated in each of the selected formats, if applicable. Other than that, you have full freedom to achieve the best learning outcome with the following placement strategy.

## Slide Numbering
The slides you receive are numbered sequentially starting from 0. When you set \`slideNumber\` in your output:
- Use the **exact slide number** shown in the input

## Strategic Placement Philosophy
Your quiz placement must follow evidence-based learning principles. 
**CRITICAL: Avoid the trap of only testing the immediately preceding slide.**

### The Spaced Retrieval Principle (HIGHEST PRIORITY)
Research shows that testing content AFTER a delay significantly improves long-term retention. You MUST:
- **Test earlier content later**: If a concept is introduced on Slide 2, consider testing it on Slide 5, 6, or even later
- **At least 40% of questions should test content from 2+ slides back**
- **Cumulative synthesis questions are extremely valuable** — ask questions that require combining knowledge from slides 1, 3, and 5 together

### Question Types by Scope
Distribute your questions across these categories:

1. **Immediate Questions (MAX 30%)**: Test the current slide only. Use sparingly.
2. **Delayed Recall Questions (MIN 40%)**: Test content from 2-5 slides earlier. These are pedagogically superior.
3. **Synthesis Questions (MIN 30%)**: Require combining knowledge from multiple slides. Example: "Based on what you learned about X (Slide 2) and Y (Slide 4), which approach would work best for Z?"

### Clustering Strategy
- **Group 2-4 questions after major concept blocks** (every 3-5 slides)
- A cluster can mix: 1 immediate + 2 delayed recall + 1 synthesis
- This is MORE effective than scattering single questions after each slide

### Anti-Patterns to AVOID
❌ Asking about Slide 3 content immediately after Slide 3
❌ Every question only referencing one slide
❌ Sequential pattern: Slide 1 → Q about Slide 1, Slide 2 → Q about Slide 2...
❌ Never looking back at earlier content
❌ Never place a question on the first slide (Slide 0) or ask about the learning content on the first slide

### Good Patterns to FOLLOW
✓ Slide 5 has a question about Slide 2 content
✓ Question after Slide 6 asks: "How does [Slide 2 concept] relate to [Slide 5 concept]?"
✓ Cluster of 3 questions after Slide 7 testing Slides 3, 5, and 6
✓ A question that can only be answered by remembering content from multiple earlier slides

### Timing Considerations
- **After-summary testing**: After summary slides, test key takeaways (Second to last slide is often ideal)
- **Delay is your friend**: The gap between learning and testing improves retention

## Question Quality Standards
- **Clarity**: Questions must be unambiguous and precisely worded
- **Relevance**: Each question must directly assess content from the slides
- **Difficulty progression**: Should be challenging with an average student scoring around 50%.
- **Language consistency**: Match the language of the slides (German content → German questions)
- **No trick questions**: Focus on genuine understanding, not gotcha moments
- **Plausible distractors**: Wrong options should be believable but clearly incorrect upon reflection

## Code-Based Questions (Software Engineering Topics)
When slides contain **code examples, algorithms, or programming concepts**, you MUST include questions that test code understanding:
- **Code output prediction**: "What will this code snippet output?"
- **Bug identification**: "Which line contains the error?" or "What's wrong with this implementation?"
- **Code completion**: "Which statement correctly completes this function?"
- **Concept application**: "Which design pattern is demonstrated in the following code?"
- **Syntax understanding**: "What does this operator/keyword do in this context?"
- **Algorithm tracing**: "After executing line 3, what is the value of variable X?"
- **Create short code snippets**: You can also create short code snippets based on the concepts in the slides to test application skills.

Code questions are **highly valuable** for software engineering lectures — do NOT skip code examples when generating questions.
- **No Repetition**: Avoid repeating questions that assess the same concept

## IMPORTANT:
IF THE USER GIVES FEEDBACK, STARTING IN THE USER PROMPT WITH 'FEEDBACK:' IT TAKES HIGHEST PRIORITY.
You MUST adjust your output based on this feedback.
If the feedback indicates that something was wrong with the previous output, you MUST fix it in the new output.
If the feedback indicates that something was good, you MUST keep it in the new output.`;

        return GeneralInstructions.combinePrompts(
            milestonePrompt,
            GeneralInstructions.getLanguagePrompt()
        );
    }

    protected async getUserPrompt(): Promise<string | null> {
        // Prompt user to select quiz types
        this.selectedTypes = await vscode.window.showQuickPick(QuizTypes.getAllQuizTypes(), {
            canPickMany: true,
            placeHolder: 'Select the quiz question types to generate'
        }) || [];
        // Check if any types were selected
        if (!this.selectedTypes || this.selectedTypes.length === 0) {
            vscode.window.showErrorMessage('No quiz question types selected. Aborting quiz generation.');
            return null;
        }
        // Prompt user to enter number of questions
        let numberOfQuestionsInput = await vscode.window.showInputBox({
            prompt: 'Enter the total number of quiz questions to generate',
            validateInput: (value) => {
                const parsed = parseInt(value, 10);
                if (isNaN(parsed) || parsed <= 0) {
                    return `Please enter a valid positive number.`;
                }
                return null;
            }
        });
        // Check if input was provided
        if (!numberOfQuestionsInput) {
            vscode.window.showErrorMessage('No number of questions provided. Aborting quiz generation.');
            return null;
        }
        // Parse the number of questions
        this.numberOfQuestions = parseInt(numberOfQuestionsInput, 10);
        this.slideContents = LectureFileHelper.getSlidesContent();

        return `Generate quiz questions based on the following slide contents:
${this.slideContents.map((content, index) => `Slide ${index}:\n${content}`).join(`\n ${DSLTags.SLIDE_SEPARATOR} \n`)}

Please create a total of ${this.numberOfQuestions} quiz questions using the following formats: ${this.selectedTypes.join(', ')}.

Ensure each question adheres to the quality standards and placement strategies outlined in the system prompt.`;
    }

    // Define the schema for the quiz questions
    protected getSchema(): z.ZodObject<any> {
        return QuizTypes.getQuizSchema(this.selectedTypes);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & GENERATION IMPLEMENTATION
    // ─────────────────────────────────────────────────────────────────────────

    protected validateGeneratedOutput(quizQuestions: any[]): boolean {
        if (quizQuestions.length === this.numberOfQuestions) {
            return true;
        }
        const errorMsg = `The number of generated quiz questions (${quizQuestions.length}) does not match the requested number (${this.numberOfQuestions}).`;
        vscode.window.showErrorMessage(errorMsg + " Retrying generation...");
        this.provider.addUserMessage(errorMsg + " Please regenerate the quiz questions ensuring the count matches the requested number.");
        return false;
    }

    private async createQuizContent(): Promise<{ accepted: boolean; feedback?: string; aborted?: boolean }> {
        let batchEditOperations: BatchEditOperation[] = [];
        const explanation = `Added quiz questions based on generated output.`;
        const quizInsertionLines = LectureFileHelper.getLinenumberOfRegex(DSLRegExpressions.QUIZ_REGEX);

        this.quizQuestions.forEach((question) => {
            batchEditOperations.push({
                type: 'add_lines_at_position',
                afterLine: quizInsertionLines[question.slideNumber],
                newContent: QuizTypes.formatQuestion(question),
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

            const result: JSONResponse = await this.generateLLMResponse(
                "Generating quiz questions..."
            );

            const genStatus = this.handleGenerationResult(result);
            if (genStatus.abort) { return; }
            if (genStatus.retry) { continue; }

            // Store and validate generated questions
            this.quizQuestions = result.data.questions as GeneratedQuizQuestion[];
            const isValid = this.validateGeneratedOutput(this.quizQuestions);
            if (!isValid) {
                vscode.window.showWarningMessage("Created invalid output. Retrying...");
                continue;
            }

            const feedbackReceived = await this.handlePreviewResult(
                this.createQuizContent(),
                attempts
            );

            if (!feedbackReceived) {
                return;
            }
        }
        vscode.window.showErrorMessage(`Failed to generate satisfactory quiz questions after ${this.maxAttempts} attempts.`);
    }
}