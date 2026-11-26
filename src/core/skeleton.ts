import type { CardTypeDefinition } from './types';

/** Default text the reader is expected to replace. */
export const TITLE_PLACEHOLDER = '新卡片';
const BODY_PLACEHOLDER = '正文写在这里';

export interface CardSkeleton {
	/** Text to insert at the cursor. */
	text: string;
	/** Line index of the title line inside text. */
	titleLine: number;
	/** Column the title placeholder starts at. */
	titleStart: number;
	/** Length of the title placeholder. */
	titleLength: number;
}

/**
 * Build the skeleton the insert command writes.
 *
 * Pure, so the smoke test can pin both the text and the cursor position. The
 * type's defaults are only written out when the type actually sets them: an
 * empty "scope:" line would render as a parse problem on the fresh card.
 */
export function buildCardSkeleton(
	language: string,
	definition: CardTypeDefinition | null,
): CardSkeleton {
	const lines: string[] = [];
	lines.push('```' + language);
	lines.push('---');
	lines.push('title: ' + TITLE_PLACEHOLDER);

	const defaults = definition?.defaults;
	if (defaults?.description !== undefined && defaults.description !== '') {
		lines.push('description: ' + defaults.description);
	}
	if (defaults?.scope !== undefined && defaults.scope !== '') {
		lines.push('scope: ' + defaults.scope);
	}
	if (defaults?.language !== undefined && defaults.language !== '') {
		lines.push('language: ' + defaults.language);
	}

	lines.push('---');
	const body =
		definition !== null && definition.skeleton !== '' ? definition.skeleton : BODY_PLACEHOLDER;
	for (const bodyLine of body.split('\n')) lines.push(bodyLine);
	lines.push('```');
	lines.push('');

	return {
		text: lines.join('\n'),
		titleLine: 2,
		titleStart: 'title: '.length,
		titleLength: TITLE_PLACEHOLDER.length,
	};
}
