import type { Editor } from 'obsidian';
import { collectLanguages, findDefinition, PRIMARY_LANGUAGE } from '../core/card-block';
import { buildCardSkeleton } from '../core/skeleton';
import type CardKitPlugin from '../main';
import { registerFormatCardCommand } from './format-card';

/** Command ids already registered, per plugin instance. */
const registeredCommands = new WeakMap<CardKitPlugin, Set<string>>();

/**
 * Register one insert command per fence language CardKit answers to.
 *
 * Called at load and again when the custom types change; only languages without
 * a command yet get one, so a removed type keeps its command until the plugin
 * reloads (the same trade-off as the code block processors). The legacy payload
 * alias deliberately gets no command: new notes should use card.
 */
export function syncCardCommands(plugin: CardKitPlugin): void {
	let known = registeredCommands.get(plugin);
	if (known === undefined) {
		known = new Set<string>();
		registeredCommands.set(plugin, known);
	}

	const labels = new Map<string, string>();
	labels.set(PRIMARY_LANGUAGE, '卡片');
	for (const type of plugin.settings.customTypes) {
		if (type.id !== '' && !labels.has(type.id)) labels.set(type.id, type.name);
	}

	for (const language of collectLanguages(plugin.settings.customTypes)) {
		const label = labels.get(language);
		if (label === undefined) continue;
		const id = 'insert-' + language + '-skeleton';
		if (known.has(id)) continue;
		known.add(id);
		plugin.addCommand({
			id: id,
			name: '插入' + label + '骨架',
			editorCallback: (editor: Editor) => {
				insertSkeleton(plugin, editor, language);
			},
		});
	}

	registerFormatCardCommand(plugin, known);
}

/**
 * Insert the skeleton at the cursor and select the title placeholder, so the
 * reader can type the real title straight over it.
 */
export function insertSkeleton(plugin: CardKitPlugin, editor: Editor, language: string): void {
	const skeleton = buildCardSkeleton(
		language,
		findDefinition(language, plugin.settings.customTypes),
	);
	const from = editor.getCursor('from');
	editor.replaceSelection(skeleton.text);
	const line = from.line + skeleton.titleLine;
	const ch = (skeleton.titleLine === 0 ? from.ch : 0) + skeleton.titleStart;
	editor.setSelection({ line: line, ch: ch }, { line: line, ch: ch + skeleton.titleLength });
}
