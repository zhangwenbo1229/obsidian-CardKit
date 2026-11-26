import { trimBlankEdges } from './block-splitter';
import { parseNoteShorthand } from './header-parser';
import { createEmptyHeader } from './types';
import type { CardHeader, CardProblem } from './types';

export interface LegacyParseResult {
	header: CardHeader;
	/** The meta lines verbatim, so a writer can put the body back under them. */
	metaText: string;
	/** Everything after the meta region, verbatim. */
	body: string;
	problems: CardProblem[];
	/** True when at least one v1 marker was recognised. */
	hasMeta: boolean;
}

const STEP_PATTERN = /^\[(\d+)\]/;

type LegacyMarker = 'step' | 'title' | 'desc' | 'scope' | 'language' | 'note';

/**
 * Recognise the v1 meta markers.
 *
 * The trailing space matters and is deliberate: "@echo off" (batch) must stay
 * code, "@ Linux" is meta. Same for "$ " vs a bare shell prompt line and for
 * "> " which only counts after the marker is stripped.
 */
function matchMarker(line: string): LegacyMarker | null {
	if (STEP_PATTERN.test(line)) return 'step';
	if (line.startsWith('# ')) return 'title';
	if (line.startsWith('>')) return 'desc';
	if (line.startsWith('@ ')) return 'scope';
	if (line.startsWith('$ ')) return 'language';
	if (line.startsWith('? ')) return 'note';
	return null;
}

/**
 * Text contributed by a continuation line of the previous annotation.
 *
 * The vault's older blocks wrap a long "? kind | token | note" row over several
 * lines; the tail line often starts with "#" or "|". Only the text after the
 * last "|" is taken, which is the note column in every observed shape:
 *   "# | 命令/载荷起始"        -> "命令/载荷起始"
 *   "# 然后解码触发 | 参数..."  -> "参数..."
 *   "| 注入代码"              -> "注入代码"
 */
function noteContinuation(line: string): string | null {
	const withoutHash = line.startsWith('# ') ? line.slice(2) : line;
	const trimmed = withoutHash.trim();
	const withoutPipe = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
	const parts = withoutPipe.split('|');
	const last = (parts[parts.length - 1] ?? '').trim();
	return last === '' ? null : last;
}

/**
 * Parse a v1 payload block (the micro syntax used by the 1.x plugin and by the
 * thousands of blocks already in the vault).
 *
 * The meta region ends at the first blank line, the first unrecognised line, or
 * at a second "# " line - whichever comes first. Ending it at the blank line is
 * what fixes the old title bug: a "# 在线解码" comment sitting in the body used
 * to overwrite the real title.
 */
export function parseLegacyPayload(source: string): LegacyParseResult {
	const lines = source.split(/\r?\n/);
	const header = createEmptyHeader();
	const problems: CardProblem[] = [];
	const descriptionLines: string[] = [];
	let hasMeta = false;
	let bodyStart = lines.length;

	for (let index = 0; index < lines.length; index += 1) {
		const line = (lines[index] ?? '').trim();
		if (line === '') {
			// A blank line closes the meta region; the body starts after it.
			bodyStart = index + 1;
			break;
		}
		const marker = matchMarker(line);
		const previousNote = header.notes[header.notes.length - 1];

		// A wrapped annotation: the line is not a marker but carries the note
		// column ("| 注入代码"), or it looks like a heading while it is really the
		// tail of the previous annotation ("# | 命令/载荷起始").
		if (previousNote !== undefined && line.includes('|')) {
			const isTail = marker === null ? line.startsWith('|') : marker === 'title' && header.title !== null;
			if (isTail) {
				const addition = noteContinuation(line);
				if (addition !== null) {
					previousNote.note = previousNote.note === '' ? addition : previousNote.note + ' ' + addition;
					continue;
				}
			}
		}

		if (marker === null) {
			// First code line: it and everything after it is body.
			bodyStart = index;
			break;
		}
		if (marker === 'title' && header.title !== null) {
			// A second heading is body text, not a title (jwt-none-alg regression).
			bodyStart = index;
			break;
		}
		switch (marker) {
			case 'step': {
				const match = STEP_PATTERN.exec(line);
				header.step = match?.[1] ?? null;
				hasMeta = true;
				break;
			}
			case 'title': {
				const text = line.slice(2).trim();
				header.title = text === '' ? null : text;
				hasMeta = true;
				break;
			}
			case 'desc': {
				// The v1 parser dropped the marker and one separating space.
				const text = line.slice(1).trim();
				descriptionLines.push(text);
				hasMeta = true;
				break;
			}
			case 'scope': {
				const text = line.slice(2).trim();
				header.scope = text === '' ? null : text;
				hasMeta = true;
				break;
			}
			case 'language': {
				const text = line.slice(2).trim();
				header.language = text === '' ? null : text;
				hasMeta = true;
				break;
			}
			case 'note': {
				const text = line.slice(2).trim();
				header.notes.push(parseNoteShorthand(text));
				if (!text.includes('|')) {
					problems.push({
						message: '注解缺少分隔符，应写成 ? 类型 | 代码 | 说明：' + text,
						line: index,
					});
				}
				hasMeta = true;
				break;
			}
		}
	}

	if (descriptionLines.length > 0) {
		const description = descriptionLines.join('\n').trim();
		header.description = description === '' ? null : description;
	}

	// The meta region verbatim, without the blank line that closed it.
	const metaLines = lines.slice(0, Math.max(0, bodyStart));
	while (metaLines.length > 0 && (metaLines[metaLines.length - 1] ?? '').trim() === '') {
		metaLines.pop();
	}

	return {
		header: header,
		metaText: metaLines.join('\n'),
		body: trimBlankEdges(lines.slice(bodyStart).join('\n')),
		problems: problems,
		hasMeta: hasMeta,
	};
}