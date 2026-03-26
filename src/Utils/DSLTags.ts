export namespace DSLTags {
    export const LECTURE_TAG = 'lehrvideo: true';

    export const TITLE_TAG = 'scene name';
    export const SLIDE_TAG = 'slide';
    export const TELEPROMPTER_TAG = 'teleprompter';
    export const QUIZ_TAG = 'quiz';
    export const BUTTON_TAG = 'button';

    export const SLIDE_SEPARATOR = '---';
    export const START_TAG = '<!--';
    export const END_TAG = '-->';

    export const HEADER_FRONTMATTER = [
        DSLTags.SLIDE_SEPARATOR,
        DSLTags.LECTURE_TAG,
        '...',
        DSLTags.SLIDE_SEPARATOR,
    ].join('\n');

    export const TRUE_ANSWER = `${DSLTags.START_TAG} true ${DSLTags.END_TAG}`;
    export const FALSE_ANSWER = `${DSLTags.START_TAG} false ${DSLTags.END_TAG}`;
}

export namespace DSLRegExpressions {
    export const TITLE_NAME_MATCH_1_REGEX = new RegExp(
        String.raw`${DSLTags.START_TAG}.*?${DSLTags.TITLE_TAG}\s*=\s*"([^"]+)".*?${DSLTags.END_TAG}`
    );
    export const SLIDE_REGEX = new RegExp(
        String.raw`${DSLTags.START_TAG}.*?${DSLTags.SLIDE_TAG}.*?${DSLTags.END_TAG}`
    );
    export const TELEPROMPTER_REGEX = new RegExp(
        String.raw`${DSLTags.START_TAG}.*?${DSLTags.TELEPROMPTER_TAG}.*?${DSLTags.END_TAG}`
    );
    export const QUIZ_REGEX = new RegExp(
        String.raw`${DSLTags.START_TAG}.*?${DSLTags.QUIZ_TAG}.*?${DSLTags.END_TAG}`
    );
}