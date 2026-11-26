import type { CardProblem } from './types';

/**
 * Split a fenced card block into its header text and its body.
 *
 * Format A: the block may start with a --- fenced header; the first line after
 * the closing --- is the start of the body and nothing in the body is
 * interpreted. A block that does not start with --- is all body, which keeps
 * legacy payload blocks readable.
 */

export interface CardBlockSplit {
	/** Header lines between the two fences, or null when the block has no header. */
	headerText: string | null;
	/** Everything after the closing fence, verbatim except surrounding blank lines. */
	bodyText: string;
	hasHeader: boolean;
	/** 0-based line of the opening ---, or -1. */
	headerOpenLine: number;
	/** 0-based line of the closing ---, or -1. */
	headerCloseLine: number;
	/** 0-based line the body starts on, or -1. */
	bodyStartLine: number;
	problems: CardProblem[];
}

const FENCE = '---';

/** Drop blank lines at both edges without touching indentation inside. */
export function trimBlankEdges(text: string): string {
	const lines = text.split(/\r?\n/);
	let start = 0;
	let end = lines.length;
	while (start < end && (lines[start] ?? '').trim() === '') start += 1;
	while (end > start && (lines[end - 1] ?? '').trim() === '') end -= 1;
	return lines.slice(start, end).join('\n');
}

function lineAt(lines: readonly string[], index: number): string {
	return lines[index] ?? '';
}

export function splitCardBlock(source: string): CardBlockSplit {
	const lines = source.split(/\r?\n/);
	const empty: CardBlockSplit = {
		headerText: null,
		bodyText: '',
		hasHeader: false,
		headerOpenLine: -1,
		headerCloseLine: -1,
		bodyStartLine: -1,
		problems: [],
	};

	let first = -1;
	for (let index = 0; index < lines.length; index += 1) {
		if (lineAt(lines, index).trim() !== '') {
			first = index;
			break;
		}
	}
	if (first === -1) return empty;

	if (lineAt(lines, first).trim() !== FENCE) {
		return {
			...empty,
			bodyText: trimBlankEdges(lines.slice(first).join('\n')),
			bodyStartLine: first,
		};
	}

	let close = -1;
	for (let index = first + 1; index < lines.length; index += 1) {
		if (lineAt(lines, index).trim() === FENCE) {
			close = index;
			break;
		}
	}

	if (close === -1) {
		return {
			...empty,
			bodyText: trimBlankEdges(lines.slice(first + 1).join('\n')),
			bodyStartLine: first + 1,
			problems: [{ message: '包头缺少结束的 ---，整块已按正文渲染', line: first }],
		};
	}

	return {
		headerText: lines.slice(first + 1, close).join('\n'),
		bodyText: trimBlankEdges(lines.slice(close + 1).join('\n')),
		hasHeader: true,
		headerOpenLine: first,
		headerCloseLine: close,
		bodyStartLine: close + 1,
		problems: [],
	};
}
