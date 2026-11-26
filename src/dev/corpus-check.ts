/**
 * Read-only corpus check over a real vault.
 *
 * Scans every markdown note (never writes anything), pulls out the card fences,
 * pushes them through the pure pipeline and compares the result with a faithful
 * copy of the 1.x parser. The point is to see, on the real corpus, exactly which
 * blocks CardKit parses differently and why - and to fail loudly if a block
 * loses content.
 *
 * Usage: bash scripts/corpus.sh [vault-root]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildCardBlock } from '../core/card-block';
import type { CardBlock } from '../core/types';

const DEFAULT_VAULT = 'D:/Documents/zhang';
const IGNORED_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);
const CARD_LANGUAGES = new Set(['payload', 'card']);

interface BlockRef {
	path: string;
	line: number;
	language: string;
	source: string;
}

interface LegacyFields {
	step: string | null;
	title: string | null;
	description: string;
	scope: string | null;
	language: string | null;
	notes: string[];
	code: string;
}

interface Diff {
	category: string;
	path: string;
	line: number;
	detail: string;
}

function walk(dir: string, out: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		console.warn('跳过无法读取的目录：' + dir);
		return;
	}
	for (const name of entries) {
		if (IGNORED_DIRS.has(name)) continue;
		const full = join(dir, name);
		let isDirectory = false;
		try {
			isDirectory = statSync(full).isDirectory();
		} catch {
			continue;
		}
		if (isDirectory) {
			walk(full, out);
		} else if (name.toLowerCase().endsWith('.md')) {
			out.push(full);
		}
	}
}

/** Pull every fenced block out of one note. */
function collectBlocks(path: string, text: string): BlockRef[] {
	const lines = text.split(/\r?\n/);
	const blocks: BlockRef[] = [];
	let language: string | null = null;
	let startLine = 0;
	let buffer: string[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (language === null) {
			const opening = /^\s*```+\s*([A-Za-z0-9_-]*)\s*$/.exec(line);
			if (opening !== null) {
				language = (opening[1] ?? '').toLowerCase();
				startLine = index + 1;
				buffer = [];
			}
			continue;
		}
		if (/^\s*```+\s*$/.test(line)) {
			blocks.push({ path: path, line: startLine, language: language, source: buffer.join('\n') });
			language = null;
			buffer = [];
			continue;
		}
		buffer.push(line);
	}
	return blocks;
}

/**
 * The 1.x parser, copied line for line (only the types are tightened).
 * It never stopped at a blank line, which is exactly the behaviour CardKit fixes.
 */
function parsePayloadV1(source: string): LegacyFields {
	const lines = source.split('\n');
	let step: string | null = null;
	let title: string | null = null;
	let scope: string | null = null;
	let language: string | null = null;
	let description = '';
	let code = '';
	const notes: string[] = [];
	let inCode = false;

	for (const line of lines) {
		if (!inCode) {
			const trimmed = line.trim();
			const stepMatch = trimmed.match(/^\[(\d+)\]/);
			if (stepMatch) {
				step = stepMatch[1] ?? null;
			} else if (trimmed.startsWith('# ')) {
				title = trimmed.substring(2).trim();
			} else if (trimmed.startsWith('>')) {
				let text = trimmed.substring(1);
				if (text.startsWith(' ')) text = text.substring(1);
				description += text + '\n';
			} else if (trimmed.startsWith('@ ')) {
				scope = trimmed.substring(2).trim();
			} else if (trimmed.startsWith('$ ')) {
				language = trimmed.substring(2).trim();
			} else if (trimmed.startsWith('? ')) {
				const parts = trimmed.substring(2).split('|').map((part) => part.trim());
				if (parts.length >= 3) {
					notes.push((parts[0] ?? '') + '|' + (parts[1] ?? '') + '|' + parts.slice(2).join('|'));
				}
			} else if (trimmed === '') {
				// The 1.x parser kept looking for meta after a blank line.
			} else {
				inCode = true;
				code += line + '\n';
			}
		} else {
			code += line + '\n';
		}
	}

	return {
		step: step,
		title: title,
		description: description.trim(),
		scope: scope,
		language: language,
		notes: notes,
		code: code.trim(),
	};
}

