import { isRecord, isUnknownArray, readNumber, readText } from './json';
import type {
	ApiExample,
	ApiHighlight,
	ApiMetadata,
	ApiEndpoint,
	CardProblem,
} from './types';

export interface ApiParseResult {
	endpoints: ApiEndpoint[];
	problems: CardProblem[];
}

/**
 * Where the JSON broke, as a 0-based line.
 *
 * V8 reports either "at position N (line L column C)", only a line, or nothing
 * at all for very short inputs - so all three cases are handled, and no line is
 * reported rather than a wrong one.
 */
function lineOfJsonError(text: string, error: unknown): number | null {
	const message = error instanceof Error ? error.message : String(error);
	const lineMatch = /line (\d+)/.exec(message);
	if (lineMatch !== null) {
		const line = Number(lineMatch[1]);
		if (Number.isFinite(line) && line > 0) return line - 1;
	}
	const positionMatch = /position (\d+)/.exec(message);
	if (positionMatch !== null) {
		const position = Number(positionMatch[1]);
		if (Number.isFinite(position)) return lineAt(text, position);
	}
	// V8 26 quotes the text around the failure instead of a position, e.g.
	//   Unexpected token '}', ..."c": }" is not valid JSON
	// The quoted tail ends at the offending character, so its end is the line.
	const fragment = unquoteJsonFragment(message);
	if (fragment === null) return null;
	// V8 may clip the fragment, so try it whole first and then progressively
	// shorter prefixes until one is found in the source.
	for (let length = fragment.length; length >= 4; length -= 1) {
		const candidate = fragment.slice(0, length);
		const at = text.indexOf(candidate);
		if (at !== -1) return lineAt(text, at + candidate.length - 1);
	}
	return null;
}

/**
 * The source fragment V8 quotes in its message.
 *
 * The shape is: Unexpected token 'x', ..."<fragment>"... is not valid JSON
 * - the fragment sits between the first and the last quote, and both ends may
 * carry an ellipsis when V8 clipped the context.
 */
function unquoteJsonFragment(message: string): string | null {
	const end = message.indexOf(' is not valid JSON');
	if (end === -1) return null;
	let body = message.slice(0, end);
	const startQuote = body.indexOf('"');
	const endQuote = body.lastIndexOf('"');
	if (startQuote !== -1 && endQuote > startQuote) {
		body = body.slice(startQuote + 1, endQuote);
	} else {
		const comma = body.lastIndexOf(', ');
		if (comma === -1) return null;
		body = body.slice(comma + 2);
	}
	const cleaned = unescapeJsonFragment(body)
		.replace(/^\.\.\./, '')
		.replace(/\.\.\.$/, '')
		.trim();
	return cleaned.length === 0 ? null : cleaned;
}

/** Literal backslash escapes in a fragment back to real characters. */
function unescapeJsonFragment(value: string): string {
	return value
		.split('\\n')
		.join('\n')
		.split('\\t')
		.join('\t')
		.split('\\r')
		.join('\r')
		.split('\\"')
		.join('"')
		.split('\\\\')
		.join('\\');
}

/** 0-based line of a character offset. */
function lineAt(text: string, offset: number): number {
	let line = 0;
	for (let index = 0; index < offset && index < text.length; index += 1) {
		if (text.charAt(index) === '\n') line += 1;
	}
	return line;
}

function readBody(value: unknown): string {
	const text = readText(value);
	if (text !== null) return text;
	if (value === undefined || value === null) return '';
	try {
		return JSON.stringify(value, null, 2) ?? '';
	} catch {
		return '';
	}
}

function readMetadata(value: unknown, label: string, problems: CardProblem[]): ApiMetadata[] {
	if (value === undefined || value === null) return [];
	if (!isUnknownArray(value)) {
		problems.push({ message: label + '：metadata 必须是数组', line: null });
		return [];
	}
	const items: ApiMetadata[] = [];
	for (const entry of value) {
		const text = readText(entry);
		if (text !== null) {
			items.push({ text: text, color: '' });
			continue;
		}
		if (isRecord(entry)) {
			const inner = readText(entry['text']);
			if (inner !== null) {
				items.push({ text: inner, color: readText(entry['color']) ?? '' });
				continue;
			}
		}
		problems.push({ message: label + '：metadata 项要是字符串或 {text, color}', line: null });
	}
	return items;
}

