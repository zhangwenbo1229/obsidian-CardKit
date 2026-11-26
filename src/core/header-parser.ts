import { CardHeader, CardNote, CardProblem, createEmptyHeader } from './types';

/** Accepted key spellings mapped onto the canonical header field. */
const KEY_ALIASES: ReadonlyArray<readonly [string, string]> = [
	['platform', 'scope'],
	['os', 'scope'],
	['lang', 'language'],
	['desc', 'description'],
];

const KNOWN_KEYS: readonly string[] = [
	'step',
	'title',
	'description',
	'scope',
	'language',
	'tags',
	'notes',
];

/** Header keys that hold one value; an empty one is worth reporting. */
const SCALAR_KEYS: readonly string[] = ['step', 'title', 'description', 'scope', 'language'];

/** Keys a typo hint may suggest: the canonical names plus the accepted aliases. */
const SUGGEST_KEYS: readonly string[] = [...KNOWN_KEYS, 'platform', 'os', 'lang', 'desc'];

/** Levenshtein distance, used only to spot a misspelled header key. */
function editDistance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const table: number[][] = [];
	for (let i = 0; i < rows; i += 1) {
		const row: number[] = [];
		for (let j = 0; j < cols; j += 1) row.push(i === 0 ? j : j === 0 ? i : 0);
		table.push(row);
	}
	for (let i = 1; i < rows; i += 1) {
		for (let j = 1; j < cols; j += 1) {
			const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
			const previousRow = table[i - 1] ?? [];
			const currentRow = table[i] ?? [];
			const up = (previousRow[j] ?? 0) + 1;
			const left = (currentRow[j - 1] ?? 0) + 1;
			const diagonal = (previousRow[j - 1] ?? 0) + cost;
			currentRow[j] = Math.min(up, left, diagonal);
		}
	}
	const lastRow = table[rows - 1] ?? [];
	return lastRow[cols - 1] ?? 0;
}

/** Message for a header key this build does not consume. */
function unknownKeyHint(key: string): string | null {
	let suggestion: string | null = null;
	let best = 3;
	for (const candidate of SUGGEST_KEYS) {
		const distance = editDistance(key, candidate);
		if (distance > 0 && distance < best) {
			best = distance;
			suggestion = candidate;
		}
	}
	// No close match means a deliberate extra key (custom types read those from
	// extra), so it is not worth a warning on the card.
	if (suggestion === null) return null;
	return '未识别的字段 "' + key + '"，是不是想写 "' + suggestion + '"？';
}

export interface CardHeaderParseResult {
	header: CardHeader;
	problems: CardProblem[];
}

/** Number of leading spaces/tabs, used to keep note fields inside their list item. */
function indentOf(line: string): number {
	let count = 0;
	while (count < line.length) {
		const char = line.charAt(count);
		if (char !== ' ' && char !== '\t') break;
		count += 1;
	}
	return count;
}

/** Strip one layer of matching quotes; leaves everything else alone. */
function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const first = trimmed.charAt(0);
		const last = trimmed.charAt(trimmed.length - 1);
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return trimmed.slice(1, -1).trim();
		}
	}
	return trimmed;
}

/** Accept both [a, b] and a, b for inline lists. */
function splitInlineList(value: string): string[] {
	const trimmed = value.trim();
	const inner =
		trimmed.startsWith('[') && trimmed.endsWith(']')
			? trimmed.slice(1, -1)
			: trimmed;
	const result: string[] = [];
	for (const part of inner.split(',')) {
		const item = unquote(part);
		if (item !== '') result.push(item);
	}
	return result;
}

/** The "kind | token | note" shorthand, shared with the v1 payload parser. */
export function parseNoteShorthand(text: string): CardNote {
	const parts = text.split('|');
	const kind = (parts[0] ?? '').trim();
	const token = (parts[1] ?? '').trim();
	// Each part is trimmed before joining, so a note that itself contains "|"
	// survives and stray spacing around the separators does not leak in.
	const note = parts
		.slice(2)
		.map((part) => part.trim())
		.join('|')
		.trim();
	return { kind: kind, token: token, note: note };
}

function normalizeKey(raw: string): string {
	return raw.trim().toLowerCase();
}

function aliasKey(key: string): string {
	for (const pair of KEY_ALIASES) {
		const [alias, target] = pair;
		if (key === alias) return target;
	}
	return key;
}