/**
 * Name a difference so the report separates intended fixes from regressions.
 * A class starting with OTHER or LOST means a human has to look at it.
 */
function classify(category: string, before: string, after: string, parsed: CardBlock): string {
	if (category === 'title') {
		// The 1.x parser let a later "# " line replace the title: the text it used
		// is now (correctly) part of the body.
		const stolen =
			before !== '' && parsed.body.split('\n').some((line) => line.trim() === '# ' + before);
		if (stolen) return 'title-旧解析器把正文标题当标题';
		// "# | 说明" wrapped annotation tails were headings to the old parser.
		if (before.startsWith('|')) return 'title-旧解析器把注解续行当标题';
		return 'OTHER title';
	}
	if (category === 'body') {
		if (after.trim() === before) return 'body-旧解析器多做了首尾 trim';
		if (before === '') return 'body-旧解析器正文为空';
		if (after.includes(before)) return 'body-被吞进包头的正文已归还';
		// Lines that used to sit in the code area but are annotations now live in
		// the notes list (the continuation rule): check they were not dropped.
		const noteText = parsed.header.notes
			.map((note) => note.kind + ' | ' + note.token + ' | ' + note.note)
			.join('\n');
		const description = parsed.header.description ?? '';
		let checked = 0;
		let found = 0;
		for (const raw of before.split('\n')) {
			const line = raw.trim();
			if (line === '') continue;
			checked += 1;
			const asNote = line.replace(/^\?\s*/, '');
			if (after.includes(line) || noteText.includes(asNote) || description.includes(line)) found += 1;
		}
		if (checked > 0 && found === checked) return 'body-旧正文里的注解行归位为注解';
		return 'OTHER body';
	}
	if (category === 'notes') {
		const oldList = before === '' ? [] : before.split('\n');
		const newList = after === '' ? [] : after.split('\n');
		// Every annotation the old parser found must still be there; extra ones
		// are the "? " lines it used to drop. Order may shift when a new note
		// is inserted in front, so compare as a multiset.
		const remaining = newList.slice();
		let missing = 0;
		for (const note of oldList) {
			const at = remaining.indexOf(note);
			if (at === -1) {
				missing += 1;
			} else {
				remaining.splice(at, 1);
			}
		}
		if (missing === 0 && newList.length >= oldList.length) return 'notes-多保留了注解';
		if (missing === 0) return 'OTHER notes（同集合不同数量）';
		return 'LOST notes';
	}
	return 'OTHER ' + category;
}

