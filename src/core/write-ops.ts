import type { CardBlock } from './types';

/** A fenced block located in a text buffer. */
export interface LocatedBlock {
	startLine: number;
	endLine: number;
	inner: string;
}

export type ApplyOutcome = { ok: true; text: string } | { ok: false; reason: string };

const FENCE_PATTERN = /^\s*```/;

/** Fence lines of a buffer, in order. */
function fenceLines(lines: readonly string[]): number[] {
	const found: number[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		if (FENCE_PATTERN.test(lines[index] ?? '')) found.push(index);
	}
	return found;
}

/** The fenced block the cursor line sits in, if any. */
export function findFenceAtCursor(text: string, line: number): LocatedBlock | null {
	const lines = text.split(/\r?\n/);
	const fences = fenceLines(lines);
	for (let pair = 0; pair + 1 < fences.length; pair += 2) {
		const start = fences[pair] ?? -1;
		const end = fences[pair + 1] ?? -1;
		if (start <= line && line <= end) {
			return { startLine: start, endLine: end, inner: lines.slice(start + 1, end).join('\n') };
		}
	}
	return null;
}

/** Fence language of an opening fence line. */
export function fenceLanguage(openingLine: string): string {
	return openingLine.trim().replace(/^```+/, '').trim().toLowerCase();
}

/**
 * Put newInner between the fences of one block.
 *
 * `expectedInner` is what the caller last saw. Anything else means the note was
 * edited underneath us, and refusing beats clobbering the reader's work. The
 * file's own line ending is preserved.
 */
export function applyBlockInner(
	data: string,
	location: { startLine: number; endLine: number },
	expectedInner: string,
	newInner: string,
): ApplyOutcome {
	const eol = data.includes('\r\n') ? '\r\n' : '\n';
	const lines = data.split(/\r?\n/);
	const startLine = location.startLine;
	const endLine = location.endLine;
	if (startLine < 0 || endLine <= startLine || endLine >= lines.length) {
		return { ok: false, reason: '定位到的代码块范围不合理，笔记可能已改动' };
	}
	if (!FENCE_PATTERN.test(lines[startLine] ?? '') || !FENCE_PATTERN.test(lines[endLine] ?? '')) {
		return { ok: false, reason: '定位到的行不是代码块围栏，笔记可能已改动' };
	}
	const current = lines.slice(startLine + 1, endLine).join('\n');
	if (current !== expectedInner) {
		return { ok: false, reason: '卡片内容已经变化，为避免覆盖你的改动，本次不写入' };
	}
	const replacement = newInner === '' ? [] : newInner.split(/\r?\n/);
	const next = lines.slice(0, startLine + 1).concat(replacement, lines.slice(endLine));
	return { ok: true, text: next.join(eol) };
}

/** Text between the fences, rebuilt from the pieces we parsed. */
export function rebuildCardInner(
	block: CardBlock,
	options: { body?: string; headerText?: string } = {},
): string {
	const body = (options.body ?? block.body).replace(/[\s\u3000]+$/, '');
	if (block.syntax === 'yaml') {
		const headerText = options.headerText ?? block.leadingText ?? '';
		const head = '---\n' + headerText + '\n---';
		return body === '' ? head : head + '\n' + body;
	}
	if (block.syntax === 'legacy') {
		const meta = options.headerText ?? block.leadingText ?? '';
		if (meta === '') return body;
		return body === '' ? meta : meta + '\n\n' + body;
	}
	return body;
}

/**
 * Canonical inner text: header keys in a stable order, body without trailing
 * whitespace. Unknown keys are kept after the known ones so nothing is lost,
 * and only fields that actually have a value are written (an empty "title:"
 * would come straight back as a parse problem).
 */
export function formatCardBlock(block: CardBlock): string {
	if (block.syntax !== 'yaml') return rebuildCardInner(block);
	return rebuildCardInner(block, { headerText: canonicalHeaderText(block) });
}

/** The parsed header, rewritten in canonical order. */
export function canonicalHeaderText(block: CardBlock): string {
	const header = block.header;
	const lines: string[] = [];
	if (header.step !== null) lines.push('step: ' + header.step);
	if (header.title !== null) lines.push('title: ' + header.title);
	if (header.description !== null) lines.push('description: ' + header.description);
	if (header.scope !== null) lines.push('scope: ' + header.scope);
	if (header.language !== null) lines.push('language: ' + header.language);
	if (header.tags.length > 0) lines.push('tags: [' + header.tags.join(', ') + ']');
	if (header.notes.length > 0) {
		lines.push('notes:');
		for (const note of header.notes) {
			const fields: string[] = [];
			if (note.kind !== '') fields.push('kind: ' + note.kind);
			if (note.token !== '') fields.push('token: ' + note.token);
			if (note.note !== '') fields.push('note: ' + note.note);
			const first = fields[0];
			if (first === undefined) continue;
			lines.push('  - ' + first);
			for (let index = 1; index < fields.length; index += 1) {
				lines.push('    ' + (fields[index] ?? ''));
			}
		}
	}
	for (const entry of header.extra) {
		lines.push(entry[0] + ': ' + entry[1]);
	}
	return lines.join('\n');
}
