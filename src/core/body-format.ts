import type { ApiHighlight } from './types';

export interface BodySegment {
	text: string;
	/** null means "no highlight", otherwise a CSS colour. */
	color: string | null;
}

const DEFAULT_HIGHLIGHT = 'var(--text-accent)';

function looksLikeJson(text: string): boolean {
	return (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
}

/**
 * Pretty print a body and pick the fence language for it.
 *
 * The declared content type wins; when there is none, the shape of the text
 * decides. A body that fails to parse is passed through untouched rather than
 * dropped, so a malformed example is still visible.
 */
export function formatBody(body: string, contentType: string): { language: string; text: string } {
	const trimmed = body.trim();
	if (trimmed === '') return { language: 'plaintext', text: '' };
	const type = contentType.toLowerCase();

	if (type.includes('json') || (type === '' && looksLikeJson(trimmed))) {
		try {
			const parsed: unknown = JSON.parse(trimmed) as unknown;
			return { language: 'json', text: JSON.stringify(parsed, null, 2) ?? trimmed };
		} catch {
			return { language: 'json', text: trimmed };
		}
	}
	if (type.includes('xml')) return { language: 'xml', text: trimmed.replace(/></g, '>\n<') };
	if (type.includes('html')) return { language: 'html', text: trimmed };
	return { language: 'plaintext', text: trimmed };
}

/**
 * Split text into coloured and plain segments.
 *
 * Highlights are per line with character offsets. Out of range or overlapping
 * entries are clipped instead of throwing, and the plain text is never
 * duplicated: the walk keeps a cursor that only moves forward.
 */
export function splitHighlights(text: string, highlights: readonly ApiHighlight[]): BodySegment[] {
	const lines = text.split('\n');
	const byLine = new Map<number, ApiHighlight[]>();
	for (const highlight of highlights) {
		if (highlight.line < 0 || highlight.line >= lines.length) continue;
		const list = byLine.get(highlight.line);
		if (list === undefined) byLine.set(highlight.line, [highlight]);
		else list.push(highlight);
	}

	const segments: BodySegment[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		if (index > 0) segments.push({ text: '\n', color: null });
		const line = lines[index] ?? '';
		const marks = byLine.get(index);
		if (marks === undefined || marks.length === 0) {
			segments.push({ text: line, color: null });
			continue;
		}
		let cursor = 0;
		const sorted = marks.slice().sort((a, b) => a.start - b.start);
		for (const mark of sorted) {
			const start = Math.max(cursor, Math.min(mark.start, line.length));
			const end = Math.max(start, Math.min(mark.end, line.length));
			if (start > cursor) segments.push({ text: line.slice(cursor, start), color: null });
			if (end > start) {
				segments.push({
					text: line.slice(start, end),
					color: mark.color === '' ? DEFAULT_HIGHLIGHT : mark.color,
				});
			}
			cursor = Math.max(cursor, end);
		}
		if (cursor < line.length) segments.push({ text: line.slice(cursor), color: null });
	}
	return segments;
}
