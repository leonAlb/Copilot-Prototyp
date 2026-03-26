/**
 * Test Suite: QuizTypes
 *
 * Tests the quiz question type registry, Zod schema generation,
 * and DSL formatting logic for quiz questions.
 */

import * as assert from 'assert';
import { QuizTypes, GeneratedQuizQuestion } from '../../LLM/Milestones/QuizTypes';
import { DSLTags } from '../../Utils/DSLTags';

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Quiz Type Registry
// ─────────────────────────────────────────────────────────────────────────────

suite('QuizTypes Registry', () => {
    test('getAllQuizTypes returns all three types', () => {
        const types = QuizTypes.getAllQuizTypes();
        assert.strictEqual(types.length, 3);
    });

    test('getAllQuizTypes includes Multiple Choice', () => {
        assert.ok(QuizTypes.getAllQuizTypes().includes(QuizTypes.MULTIPLE_CHOICE));
    });

    test('getAllQuizTypes includes Single Choice', () => {
        assert.ok(QuizTypes.getAllQuizTypes().includes(QuizTypes.SINGLE_CHOICE));
    });

    test('getAllQuizTypes includes True/False', () => {
        assert.ok(QuizTypes.getAllQuizTypes().includes(QuizTypes.TRUE_FALSE));
    });

    test('static constants match registered type names', () => {
        const types = QuizTypes.getAllQuizTypes();
        assert.ok(types.includes('Multiple Choice'));
        assert.ok(types.includes('Single Choice'));
        assert.ok(types.includes('True/False'));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: formatQuestion — Multiple Choice
// ─────────────────────────────────────────────────────────────────────────────

suite('QuizTypes formatQuestion Multiple Choice', () => {
    test('formats MC question with correct answer markers', () => {
        const question = {
            type: 'Multiple Choice',
            question: 'What is 2+2?',
            options: ['3', '4', '5'],
            correctOptionIndices: [1],
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes('## What is 2+2?'), 'Should contain question as H2');
        assert.ok(result.includes(`- 3 ${DSLTags.FALSE_ANSWER}`), 'Option 0 should be false');
        assert.ok(result.includes(`- 4 ${DSLTags.TRUE_ANSWER}`), 'Option 1 should be true');
        assert.ok(result.includes(`- 5 ${DSLTags.FALSE_ANSWER}`), 'Option 2 should be false');
    });

    test('formats MC question with multiple correct answers', () => {
        const question = {
            type: 'Multiple Choice',
            question: 'Which are prime?',
            options: ['2', '4', '5', '6'],
            correctOptionIndices: [0, 2],
            slideNumber: 1,
            testedSlides: [1],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes(`- 2 ${DSLTags.TRUE_ANSWER}`), 'Option 0 should be true');
        assert.ok(result.includes(`- 4 ${DSLTags.FALSE_ANSWER}`), 'Option 1 should be false');
        assert.ok(result.includes(`- 5 ${DSLTags.TRUE_ANSWER}`), 'Option 2 should be true');
        assert.ok(result.includes(`- 6 ${DSLTags.FALSE_ANSWER}`), 'Option 3 should be false');
    });

    test('formats MC question where all answers are correct', () => {
        const question = {
            type: 'Multiple Choice',
            question: 'All correct?',
            options: ['A', 'B'],
            correctOptionIndices: [0, 1],
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes(`- A ${DSLTags.TRUE_ANSWER}`));
        assert.ok(result.includes(`- B ${DSLTags.TRUE_ANSWER}`));
    });

    test('formats MC question where no answers are correct (edge case)', () => {
        const question = {
            type: 'Multiple Choice',
            question: 'None correct?',
            options: ['A', 'B'],
            correctOptionIndices: [],
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes(`- A ${DSLTags.FALSE_ANSWER}`));
        assert.ok(result.includes(`- B ${DSLTags.FALSE_ANSWER}`));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: formatQuestion — Single Choice
// ─────────────────────────────────────────────────────────────────────────────

suite('QuizTypes formatQuestion Single Choice', () => {
    test('formats SC question with one correct answer', () => {
        const question = {
            type: 'Single Choice',
            question: 'Capital of France?',
            options: ['Berlin', 'Paris', 'London'],
            correctOptionIndex: 1,
            slideNumber: 2,
            testedSlides: [2],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes('## Capital of France?'));
        assert.ok(result.includes(`- Berlin ${DSLTags.FALSE_ANSWER}`));
        assert.ok(result.includes(`- Paris ${DSLTags.TRUE_ANSWER}`));
        assert.ok(result.includes(`- London ${DSLTags.FALSE_ANSWER}`));
    });

    test('formats SC question with first option correct', () => {
        const question = {
            type: 'Single Choice',
            question: 'First?',
            options: ['Yes', 'No'],
            correctOptionIndex: 0,
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes(`- Yes ${DSLTags.TRUE_ANSWER}`));
        assert.ok(result.includes(`- No ${DSLTags.FALSE_ANSWER}`));
    });

    test('formats SC question with last option correct', () => {
        const question = {
            type: 'Single Choice',
            question: 'Last?',
            options: ['A', 'B', 'C'],
            correctOptionIndex: 2,
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes(`- A ${DSLTags.FALSE_ANSWER}`));
        assert.ok(result.includes(`- B ${DSLTags.FALSE_ANSWER}`));
        assert.ok(result.includes(`- C ${DSLTags.TRUE_ANSWER}`));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: formatQuestion — True/False
// ─────────────────────────────────────────────────────────────────────────────

suite('QuizTypes formatQuestion True/False', () => {
    test('formats true answer', () => {
        const question = {
            type: 'True/False',
            question: 'The sky is blue.',
            correctAnswer: true,
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes('## The sky is blue.'));
        assert.ok(result.includes(DSLTags.TRUE_ANSWER));
        assert.ok(!result.includes(DSLTags.FALSE_ANSWER));
    });

    test('formats false answer', () => {
        const question = {
            type: 'True/False',
            question: 'The sun is cold.',
            correctAnswer: false,
            slideNumber: 1,
            testedSlides: [1],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);

        assert.ok(result.includes('## The sun is cold.'));
        assert.ok(result.includes(DSLTags.FALSE_ANSWER));
        assert.ok(!result.includes(DSLTags.TRUE_ANSWER));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: formatQuestion — Unknown Type
// ─────────────────────────────────────────────────────────────────────────────

suite('QuizTypes formatQuestion Unknown Type', () => {
    test('returns empty string for unknown question type', () => {
        const question = {
            type: 'Unknown Type',
            question: 'test?',
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as any;

        const result = QuizTypes.formatQuestion(question);
        assert.strictEqual(result, '');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: formatQuestion — Output Structure
// ─────────────────────────────────────────────────────────────────────────────

suite('QuizTypes formatQuestion Output Structure', () => {
    test('MC output starts with H2 heading', () => {
        const question = {
            type: 'Multiple Choice',
            question: 'Test?',
            options: ['A'],
            correctOptionIndices: [0],
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);
        assert.ok(result.startsWith('## '));
    });

    test('SC output starts with H2 heading', () => {
        const question = {
            type: 'Single Choice',
            question: 'Test?',
            options: ['A'],
            correctOptionIndex: 0,
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);
        assert.ok(result.startsWith('## '));
    });

    test('T/F output starts with H2 heading', () => {
        const question = {
            type: 'True/False',
            question: 'Test?',
            correctAnswer: true,
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);
        assert.ok(result.startsWith('## '));
    });

    test('MC options are formatted as markdown list items', () => {
        const question = {
            type: 'Multiple Choice',
            question: 'Q?',
            options: ['X', 'Y'],
            correctOptionIndices: [0],
            slideNumber: 0,
            testedSlides: [0],
            questionCategory: 'immediate',
        } as GeneratedQuizQuestion;

        const result = QuizTypes.formatQuestion(question);
        const lines = result.split('\n');
        const optionLines = lines.filter(l => l.startsWith('- '));
        assert.strictEqual(optionLines.length, 2);
    });
});