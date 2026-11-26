import { Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import { buildCardBlock, collectLanguages, ENDPOINT_LANGUAGE } from '../core/card-block';
import { fenceLanguage, findFenceAtCursor, formatCardBlock } from '../core/write-ops';
import { applyToEditor } from '../core/writer';
import type CardKitPlugin from '../main';

interface FoundCard {
	startLine: number;
	endLine: number;
	inner: string;
	language: string;
}

/**
 * Register the "tidy this card" command once per plugin instance.
 *
 * It only touches the editor buffer, so the change is a single undo step and it
 * cannot race with the note on disk. The file level writer in core/writer.ts is
 * what the card UI will use once a card can be edited from the reading view.
 */
export function registerFormatCardCommand(plugin: CardKitPlugin, known: Set<string>): void {
	if (known.has('format-card')) return;
	known.add('format-card');
	plugin.addCommand({
		id: 'format-card',
		name: '规整光标所在的卡片',
		editorCheckCallback: (checking, editor) => {
			const found = cardBlockAtCursor(plugin, editor);
			if (found === null) return false;
			if (!checking) applyFormat(plugin, editor, found);
			return true;
		},
	});
}

/** The card block the cursor sits in, or null when that is not a card block. */
export function cardBlockAtCursor(plugin: CardKitPlugin, editor: Editor): FoundCard | null {
	const located = findFenceAtCursor(editor.getValue(), editor.getCursor().line);
	if (located === null) return null;
	const language = fenceLanguage(editor.getLine(located.startLine));
	// Endpoint blocks hold JSON, not a card header: nothing to tidy there.
	if (language === ENDPOINT_LANGUAGE) return null;
	if (!collectLanguages(plugin.settings.customTypes).includes(language)) return null;
	return {
		startLine: located.startLine,
		endLine: located.endLine,
		inner: located.inner,
		language: language,
	};
}

function applyFormat(plugin: CardKitPlugin, editor: Editor, found: FoundCard): void {
	const block = buildCardBlock(found.language, found.inner, plugin.settings.customTypes);
	const next = formatCardBlock(block);
	if (next === found.inner) {
		new Notice('这张卡片已经是规整的');
		return;
	}
	const outcome = applyToEditor(
		editor,
		{ startLine: found.startLine, endLine: found.endLine },
		found.inner,
		next,
	);
	new Notice(outcome.ok ? '已规整卡片' : outcome.reason);
}
