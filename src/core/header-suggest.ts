/**
 * What to offer while the cursor is inside a card's --- header.
 *
 * Pure: the editor side only decides *where* the cursor is, this decides *what*
 * to suggest and what text the completion replaces.
 */

export interface HeaderSuggestion {
	/** Text shown in the list. */
	label: string;
	/** One line explanation. */
	detail: string;
	/** Text inserted over the replaced range. */
	insert: string;
}

export interface HeaderSuggestionContext {
	items: HeaderSuggestion[];
	/** Column the completion replaces from (start of the line's content). */
	replaceFrom: number;
	/** Text before the cursor; used for filtering. */
	query: string;
}

const KEYS: ReadonlyArray<readonly [string, string]> = [
	['step', '序号徽标'],
	['title', '标题'],
	['description', '说明，支持行内 Markdown'],
	['scope', '平台 / 环境，别名 platform、os'],
	['language', '代码高亮语言，别名 lang'],
	['tags', '标签列表'],
	['notes', '解析注解：kind / token / note'],
];

const SCOPES: readonly string[] = ['all', 'Linux', 'Windows', 'macOS', 'web', 'Android', 'iOS'];
const LANGUAGES: readonly string[] = [
	'bash',
	'powershell',
	'cmd',
	'python',
	'javascript',
	'typescript',
	'json',
	'yaml',
	'xml',
	'sql',
	'plaintext',
];
const NOTE_KINDS: readonly string[] = ['参数', '命令', '标签', '关键字', 'value', 'command', 'tag', 'operator'];
const NOTE_FIELDS: readonly string[] = ['kind', 'token', 'note'];

function valueItems(values: readonly string[], detail: string, prefix: string): HeaderSuggestion[] {
	return values.map((value) => ({ label: value, detail: detail, insert: prefix + value }));
}

/** Top level keys already written above the cursor. */
function usedKeys(headersBefore: readonly string[]): Set<string> {
	const used = new Set<string>();
	for (const line of headersBefore) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
		const colon = trimmed.indexOf(':');
		if (colon > 0) used.add(trimmed.slice(0, colon).trim().toLowerCase());
	}
	return used;
}

export function suggestHeaderItems(
	headersBefore: readonly string[],
	lineText: string,
	cursorCh: number,
): HeaderSuggestionContext | null {
	const before = lineText.slice(0, cursorCh);
	const trimmed = before.trimStart();
	const indent = before.length - trimmed.length;
	const query = trimmed;

	// A notes list item: "- kind: |" or a fresh "- ".
	if (trimmed.startsWith('-')) {
		const rest = trimmed.replace(/^-\s?/, '');
		const colon = rest.indexOf(':');
		if (colon === -1) {
			return {
				items: NOTE_FIELDS.map((field) => ({
					label: field,
					detail: '注解字段',
					insert: field + ': ',
				})),
				replaceFrom: indent,
				query: query,
			};
		}
		const inner = rest.slice(0, colon).trim().toLowerCase();
		if (inner === 'kind' || inner === 'type') {
			return { items: valueItems(NOTE_KINDS, '注解类型', 'kind: '), replaceFrom: indent, query: query };
		}
		// token 与 note 是自由文本，没什么可补的。
		return null;
	}

	const colon = trimmed.indexOf(':');
	if (colon === -1) {
		const used = usedKeys(headersBefore);
		const items = KEYS.filter(([key]) => !used.has(key)).map(([key, detail]) => ({
			label: key,
			detail: detail,
			insert: key + ': ',
		}));
		return { items: items, replaceFrom: indent, query: query };
	}

	const key = trimmed.slice(0, colon).trim().toLowerCase();
	if (key === 'scope' || key === 'platform' || key === 'os') {
		return { items: valueItems(SCOPES, '平台 / 环境', key + ': '), replaceFrom: indent, query: query };
	}
	if (key === 'language' || key === 'lang') {
		return { items: valueItems(LANGUAGES, '高亮语言', key + ': '), replaceFrom: indent, query: query };
	}
	return null;
}

/** Filter for the editor side: a key query is a prefix match, a value query is not. */
export function filterHeaderItems(
	items: readonly HeaderSuggestion[],
	query: string,
): HeaderSuggestion[] {
	const trimmed = query.trim().toLowerCase();
	if (trimmed === '' || trimmed.includes(':')) return items.slice();
	return items.filter((item) => item.label.toLowerCase().startsWith(trimmed));
}