function applyNoteField(
	note: CardNote,
	rawKey: string,
	rawValue: string,
	line: number,
	problems: CardProblem[],
): void {
	const key = normalizeKey(rawKey);
	const value = unquote(rawValue);
	if (key === 'kind' || key === 'type') {
		note.kind = value;
		return;
	}
	if (key === 'token' || key === 'code') {
		note.token = value;
		return;
	}
	if (key === 'note' || key === 'desc' || key === 'description') {
		note.note = value;
		return;
	}
	problems.push({ message: 'notes 里有不认识的字段：' + key, line: line });
}

/**
 * Parse the YAML-ish header carried between the two --- fences.
 *
 * Supported: flat string keys, quoted or bare values, inline and block lists,
 * and notes as a list of mappings or of "kind | token | note" strings.
 * Deliberately not a full YAML parser: no anchors, no nested maps, no block
 * scalars. Anything outside that is reported as a problem instead of silently
 * swallowed.
 */
export function parseCardHeader(headerText: string): CardHeaderParseResult {
	const header = createEmptyHeader();
	const problems: CardProblem[] = [];
	let listKey: 'tags' | 'notes' | null = null;
	let listIndent = 0;
	let noteDraft: CardNote | null = null;

	const commitNote = (): void => {
		if (noteDraft === null) return;
		const draft = noteDraft;
		noteDraft = null;
		if (draft.kind !== '' || draft.token !== '' || draft.note !== '') {
			header.notes.push(draft);
		}
	};

	const lines = headerText.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const rawLine = lines[index] ?? '';
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;
		const indent = indentOf(rawLine);
		const isItem = line === '-' || line.startsWith('- ');

		if (isItem) {
			const itemText = line === '-' ? '' : line.slice(2).trim();
			if (listKey === null) {
				problems.push({ message: '列表项缺少字段名：' + line, line: index });
				continue;
			}
			if (listKey === 'tags') {
				if (itemText !== '') header.tags.push(unquote(itemText));
				continue;
			}
			commitNote();
			listIndent = indent;
			const colon = itemText.indexOf(':');
			if (itemText.includes('|')) {
				noteDraft = parseNoteShorthand(itemText);
			} else if (colon > 0) {
				noteDraft = { kind: '', token: '', note: '' };
				applyNoteField(noteDraft, itemText.slice(0, colon), itemText.slice(colon + 1), index, problems);
			} else if (itemText !== '') {
				noteDraft = { kind: '', token: '', note: itemText };
			} else {
				noteDraft = { kind: '', token: '', note: '' };
			}
			continue;
		}

		const colon = line.indexOf(':');
		if (colon <= 0) {
			problems.push({ message: '无法解析的表头行：' + line, line: index });
			continue;
		}
		const rawKey = normalizeKey(line.slice(0, colon));
		const rawValue = line.slice(colon + 1).trim();
		const key = aliasKey(rawKey);

		if (noteDraft !== null && indent > listIndent && !KNOWN_KEYS.includes(key)) {
			applyNoteField(noteDraft, rawKey, rawValue, index, problems);
			continue;
		}

		commitNote();
		listKey = null;
		const value = unquote(rawValue);

		if (rawValue === '|' || rawValue === '>') {
			problems.push({ message: '暂不支持多行文本，请写在一行里：' + key, line: index });
			continue;
		}
		if (value === '' && SCALAR_KEYS.includes(key)) {
			problems.push({ message: '"' + key + '" 后面没有值', line: index });
		}

		switch (key) {
			case 'step':
				header.step = value === '' ? null : value;
				break;
			case 'title':
				header.title = value === '' ? null : value;
				break;
			case 'description':
				header.description = value === '' ? null : value;
				break;
			case 'scope':
				header.scope = value === '' ? null : value;
				break;
			case 'language':
				header.language = value === '' ? null : value;
				break;
			case 'tags':
				if (rawValue === '') {
					listKey = 'tags';
					listIndent = indent;
				} else {
					for (const tag of splitInlineList(rawValue)) header.tags.push(tag);
				}
				break;
			case 'notes':
				if (rawValue === '') {
					listKey = 'notes';
					listIndent = indent;
				} else {
					problems.push({
						message: 'notes 要写成列表，例如 - kind: 参数',
						line: index,
					});
				}
				break;
			default: {
				header.extra.set(rawKey, value);
				const hint = unknownKeyHint(rawKey);
				if (hint !== null) problems.push({ message: hint, line: index });
				break;
			}
		}
	}

	commitNote();
	return { header: header, problems: problems };
}