function main(): void {
	const vault = process.argv[2] ?? DEFAULT_VAULT;
	const files: string[] = [];
	walk(vault, files);

	const byLanguage = new Map<string, number>();
	const bySyntax = new Map<string, number>();
	const diffCounts = new Map<string, number>();
	const samples: Diff[] = [];
	const otherSamples: Diff[] = [];
	let notesTotal = 0;
	let legacyBlocks = 0;
	let affectedBlocks = 0;
	let parsedBlocks = 0;
	let notesWithCards = 0;
	let parseFailures = 0;
	let contentLoss = 0;
	let totalDiff = 0;

	for (const file of files) {
		let text: string;
		try {
			text = readFileSync(file, 'utf8');
		} catch {
			console.warn('跳过无法读取的文件：' + file);
			continue;
		}
		if (!text.includes('```payload') && !text.includes('```card')) continue;
		notesWithCards += 1;

		for (const block of collectBlocks(file, text)) {
			if (!CARD_LANGUAGES.has(block.language)) continue;
			parsedBlocks += 1;
			byLanguage.set(block.language, (byLanguage.get(block.language) ?? 0) + 1);

			let parsed: CardBlock;
			try {
				parsed = buildCardBlock(block.language, block.source, []);
			} catch (error) {
				parseFailures += 1;
				console.log('解析异常 ' + file + ':' + String(block.line) + ' ' + String(error));
				continue;
			}
			bySyntax.set(parsed.syntax, (bySyntax.get(parsed.syntax) ?? 0) + 1);
			notesTotal += parsed.header.notes.length;

			// Content preservation: every body line must still exist in the source.
			for (const line of parsed.body.split('\n')) {
				if (line.trim() === '') continue;
				if (!block.source.includes(line)) {
					contentLoss += 1;
					console.log('正文可能丢行 ' + file + ':' + String(block.line) + ' ' + JSON.stringify(line.slice(0, 70)));
					break;
				}
			}

			if (parsed.syntax !== 'legacy') continue;
			legacyBlocks += 1;
			const reference = parsePayloadV1(block.source);
			const newNotes = parsed.header.notes.map((note) => note.kind + '|' + note.token + '|' + note.note);
			const fields: Array<[string, string, string]> = [
				['title', reference.title ?? '', parsed.header.title ?? ''],
				['description', reference.description, parsed.header.description ?? ''],
				['scope', reference.scope ?? '', parsed.header.scope ?? ''],
				['language', reference.language ?? '', parsed.header.language ?? ''],
				['body', reference.code, parsed.body],
				['notes', reference.notes.join('\n'), newNotes.join('\n')],
			];

			let blockDiffers = false;
			for (const field of fields) {
				const [category, before, after] = field;
				if (before === after) continue;
				blockDiffers = true;
				totalDiff += 1;
				const kind = classify(category, before, after, parsed);
				diffCounts.set(kind, (diffCounts.get(kind) ?? 0) + 1);
				const sample: Diff = {
					category: kind,
					path: file.slice(vault.length + 1),
					line: block.line,
					detail:
						kind +
						' 旧=' +
						JSON.stringify(before.slice(0, 80)) +
						' 新=' +
						JSON.stringify(after.slice(0, 80)),
				};
				if (kind.startsWith('OTHER') || kind.startsWith('LOST')) {
					if (otherSamples.length < 25) otherSamples.push(sample);
				} else if (samples.length < 10) {
					samples.push(sample);
				}
			}
			if (blockDiffers) affectedBlocks += 1;
		}
	}

	const format = (counts: Map<string, number>): string => {
		const parts: string[] = [];
		for (const entry of counts) parts.push(entry[0] + '=' + String(entry[1]));
		return parts.join(' ') || '（无）';
	};

	console.log('语料对账（只读）：' + vault);
	console.log('扫描 .md ' + String(files.length) + ' 篇，其中含卡片块 ' + String(notesWithCards) + ' 篇');
	console.log('卡片块 ' + String(parsedBlocks) + ' 个：' + format(byLanguage));
	console.log('语法分布：' + format(bySyntax) + '（yaml=有 --- 包头，legacy=v1 微语法，plain=纯代码）');
	console.log('解析出的注解条目 ' + String(notesTotal) + ' 条；v1 块 ' + String(legacyBlocks) + ' 个');
	let suspicious = 0;
	for (const entry of diffCounts) {
		if (entry[0].startsWith('OTHER') || entry[0].startsWith('LOST')) suspicious += entry[1];
	}

	console.log('受影响块 ' + String(affectedBlocks) + ' / ' + String(legacyBlocks) + '；字段差异 ' + String(totalDiff) + ' 处');
	console.log('差异分类：' + format(diffCounts));
	if (samples.length > 0) {
		console.log('每类抽样（最多 10 条）：');
		for (const sample of samples) {
			console.log('  ' + sample.path + ':' + String(sample.line) + '  ' + sample.detail);
		}
	}
	if (otherSamples.length > 0) {
		console.log('待人工确认（OTHER / LOST，最多 25 条）：');
		for (const sample of otherSamples) {
			console.log('  ' + sample.path + ':' + String(sample.line) + '  ' + sample.detail);
		}
	}
	console.log('解析异常 ' + String(parseFailures) + ' 个；正文疑似丢行 ' + String(contentLoss) + ' 个；待确认差异 ' + String(suspicious) + ' 处');
	const pass = parseFailures === 0 && contentLoss === 0 && suspicious === 0;
	console.log(pass ? '结果：PASS' : '结果：FAIL');
	if (!pass) process.exitCode = 1;
}

main();
