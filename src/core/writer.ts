import { App, Editor, MarkdownPostProcessorContext, MarkdownView, TFile, Vault } from 'obsidian';
import { applyBlockInner, rebuildCardInner } from './write-ops';
import type { CardBlock } from './types';

/** Where a rendered card sits inside its note. */
export interface CardBlockLocation {
	file: TFile;
	/** 0-based line of the opening fence. */
	startLine: number;
	/** 0-based line of the closing fence. */
	endLine: number;
}

export type WriteOutcome = { ok: true } | { ok: false; reason: string };

/** Resolve the note and line range behind a rendered card. */
export function locateCardBlock(
	vault: Vault,
	ctx: MarkdownPostProcessorContext,
	el: HTMLElement,
): CardBlockLocation | null {
	const info = ctx.getSectionInfo(el);
	if (info === null) return null;
	const file = vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile)) return null;
	return { file: file, startLine: info.lineStart, endLine: info.lineEnd };
}

/** The editor currently showing this note, if any. */
export function findEditorFor(app: App, path: string): Editor | null {
	let found: Editor | null = null;
	app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file !== null && view.file.path === path) {
			found = view.editor;
		}
	});
	return found;
}

/**
 * Write through an open editor.
 *
 * Preferred over the file whenever the note is open: the change lands in the
 * buffer (so it is one undo step) and cannot race with an unsaved edit that the
 * editor is about to flush over the file.
 */
export function applyToEditor(
	editor: Editor,
	location: { startLine: number; endLine: number },
	expectedInner: string,
	newInner: string,
): WriteOutcome {
	const applied = applyBlockInner(editor.getValue(), location, expectedInner, newInner);
	if (!applied.ok) return { ok: false, reason: applied.reason };
	// Up to the start of the closing fence, so the newline has to be put back.
	editor.replaceRange(
		newInner + '\n',
		{ line: location.startLine + 1, ch: 0 },
		{ line: location.endLine, ch: 0 },
	);
	return { ok: true };
}

/** Atomic file write that refuses when the block is no longer what we last saw. */
export async function writeCardInner(
	vault: Vault,
	location: CardBlockLocation,
	expectedInner: string,
	newInner: string,
): Promise<WriteOutcome> {
	const state: { reason: string | null } = { reason: null };
	await vault.process(location.file, (data) => {
		const applied = applyBlockInner(
			data,
			{ startLine: location.startLine, endLine: location.endLine },
			expectedInner,
			newInner,
		);
		if (!applied.ok) {
			state.reason = applied.reason;
			return data;
		}
		return applied.text;
	});
	if (state.reason !== null) return { ok: false, reason: state.reason };
	return { ok: true };
}

/** Save block text: through the open editor when there is one, else the file. */
export async function saveCardInner(
	app: App,
	location: CardBlockLocation,
	expectedInner: string,
	newInner: string,
): Promise<WriteOutcome> {
	const editor = findEditorFor(app, location.file.path);
	if (editor !== null) {
		return applyToEditor(editor, location, expectedInner, newInner);
	}
	return writeCardInner(app.vault, location, expectedInner, newInner);
}

/** Rebuilt block text for a body (and optionally a header) edit. */
export function innerForEdit(
	block: CardBlock,
	options: { body: string; headerText?: string },
): string {
	return rebuildCardInner(block, options);
}
