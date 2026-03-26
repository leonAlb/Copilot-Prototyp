import * as vscode from 'vscode';
import { DSLRegExpressions, DSLTags } from './DSLTags';

export interface RegexMatchTag {
    title: string;
    lineNumber: number;
}

export interface SlideContent {
    content: string;
    startLine: number;  // 1-indexed
    endLine: number;    // 1-indexed, inclusive
}

export class LectureFileHelper {
    // ─────────────────────────────────────────────────────────────────────────
    // CONTENT EXTRACTION METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Returns content between SLIDE and TELEPROMPTER tags as array of strings
    public static getSlidesContent(): string[] {
        return this.getSlidesContentWithLineNumbers().map(slide => slide.content);
    }

    // Pure parsing logic for slides
    public static parseSlidesFromContent(content: string): SlideContent[] {
        const slidesArray: SlideContent[] = [];
        let currentSlideContent: string = '';
        let slideStartLine: number = 0;
        let isSlideContent = false;
        const lectureLines = content.split('\n');

        for (let lineIndex = 0; lineIndex < lectureLines.length; lineIndex++) {
            const line = lectureLines[lineIndex];
            const lineNumber = lineIndex + 1; // 1-indexed

            // If slide start found, reset and start capturing new slide content
            if (DSLRegExpressions.SLIDE_REGEX.test(line)) {
                currentSlideContent = '';
                slideStartLine = lineNumber + 1; // Content starts on next line
                isSlideContent = true;
                continue;
            }

            // If teleprompter found, save current slide content and stop capturing
            if (DSLRegExpressions.TELEPROMPTER_REGEX.test(line)) {
                if (isSlideContent) {
                    slidesArray.push({
                        // Preserve indentation, only trim leading/trailing newlines
                        content: currentSlideContent.replace(/^\n+|\n+$/g, ''),
                        startLine: slideStartLine,
                        endLine: lineNumber - 1,
                    });
                    currentSlideContent = '';
                }
                isSlideContent = false;
                continue;
            }

            // If currently in slide content, add line
            if (isSlideContent) {
                currentSlideContent += line + '\n';
            }
        }

        // Handle edge case: slide without teleprompter tag at end of file
        if (isSlideContent && currentSlideContent.trim()) {
            slidesArray.push({
                content: currentSlideContent.replace(/^\n+|\n+$/g, ''),
                startLine: slideStartLine,
                endLine: lectureLines.length,
            });
        }

        return slidesArray;
    }

    // Returns slides with line number information for precise editing
    public static getSlidesContentWithLineNumbers(): SlideContent[] {
        // Get content from active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return [];
        }
        return this.parseSlidesFromContent(editor.document.getText());
    }

    // Pure parsing logic for titles
    public static parseSlideTitlesFromContent(content: string): RegexMatchTag[] {
        const slideTitles: RegexMatchTag[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const match = line.match(DSLRegExpressions.TITLE_NAME_MATCH_1_REGEX);
            if (match) {
                slideTitles.push({ title: match[1], lineNumber: index + 1 });
            }
        });
        
        return slideTitles;
    }

    public static getSlideTitles(): RegexMatchTag[] {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) { return []; }
        return this.parseSlideTitlesFromContent(activeEditor.document.getText());
    }

    // Pure parsing logic for regex line numbers
    public static getLineNumbersOfRegexFromContent(content: string, regex: RegExp): number[] {
        let lineNumbers: number[] = [];
        const lectureLines = content.split("\n");
        lectureLines.forEach((line, index) => {
            let currentLine = line.trim();
            if (currentLine.match(regex)) {
                lineNumbers.push(index + 1);
            }
        });
        return lineNumbers;
    }

    public static getLinenumberOfRegex(regex: RegExp): number[] {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) { return []; }
        return this.getLineNumbersOfRegexFromContent(activeEditor.document.getText(), regex);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FILE TYPE DETECTION
    // ─────────────────────────────────────────────────────────────────────────

    public static isLectureFileContent(content: string): boolean {
        // Simple check on first few lines
        const lines = content.split('\n');
        const endLine = Math.min(2, lines.length - 1);
        const firstThreeLines = lines.slice(0, endLine + 1).join('\n');
        return firstThreeLines.includes(DSLTags.LECTURE_TAG);
    }

    public static isLectureFile(document: vscode.TextDocument): boolean {
        if (document.languageId !== 'markdown') {
            return false;
        }
        return this.isLectureFileContent(document.getText());
    }
}