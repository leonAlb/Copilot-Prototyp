import z from "zod";
import { DSLTags } from "../../Utils/DSLTags";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

// Schema and description for a single field in a question type.
interface FieldDefinition {
    schema: z.ZodType;
    description: string;
}

interface QuestionTypeConfig {
    typeName: string;
    fields: Record<string, FieldDefinition>;
    // Converts a question object of this type into a formatted string for document insertion.
    format: (question: Record<string, any>) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION TYPE REGISTRY
// Add new question types here. Each entry is fully self-contained.
// ─────────────────────────────────────────────────────────────────────────────

const QUESTION_TYPES: QuestionTypeConfig[] = [
    {
        typeName: "Multiple Choice",
        fields: {
            options: {
                schema: z.array(z.string()),
                description: "An array of answer options for the question. DO NOT LABEL the options as 'A)', 'B)', '1)', '2)', etc. Just provide the raw option texts.",
            },
            correctOptionIndices: {
                schema: z.array(z.number()),
                description: "Array of indices of all correct options (e.g., [0, 2] if options 0 and 2 are correct).",
            },
        },
        format: (q) => {
            const correct = q.correctOptionIndices ?? [];
            const opts = (q.options ?? []).map((opt: string, i: number) =>
                `- ${opt} ${correct.includes(i) ? DSLTags.TRUE_ANSWER : DSLTags.FALSE_ANSWER}`
            ).join('\n');
            return `## ${q.question}\n${opts}`;
        },
    },
    {
        typeName: "Single Choice",
        fields: {
            options: {
                schema: z.array(z.string()),
                description: "An array of answer options for the question. DO NOT LABEL the options as 'A)', 'B)', '1)', '2)', etc. Just provide the raw option texts.",
            },
            correctOptionIndex: {
                schema: z.number(),
                description: "Index of the single correct option (e.g., 2 if option 2 is correct).",
            },
        },
        format: (q) => {
            const correct = q.correctOptionIndex ?? -1;
            const opts = (q.options ?? []).map((opt: string, i: number) =>
                `- ${opt} ${correct === i ? DSLTags.TRUE_ANSWER : DSLTags.FALSE_ANSWER}`
            ).join('\n');
            return `## ${q.question}\n${opts}`;
        },
    },
    {
        typeName: "True/False",
        fields: {
            correctAnswer: {
                schema: z.boolean(),
                description: "true or false.",
            },
        },
        format: (q) => `## ${q.question}\n${q.correctAnswer ? DSLTags.TRUE_ANSWER : DSLTags.FALSE_ANSWER}`,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA BUILDER
// Flattens all question-type fields into a single Zod schema.
// This is necessary because some LLM providers (e.g., OpenAI) struggle with
// union/discriminated types in structured output.
// ─────────────────────────────────────────────────────────────────────────────

function buildQuestionSchema(selectedTypes?: string[]) {
    const typeNames = selectedTypes ?? QUESTION_TYPES.map(t => t.typeName);
    const filtered = QUESTION_TYPES.filter(t => typeNames.includes(t.typeName));

    // 1. Collect all fields and track which types require them
    const fieldMap = new Map<string, { def: FieldDefinition; requiredBy: string[] }>();

    for (const type of filtered) {
        for (const [name, def] of Object.entries(type.fields)) {
            const existing = fieldMap.get(name);
            if (existing) {
                if (existing.def.description !== def.description) {
                    throw new Error(
                        `Field "${name}" has conflicting descriptions across question types. ` +
                        `Ensure shared fields have identical descriptions in QUESTION_TYPES.`
                    );
                }
                existing.requiredBy.push(type.typeName);
            } else {
                fieldMap.set(name, { def, requiredBy: [type.typeName] });
            }
        }
    }

    // 2. Flatten: all fields become optional/nullable, annotated with which types need them
    const flatFields: Record<string, z.ZodType> = {};
    for (const [name, { def, requiredBy }] of fieldMap) {
        flatFields[name] = def.schema
            .describe(`[REQUIRED FOR ${requiredBy.join(", ")}]\n${def.description}`)
            .optional()
            .nullable();
    }

    // 3. Combine into single question schema
    return z.object({
        type: z.enum(typeNames as [string, ...string[]])
            .describe(`The type of quiz question. Must be one of: ${typeNames.join(", ")}.`),
        question: z.string()
            .describe("The quiz question text. NEVER include the slide number in the question text or where it appears or where the answer appears (e.g Slide 1). Only the question itself."),
        ...flatFields,
        slideNumber: z.number()
            .describe("The slide number (0-indexed) AFTER which this question popup appears."),
        testedSlides: z.array(z.number())
            .describe("Slide numbers (0-indexed) whose content this question tests. E.g., [2] or [1, 3, 5] for synthesis."),
        questionCategory: z.enum(["immediate", "delayed-recall", "synthesis"])
            .describe("'immediate': tests current slide. 'delayed-recall': tests 2+ slides back. 'synthesis': combines multiple slides."),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTER LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

const formatterMap = new Map<string, (q: Record<string, any>) => string>(
    QUESTION_TYPES.map(t => [t.typeName, t.format])
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Zod-inferred type for a single generated quiz question. */
export type GeneratedQuizQuestion = z.infer<ReturnType<typeof buildQuestionSchema>>;

export class QuizTypes {
    public static readonly MULTIPLE_CHOICE = "Multiple Choice";
    public static readonly SINGLE_CHOICE = "Single Choice";
    public static readonly TRUE_FALSE = "True/False";

    /** All registered quiz type names (for UI display). */
    public static getAllQuizTypes(): string[] {
        return QUESTION_TYPES.map(t => t.typeName);
    }

    /** Schema for an array of quiz questions (passed to the LLM for structured output). */
    public static getQuizSchema(selectedTypes?: string[]) {
        return z.object({
            questions: z.array(buildQuestionSchema(selectedTypes))
                .describe("Array of quiz questions.")
        });
    }

    /** Single question schema (used for type inference). */
    public static getQuestionSchemaType(selectedTypes?: string[]) {
        return buildQuestionSchema(selectedTypes);
    }

    /** Format a generated question into DSL/Markdown for document insertion. */
    public static formatQuestion(quiz: GeneratedQuizQuestion): string {
        const formatter = formatterMap.get(quiz.type);
        return formatter ? formatter(quiz) : "";
    }
}