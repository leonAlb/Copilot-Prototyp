import { SettingsManager } from '../../ExtensionManager/SettingsManager';
import { DSLTags } from '../../Utils/DSLTags';
export class FormattingInstructions {

    // ─────────────────────────────────────────────────────────────────────────
    // FORMATTING INSTRUCTIONS METHOD
    // ─────────────────────────────────────────────────────────────────────────

    // This method should be used for milestones, since its output doesnt need the extra context of chat formatting
    public static getFormattingInstructions(): string {
        const maxChars = SettingsManager.getMaxNumberOfCharsInLine();
        return `## Format Instructions:
- Every line must be ≤${maxChars} characters. Including spaces, punctuation and general Markdown syntax.`;
    }

    // This method should be used for chat-based interactions, where formatting instructions can't be applied globally
    public static getFormattingInstructionsForChat(): string {
        const maxChars = SettingsManager.getMaxNumberOfCharsInLine();
        return `Please format your active file input for ${DSLTags.START_TAG}${DSLTags.SLIDE_TAG}${DSLTags.END_TAG} content according to the following rules:
1. Every line must be ≤${maxChars} characters. Including spaces, punctuation and general Markdown syntax..
2. Break down complex information into clear, concise bullet points rather than lengthy sentences.
3. Use proper indentation and spacing to enhance readability.


${DSLTags.QUIZ_TAG}, ${DSLTags.TELEPROMPTER_TAG}, and ${DSLTags.BUTTON_TAG} content should remain unaffected by these formatting rules.`;
    }
}