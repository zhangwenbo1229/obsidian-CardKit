import { App, Editor, EditorPosition, EditorSuggest, TFile } from 'obsidian';
import type { EditorSuggestContext, EditorSuggestTriggerInfo } from 'obsidian';
import { collectLanguages, ENDPOINT_LANGUAGE } from '../core/card-block';
import { filterHeaderItems, suggestHeaderItems } from '../core/header-suggest';
import type { HeaderSuggestion } from '../core/header-suggest';
import { fenceLanguage, findFenceAtCursor } from '../core/write-ops';
import type CardKitPlugin from '../main';

interface TriggerContext {
	replaceFrom: number;
	query: string;
}

/**
 * Completes card header keys and the two value lists, inside a card's --- header.
 *
 * Obsidian's own EditorSuggest is used rather than a raw CodeMirror completion
 * source: it is the documented extension point, needs no editor dependency and
 * works in both source and live preview. The candidate list itself is built by
 * core/header-suggest.ts, which is pure and covered by the smoke test.
 */
export class CardHeaderSuggest extends EditorSuggest<HeaderSuggestion> {
	private readonly plugin: CardKitPlugin;

	constructor(app: App, plugin: CardKitPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const context = this.headerContext(cursor, editor);
		if (context === null || context.query === '') return null;
		return {
			start: { line: cursor.line, ch: context.replaceFrom },
			end: cursor,
			query: context.query,
		};
	}

	getSuggestions(context: EditorSuggestContext): HeaderSuggestion[] {
		const result = suggestHeaderItems(
			[],
			context.editor.getLine(context.start.line),
			context.end.ch,
		);
		if (result === null) return [];
		return filterHeaderItems(result.items, context.query);
	}

	renderSuggestion(item: HeaderSuggestion, el: HTMLElement): void {
		el.createDiv({ cls: 'card-kit-suggest-label', text: item.label });
		if (item.detail !== '') {
			el.createDiv({ cls: 'card-kit-suggest-detail', text: item.detail });
		}
	}

	selectSuggestion(item: HeaderSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		const context = this.context;
		if (context === null) return;
		context.editor.replaceRange(item.insert, context.start, context.end);
		context.editor.setCursor({
			line: context.start.line,
			ch: context.start.ch + item.insert.length,
		});
		this.close();
	}

	/** Where the cursor sits, if that is inside a card's YAML header. */
	private headerContext(cursor: EditorPosition, editor: Editor): TriggerContext | null {
		const block = findFenceAtCursor(editor.getValue(), cursor.line);
		if (block === null) return null;
		const language = fenceLanguage(editor.getLine(block.startLine));
		if (language === ENDPOINT_LANGUAGE) return null;
		if (!collectLanguages(this.plugin.settings.customTypes).includes(language)) return null;

		const lines = block.inner.split(/\r?\n/);
		if ((lines[0] ?? '').trim() !== '---') return null;
		let close = -1;
		for (let index = 1; index < lines.length; index += 1) {
			if ((lines[index] ?? '').trim() === '---') {
				close = index;
				break;
			}
		}
		if (close === -1) return null;

		// Header line index of the cursor; the header is the lines between the two ---.
		const offset = cursor.line - (block.startLine + 2);
		if (offset < 0 || offset >= close - 1) return null;

		const headersBefore = lines.slice(1, close).slice(0, offset);
		const result = suggestHeaderItems(headersBefore, editor.getLine(cursor.line), cursor.ch);
		if (result === null) return null;
		return { replaceFrom: result.replaceFrom, query: result.query };
	}
}
