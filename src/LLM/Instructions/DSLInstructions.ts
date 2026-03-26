import { DSLTags } from "../../Utils/DSLTags";

export class DSLInstructions {
    public static getDSLGenerationPrompt(): string {
        return `
# LECTURE SLIDE SYNTAX REFERENCE

You must generate lecture content adhering to the following strict DSL (Domain Specific Language) and Markdown format.

## 1. Structure Overview
Each lecture consists of multiple "Scenes" (Slides).
Each Scene MUST follow this exact order:
1.  **Separator**: \`${DSLTags.SLIDE_SEPARATOR}\` (Start of scene)
2.  **Scene Title**: \`${DSLTags.START_TAG} ${DSLTags.TITLE_TAG}="Title Here" ${DSLTags.END_TAG}\`
3.  **Slide Content**: \`${DSLTags.START_TAG} ${DSLTags.SLIDE_TAG} ${DSLTags.END_TAG}\` followed by Markdown content.
4.  **Teleprompter**: \`${DSLTags.START_TAG} ${DSLTags.TELEPROMPTER_TAG} ${DSLTags.END_TAG}\` followed by speaker script.
5.  **Quiz (Optional)**: \`${DSLTags.START_TAG} ${DSLTags.QUIZ_TAG} ${DSLTags.END_TAG}\` followed by question and answers in varying formats.
6.  **Buttons (Optional)**: \`${DSLTags.START_TAG} ${DSLTags.BUTTON_TAG} ... ${DSLTags.END_TAG}\`
There can be additional parameters in the tags. Dont add them unless specified.

## 2. Detailed Syntax Rules

### A. Scene Title
-   Format: \`${DSLTags.START_TAG} ${DSLTags.TITLE_TAG}="Your Title" ${DSLTags.END_TAG}\`
-   This defines the title of the slide.
-   **CONSTRAINT**: Do NOT add a Markdown title (e.g., \`# Title\`) inside the slide content. Use this tag instead.

### B. Slide Content
-   Start tag: \`${DSLTags.START_TAG} ${DSLTags.SLIDE_TAG} ${DSLTags.END_TAG}\`
-   Use standard Markdown (bullet points, code blocks, bold text).
-   Keep content concise (bullet points preferred over long text).

### C. Teleprompter (Speaker Notes)
-   Start tag: \`${DSLTags.START_TAG} ${DSLTags.TELEPROMPTER_TAG} ${DSLTags.END_TAG}\`
-   Write a natural, engaging script for the presenter. This does include talking about possible codes or images on the slide.
-   Take the previous and next slide into account for context and speech flow.
-   **CONSTRAINT**: Do NOT mention the quiz or say "Now we have a quiz".

### D. Quiz (Optional)
-   Start tag: \`${DSLTags.START_TAG} ${DSLTags.QUIZ_TAG} ${DSLTags.END_TAG}\`
-   Questions can vary in format, read the existing quiz questions and answers for inspiration and understanding of possible formats.

### E. Buttons (Optional)
-   Format: \`${DSLTags.START_TAG} ${DSLTags.BUTTON_TAG} text="Label" type="action" duration="start, end" ${DSLTags.END_TAG}\`
-   Only add if requested.

## 3. Negative Constraints (DO NOT DO THIS)
-   **DO NOT** omit the \`${DSLTags.SLIDE_SEPARATOR}\` between scenes.
-   **DO NOT** put content outside the defined tags.
-   **DO NOT** invent new tags.
`;
    }
}