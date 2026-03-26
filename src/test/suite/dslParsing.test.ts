/**
 * Test Suite: DSL Parsing & Regex
 * 
 * Tests the DSL tags and regex patterns used to parse lecture files.
 */

import * as assert from 'assert';
import { DSLTags, DSLRegExpressions } from '../../Utils/DSLTags';
import { LectureFileHelper } from '../../Utils/LectureFileHelper';

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: SLIDE_REGEX
// ─────────────────────────────────────────────────────────────────────────────

suite('DSL SLIDE_REGEX', () => {
    test('matches standard slide tag', () => {
        const line = '<!-- slide -->';
        assert.strictEqual(DSLRegExpressions.SLIDE_REGEX.test(line), true);
    });

    test('matches slide tag with extra spaces', () => {
        const line = '<!--   slide   -->';
        assert.strictEqual(DSLRegExpressions.SLIDE_REGEX.test(line), true);
    });

    test('matches slide tag with additional attributes', () => {
        const line = '<!-- slide scene name="Introduction" -->';
        assert.strictEqual(DSLRegExpressions.SLIDE_REGEX.test(line), true);
    });

    test('matches slide tag at start of line with content', () => {
        const line = '<!-- slide --> Some content';
        assert.strictEqual(DSLRegExpressions.SLIDE_REGEX.test(line), true);
    });

    test('does not match different tag', () => {
        const line = '<!-- different -->';
        assert.strictEqual(DSLRegExpressions.SLIDE_REGEX.test(line), false);
    });

    test('does not match incomplete tag', () => {
        const line = '<!-- slide';
        assert.strictEqual(DSLRegExpressions.SLIDE_REGEX.test(line), false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: TITLE_NAME_MATCH_1_REGEX
// ─────────────────────────────────────────────────────────────────────────────

suite('DSL TITLE_NAME_MATCH_1_REGEX', () => {
    test('extracts title from standard format', () => {
        const line = '<!-- scene name="Introduction to ML" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.notStrictEqual(match, null);
        assert.strictEqual(match![1], 'Introduction to ML');
    });

    test('extracts title with slide tag', () => {
        const line = '<!-- slide scene name="Goals of this Unit" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.notStrictEqual(match, null);
        assert.strictEqual(match![1], 'Goals of this Unit');
    });

    test('extracts title with German characters', () => {
        const line = '<!-- slide scene name="Einführung in die KI" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.notStrictEqual(match, null);
        assert.strictEqual(match![1], 'Einführung in die KI');
    });

    test('extracts title with special characters', () => {
        const line = '<!-- scene name="C++ & Java: A Comparison" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.notStrictEqual(match, null);
        assert.strictEqual(match![1], 'C++ & Java: A Comparison');
    });

    test('extracts title with numbers', () => {
        const line = '<!-- scene name="Chapter 1: Introduction" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.notStrictEqual(match, null);
        assert.strictEqual(match![1], 'Chapter 1: Introduction');
    });

    test('does not match missing quotes', () => {
        const line = '<!-- scene name=Introduction -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.strictEqual(match, null);
    });

    test('does not match empty title', () => {
        const line = '<!-- scene name="" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.strictEqual(match, null);
    });

    test('handles spaces around equals sign', () => {
        const line = '<!-- scene name = "Spaced Title" -->';
        const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
        
        assert.notStrictEqual(match, null);
        assert.strictEqual(match![1], 'Spaced Title');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Slide Content Parsing
// ─────────────────────────────────────────────────────────────────────────────

suite('DSL Slide Content Parsing', () => {
    test('parses single slide with content', () => {
        const content = `---
${DSLTags.LECTURE_TAG}
...
---
<!-- slide scene name="Introduction" -->
This is the slide content.
With multiple lines.
<!-- teleprompter -->
This is teleprompter text.
---`;
        
        const slides = LectureFileHelper.parseSlidesFromContent(content);
        
        assert.strictEqual(slides.length, 1);
        assert.strictEqual(slides[0].content, 'This is the slide content.\nWith multiple lines.');
    });

    test('parses multiple slides', () => {
        const content = `---
${DSLTags.LECTURE_TAG}
...
---
<!-- slide scene name="Slide 1" -->
Content for slide 1.
<!-- teleprompter -->
Teleprompter 1.
---
<!-- slide scene name="Slide 2" -->
Content for slide 2.
<!-- teleprompter -->
Teleprompter 2.
---`;
        
        const slides = LectureFileHelper.parseSlidesFromContent(content);
        
        assert.strictEqual(slides.length, 2);
        assert.strictEqual(slides[0].content, 'Content for slide 1.');
        assert.strictEqual(slides[1].content, 'Content for slide 2.');
    });

    test('handles slide without teleprompter at end of file', () => {
        const content = `---
${DSLTags.LECTURE_TAG}
...
---
<!-- slide scene name="Last Slide" -->
Content without teleprompter.`;
        
        const slides = LectureFileHelper.parseSlidesFromContent(content);
        
        assert.strictEqual(slides.length, 1);
        assert.strictEqual(slides[0].content, 'Content without teleprompter.');
    });

    test('returns correct line numbers', () => {
        const content = `line1
line2
<!-- slide scene name="Test" -->
line4
line5
<!-- teleprompter -->
line7`;
        
        const slides = LectureFileHelper.parseSlidesFromContent(content);
        
        assert.strictEqual(slides.length, 1);
        assert.strictEqual(slides[0].startLine, 4);
        assert.strictEqual(slides[0].endLine, 5);
    });

    test('handles empty content between tags', () => {
        const content = `<!-- slide scene name="Empty" -->
<!-- teleprompter -->`;
        
        const slides = LectureFileHelper.parseSlidesFromContent(content);
        
        assert.strictEqual(slides.length, 1);
        assert.strictEqual(slides[0].content, '');
    });

    test('preserves markdown formatting in content', () => {
        const content = `<!-- slide scene name="Formatted" -->
# Heading

- Bullet 1
- Bullet 2

\`\`\`python
code block
\`\`\`
<!-- teleprompter -->`;
        
        const slides = LectureFileHelper.parseSlidesFromContent(content);
        
        assert.strictEqual(slides.length, 1);
        assert.ok(slides[0].content.includes('# Heading'));
        assert.ok(slides[0].content.includes('- Bullet 1'));
        assert.ok(slides[0].content.includes('```python'));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Slide Title Parsing
// ─────────────────────────────────────────────────────────────────────────────

suite('DSL Slide Title Parsing', () => {
    test('extracts all titles from document', () => {
        const content = `---
${DSLTags.LECTURE_TAG}
...
---
<!-- slide scene name="Goals" -->
Content.
<!-- teleprompter -->
---
<!-- slide scene name="Introduction" -->
Content.
<!-- teleprompter -->
---
<!-- slide scene name="Summary" -->
Content.
<!-- teleprompter -->`;
        
        const titles = LectureFileHelper.parseSlideTitlesFromContent(content);
        
        assert.strictEqual(titles.length, 3);
        assert.strictEqual(titles[0].title, 'Goals');
        assert.strictEqual(titles[1].title, 'Introduction');
        assert.strictEqual(titles[2].title, 'Summary');
    });

    test('returns correct line numbers for titles', () => {
        const content = `line1
<!-- slide scene name="First" -->
line3
<!-- slide scene name="Second" -->`;
        
        const titles = LectureFileHelper.parseSlideTitlesFromContent(content);
        
        assert.strictEqual(titles.length, 2);
        assert.strictEqual(titles[0].lineNumber, 2);
        assert.strictEqual(titles[1].lineNumber, 4);
    });

    test('returns empty array for document without titles', () => {
        const content = `---
${DSLTags.LECTURE_TAG}
...
---
Some content without slides.`;
        
        const titles = LectureFileHelper.parseSlideTitlesFromContent(content);
        
        assert.strictEqual(titles.length, 0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Lecture File Detection
// ─────────────────────────────────────────────────────────────────────────────

suite('DSL Lecture File Detection', () => {
    test('detects valid lecture file', () => {
        const content = `---
${DSLTags.LECTURE_TAG}
...
---`;
        
        assert.strictEqual(LectureFileHelper.isLectureFileContent(content), true);
    });

    test('rejects file without lecture tag', () => {
        const content = `---
title: Regular Markdown
---
# Heading`;
        
        assert.strictEqual(LectureFileHelper.isLectureFileContent(content), false);
    });

    test('rejects file with lecture tag after line 3', () => {
        const content = `---
title: Something
author: Someone
${DSLTags.LECTURE_TAG}
---`;
        
        // Tag is on line 4, should not be detected
        assert.strictEqual(LectureFileHelper.isLectureFileContent(content), false);
    });

    test('rejects empty file', () => {
        assert.strictEqual(LectureFileHelper.isLectureFileContent(''), false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Regex Line Number Extraction
// ─────────────────────────────────────────────────────────────────────────────

suite('DSL Line Number Extraction', () => {
    test('finds all slide tag line numbers', () => {
        const content = `line1
<!-- slide scene name="A" -->
line3
<!-- slide scene name="B" -->
line5
<!-- slide scene name="C" -->`;
        
        const lineNumbers = LectureFileHelper.getLineNumbersOfRegexFromContent(content, DSLRegExpressions.SLIDE_REGEX);
        
        assert.deepStrictEqual(lineNumbers, [2, 4, 6]);
    });

    test('finds all teleprompter tag line numbers', () => {
        const content = `<!-- slide -->
content
<!-- teleprompter -->
script
---
<!-- slide -->
content
<!-- teleprompter -->`;
        
        const lineNumbers = LectureFileHelper.getLineNumbersOfRegexFromContent(content, DSLRegExpressions.TELEPROMPTER_REGEX);
        
        assert.deepStrictEqual(lineNumbers, [3, 8]);
    });

    test('returns empty array when no matches', () => {
        const content = `Just plain text
with no DSL tags
at all.`;
        
        const lineNumbers = LectureFileHelper.getLineNumbersOfRegexFromContent(content, DSLRegExpressions.SLIDE_REGEX);
        
        assert.deepStrictEqual(lineNumbers, []);
    });

    test('finds quiz tag line numbers', () => {
        const content = `<!-- slide -->
<!-- quiz -->
<!-- teleprompter -->
<!-- quiz -->`;
        
        const lineNumbers = LectureFileHelper.getLineNumbersOfRegexFromContent(content, DSLRegExpressions.QUIZ_REGEX);
        
        assert.deepStrictEqual(lineNumbers, [2, 4]);
    });
});