function readHighlights(value: unknown, label: string, problems: CardProblem[]): ApiHighlight[] {
	if (value === undefined || value === null) return [];
	if (!isUnknownArray(value)) {
		problems.push({ message: label + '：highlights 必须是数组', line: null });
		return [];
	}
	const items: ApiHighlight[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) {
			problems.push({ message: label + '：高亮项必须是对象', line: null });
			continue;
		}
		const line = readNumber(entry['line']);
		const start = readNumber(entry['start']);
		const end = readNumber(entry['end']);
		if (line === null || start === null || end === null || end <= start) {
			problems.push({ message: label + '：高亮需要 line / start / end，且 end 要大于 start', line: null });
			continue;
		}
		items.push({ line: line, start: start, end: end, color: readText(entry['color']) ?? '' });
	}
	return items;
}

function readExample(entry: Record<string, unknown>, label: string, problems: CardProblem[]): ApiExample {
	return {
		requestBody: readBody(entry['requestBody']),
		responseBody: readBody(entry['responseBody']),
		requestType: readText(entry['requestType']) ?? '',
		responseType: readText(entry['responseType']) ?? '',
		requestMetadata: readMetadata(entry['requestMetadata'], label + ' 的 requestMetadata', problems),
		responseMetadata: readMetadata(entry['responseMetadata'], label + ' 的 responseMetadata', problems),
		requestHighlights: readHighlights(entry['requestHighlights'], label + ' 的 requestHighlights', problems),
		responseHighlights: readHighlights(entry['responseHighlights'], label + ' 的 responseHighlights', problems),
	};
}

function hasBody(example: ApiExample): boolean {
	return example.requestBody.trim() !== '' || example.responseBody.trim() !== '';
}

function readExamples(
	value: unknown,
	entry: Record<string, unknown>,
	label: string,
	problems: CardProblem[],
): ApiExample[] {
	const list = isUnknownArray(value) ? value : [];
	if (list.length === 0) {
		// Hand written shape: the bodies sit on the endpoint itself.
		const single = readExample(entry, label + ' 的示例 1', problems);
		return hasBody(single) ? [single] : [];
	}
	const examples: ApiExample[] = [];
	for (let index = 0; index < list.length; index += 1) {
		const item = list[index];
		const itemLabel = label + ' 的示例 ' + String(index + 1);
		if (!isRecord(item)) {
			problems.push({ message: itemLabel + '：必须是对象', line: null });
			continue;
		}
		examples.push(readExample(item, itemLabel, problems));
	}
	return examples;
}

/**
 * Parse an api-endpoints block.
 *
 * The block content is a JSON array of endpoints (or an object with an
 * `endpoints` array). Everything is validated entry by entry, so one broken
 * endpoint does not hide the others.
 */
export function parseEndpoints(source: string): ApiParseResult {
	const text = source.trim();
	if (text === '') return { endpoints: [], problems: [{ message: '端点块是空的', line: null }] };

	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			endpoints: [],
			problems: [{ message: 'JSON 解析失败：' + message, line: lineOfJsonError(text, error) }],
		};
	}

	let list: unknown[] | null = null;
	if (isUnknownArray(parsed)) {
		list = parsed;
	} else if (isRecord(parsed)) {
		const inner = parsed['endpoints'];
		if (isUnknownArray(inner)) {
			list = inner;
		} else if (parsed['endpoint'] !== undefined || parsed['url'] !== undefined || parsed['method'] !== undefined) {
			// Convenience: a single endpoint may be written as one object.
			list = [parsed];
		}
	}
	if (list === null) {
		return {
			endpoints: [],
			problems: [{ message: '顶层必须是端点数组，或带 endpoints 数组的对象', line: null }],
		};
	}

	const problems: CardProblem[] = [];
	const endpoints: ApiEndpoint[] = [];
	for (let index = 0; index < list.length; index += 1) {
		const label = '第 ' + String(index + 1) + ' 个端点';
		const entry = list[index];
		if (!isRecord(entry)) {
			problems.push({ message: label + '：必须是对象', line: null });
			continue;
		}
		const endpoint = readText(entry['endpoint']) ?? readText(entry['url']) ?? '';
		if (endpoint === '') problems.push({ message: label + '：缺少 endpoint', line: null });
		const method = (readText(entry['method']) ?? 'GET').toUpperCase();
		endpoints.push({
			method: method,
			endpoint: endpoint,
			condition: readText(entry['condition']) ?? '',
			examples: readExamples(entry['examples'], entry, label, problems),
		});
	}

	return { endpoints: endpoints, problems: problems };
}
