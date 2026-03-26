import { DSLInstructions } from "./DSLInstructions";
import { ToolUsageInstructions } from "./ToolUsageInstructions";

/**
 * Default system prompts for chat-based LLMs.
 * Provides instructions for tool usage, DSL generation, and language settings.
 * Uses ReAct (Reasoning and Acting) pattern for structured agent behavior.
 * IMPROVEMENT NOTE: Consider loading prompts/templates from external files or methods for easier customization.
 */
export class GeneralInstructions {

    /**
     * Core identity prompt - primes the agent as a lecture content assistant.
     */
    public static getLectureHelperPrompt(): string {
        return `You are LecturePilot, an AI assistant helping professors create engaging lecture materials. You specialize in structured educational content with clear slides, presenter scripts, and quiz questions. Always be concise and pedagogically sound.`;
    }

    // current language used by the LLM instructions (default: English)
    private static currentLanguage: string = 'en';

    // Return available languages and human readable labels
    public static getAvailableLanguages(): { code: string; label: string }[] {
        return [
            { code: 'EN', label: 'English' },
            { code: 'DE', label: 'German' },
        ];
    }
    // Set the language used in system prompts for all LLMs
    public static setLanguage(lang: string) {
        GeneralInstructions.currentLanguage = lang || 'en';
    }

    public static getCurrentLanguage(): string {
        return GeneralInstructions.currentLanguage;
    }

    // Get the language instruction string for the current language
    public static getLanguagePrompt(): string {
        const languageMap: { [key: string]: string } = {
            'EN': 'CRITICAL YOU HAVE TO RESPOND IN ENGLISH. THE CONTENT YOU PROVIDE MUST BE IN ENGLISH.',
            'DE': 'CRITICAL YOU HAVE TO RESPOND IN GERMAN. THE CONTENT YOU PROVIDE MUST BE IN GERMAN.',
        };
        const currentLanguagePrompt = languageMap[GeneralInstructions.currentLanguage] || languageMap['EN'];
        return currentLanguagePrompt;
    }

    // Combine multiple prompt components into a single prompt
    public static combinePrompts(...components: string[]): string {
        return components.filter(c => c && c.trim()).join('\n\n');
    }

    public static getLectureEditingPrompt(): string {
        return this.combinePrompts(
            this.getLectureHelperPrompt(),
            ToolUsageInstructions.getToolUsageInstructions(),
            DSLInstructions.getDSLGenerationPrompt(),
            this.getLanguagePrompt()
        );
    }
}