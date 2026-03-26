export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}

// Defines the tools available to the AI agent
export class Toolkit {
    // Tells the Agent that this method can be used to read certain lines from the active file
    public static getReadLinesTool(): Tool {
        return {
            name: 'read_lines',
            description: 'Read specific lines from the active file. The output will include line numbers (e.g., "12 | const x = 1") to help you strictly identify where to edit. STRICT RULES: (1) You MUST use these line numbers directly for all subsequent edits. (2) NEVER include line number prefixes in any new content you generate. (3) If you are unsure, call read_file or read_lines again before editing.',
            parameters: {
                type: 'object',
                properties: {
                    startLine: {
                        type: 'number',
                        description: 'The starting line number to read (1-indexed).'
                    },
                    endLine: {
                        type: 'number',
                        description: 'The ending line number to read (1-indexed).'
                    }
                },
                required: ['startLine', 'endLine']
            }
        };
    }

    // Tells the Agent that this method can be used to get the contents of the currently opened file
    public static getReadFileTool(): Tool {
        return {
            name: 'read_file',
            description: 'Reads the complete content of the active file. Returns text with line numbers added (e.g., "1 | import..."). STRICT RULES: (1) You MUST use these line numbers directly for all subsequent edits. (2) NEVER include line number prefixes in any new content you generate. (3) If you are unsure, call read_file or read_lines again before editing.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        };
    }

    // Tells the Agent that this method can format/restructure the entire active file
    public static getFormatFileTool(): Tool {
        return {
            name: 'format_file',
            description: 'Reformats or restructures the entire active file based on instructions. Use for style changes, sentence restructuring, or whole-file transformations.',
            parameters: {
                type: 'object',
                properties: {
                    newContent: {
                        type: 'string',
                        description: 'The complete new content for the file after applying formatting/restructuring'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Brief explanation of what formatting changes were applied'
                    }
                },
                required: ['newContent', 'explanation']
            }
        };
    }

    // Tells the Agent that this method can replace specific content in the active file
    public static getEditRangeTool(): Tool {
        return {
            name: 'edit_range',
            description: 'Replaces ENTIRE lines from startLine to endLine with newContent. STRICT RULES: (1) The newContent must include all necessary indentation (spaces/tabs) for the new lines. (2) NEVER include line number prefixes in newContent. (3) You MUST use the line numbers exactly as they appear in the most recent read_file/read_lines output. (4) If you are unsure, call read_file or read_lines again before editing.',
            parameters: {
                type: 'object',
                properties: {
                    startLine: {
                        type: 'number',
                        description: 'The starting line number (1-indexed, inclusive) of the range to replace.'
                    },
                    endLine: {
                        type: 'number',
                        description: 'The ending line number (1-indexed, inclusive) of the range to replace.'
                    },
                    newContent: {
                        type: 'string',
                        description: 'The new content to insert in place of the specified line range. Include proper line breaks.'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Brief explanation of why the change is needed'
                    }
                },
                required: ['startLine', 'endLine', 'newContent', 'explanation']
            }
        };
    }

    // Tells the Agent that this method can insert content at a specific line
    public static getAddLinesAtPositionTool(): Tool {
        return {
            name: 'add_lines_at_position',
            description: 'Inserts new content AFTER the specified line number. Use line 0 to insert at the beginning of the file. Line numbers are 1-indexed. STRICT RULES: (1) NEVER include line number prefixes in newContent. (2) You MUST use the line numbers exactly as they appear in the most recent read_file/read_lines output. (3) If you are unsure, call read_file or read_lines again before editing.',
            parameters: {
                type: 'object',
                properties: {
                    afterLine: {
                        type: 'number',
                        description: 'The line number after which to insert new content. Use 0 to insert at the beginning of the file. (1-indexed)'
                    },
                    newContent: {
                        type: 'string',
                        description: 'The new content to insert. Include proper line breaks.'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Brief explanation of what this change does and why'
                    }
                },
                required: ['afterLine', 'newContent', 'explanation']
            }
        };
    }

    // Tells the Agent that this method can remove specific lines from the file
    public static getRemoveLinesTool(): Tool {
        return {
            name: 'remove_lines',
            description: 'Removes lines from startLine to endLine (inclusive). Line numbers are 1-indexed.',
            parameters: {
                type: 'object',
                properties: {
                    startLine: {
                        type: 'number',
                        description: 'The starting line number (1-indexed, inclusive) to remove.'
                    },
                    endLine: {
                        type: 'number',
                        description: 'The ending line number (1-indexed, inclusive) to remove.'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Brief explanation of why these lines are being removed'
                    }
                },
                required: ['startLine', 'endLine', 'explanation']
            }
        };
    }

    // Tells the Agent that this method can replace text by exact matching (robust against line shifts)
    public static getReplaceTextTool(): Tool {
        return {
            name: 'replace_text',
            description: 'RECOMMENDED for text edits: Replace specific text segments by exact matching. More robust than line-based edits because it is immune to line number shifts. Provide arrays of original texts and their replacements. All occurrences of each original text will be replaced.',
            parameters: {
                type: 'object',
                properties: {
                    originalTexts: {
                        type: 'array',
                        description: 'Array of exact text snippets to find and replace. Each must match the source verbatim (including whitespace and line breaks).',
                        items: {
                            type: 'string'
                        }
                    },
                    newContents: {
                        type: 'array',
                        description: 'Array of replacement texts, corresponding to originalTexts by index. Must have the same length as originalTexts.',
                        items: {
                            type: 'string'
                        }
                    },
                    explanation: {
                        type: 'string',
                        description: 'Brief explanation of what changes are being made and why'
                    }
                },
                required: ['originalTexts', 'newContents', 'explanation']
            }
        };
    }

    // Tells the Agent to apply a batch of edits to the active file
    public static getApplyBatchEditsTool(): Tool {
        return {
            name: 'apply_batch_edits',
            description: 'Apply multiple edits in one operation. STRICT RULES: (1) You MUST use the line numbers exactly as they appear in the most recent read_file/read_lines output. (2) NEVER calculate offsets or adjust line numbers for subsequent edits in the same batch; the system applies them from bottom-to-top automatically. (3) NEVER include line number prefixes in any new content. (4) If you are unsure, call read_file or read_lines again before editing.',
            parameters: {
                type: 'object',
                properties: {
                    edits: {
                        type: 'array',
                        description: 'Array of edit operations. Reference line numbers from the original file state.',
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['edit_range', 'add_lines_at_position', 'remove_lines'],
                                    description: 'Type of edit operation.'
                                },
                                startLine: {
                                    type: 'number',
                                    description: 'Start line for edit_range/remove_lines (1-indexed).'
                                },
                                endLine: {
                                    type: 'number',
                                    description: 'End line for edit_range/remove_lines (1-indexed).'
                                },
                                afterLine: {
                                    type: 'number',
                                    description: 'Line number after which to insert for add_lines_at_position (use 0 for top).'
                                },
                                newContent: {
                                    type: 'string',
                                    description: 'The new content to insert. Do NOT include line number prefixes.'
                                }
                            },
                            required: ['type']
                        }
                    },
                    explanation: {
                        type: 'string',
                        description: 'High-level explanation of the batch changes.'
                    }
                },
                required: ['edits', 'explanation']
            }
        };
    }

    // Tells the Agent to signal task completion
    public static getTaskCompleteTool(): Tool {
        return {
            name: 'task_complete',
            description: 'REQUIRED: Call this tool when you have completed the user\'s task. You MUST call this tool to signal that you are done. Provide a summary of what was accomplished and any important notes for the user.',
            parameters: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: 'A clear summary of what was accomplished. Include: what changes were made, what the user asked for, and confirmation that it was completed.'
                    },
                    reasoning: {
                        type: 'string',
                        description: 'Your reasoning for why the task is complete. Explain how you verified that the work meets the user\'s requirements.'
                    },
                    changesApplied: {
                        type: 'array',
                        description: 'List of changes that were applied during this task.',
                        items: {
                            type: 'string'
                        }
                    }
                },
                required: ['summary', 'reasoning']
            }
        };
    }

    // Returns all available tools
    public static getAllTools(): Tool[] {
        return [
            this.getReadFileTool(),
            this.getReadLinesTool(),
            this.getFormatFileTool(),
            this.getEditRangeTool(),
            this.getAddLinesAtPositionTool(),
            this.getRemoveLinesTool(),
            this.getReplaceTextTool(),
            this.getApplyBatchEditsTool(),
            this.getTaskCompleteTool()
        ];
    }
}
