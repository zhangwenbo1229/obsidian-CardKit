import { Plugin } from 'obsidian';
import { syncCardCommands } from './commands/insert-card';
import { coerceCardTypes } from './core/card-types';
import { syncCardProcessors } from './core/processor';
import { coerceVariables } from './core/variables';
import { CardKitSettingTab, DEFAULT_SETTINGS } from './settings';
import { CardHeaderSuggest } from './ui/header-suggest';
import type { CardKitSettings } from './settings';

/**
 * CardKit turns fenced code blocks into cards.
 *
 * The plugin itself only wires lifecycle: the block grammar lives in
 * src/core/block-splitter.ts and src/core/header-parser.ts, the DOM in
 * src/core/shell.ts and src/core/field-renderers.ts.
 */
export default class CardKitPlugin extends Plugin {
	settings: CardKitSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new CardKitSettingTab(this.app, this));
		syncCardProcessors(this);
		syncCardCommands(this);
		this.registerEditorSuggest(new CardHeaderSuggest(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<CardKitSettings> | null;
		const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
		// data.json is user editable: re-validate every value before trusting it.
		this.settings = {
			accentColor:
				typeof merged.accentColor === 'string'
					? merged.accentColor.trim()
					: DEFAULT_SETTINGS.accentColor,
			notesDefaultOpen: merged.notesDefaultOpen === true,
			customTypes: coerceCardTypes(merged.customTypes),
			globalVariables: coerceVariables(merged.globalVariables),
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
