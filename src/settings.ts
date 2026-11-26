import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { syncCardCommands } from './commands/insert-card';
import { parseCardTypes, stringifyCardTypes } from './core/card-types';
import { syncCardProcessors } from './core/processor';
import type { CardTypeDefinition, CardVariable } from './core/types';
import type CardKitPlugin from './main';
import { renderCustomTypesEditor } from './ui/custom-types-editor';

export interface CardKitSettings {
	/** Accent colour for the card chrome; empty string follows the theme. */
	accentColor: string;
	/** Whether the notes panel starts expanded. */
	notesDefaultOpen: boolean;
	/** User defined card types. data.json is their only home. */
	customTypes: CardTypeDefinition[];
	/** Placeholders replaced when copying a card body, e.g. {{ip}}. */
	globalVariables: CardVariable[];
}

export const DEFAULT_SETTINGS: CardKitSettings = {
	accentColor: '',
	notesDefaultOpen: false,
	customTypes: [],
	globalVariables: [],
};

const JSON_PLACEHOLDER = `[
  {
    "id": "apicall",
    "name": "接口调用",
    "aliases": ["api"],
    "defaults": { "language": "bash", "scope": "web" }
  }
]`;

export class CardKitSettingTab extends PluginSettingTab {
	plugin: CardKitPlugin;
	/** Textarea content; null means "show what is saved". */
	private draft: string | null = null;
	private problems: string[] = [];
	private savedMessage: string | null = null;

	constructor(app: App, plugin: CardKitPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('卡片主色')
			.setDesc('留空则跟随主题强调色，也可以填 #7c3aed 这样的色值。')
			.addText((text) =>
				text
					.setPlaceholder('跟随主题')
					.setValue(this.plugin.settings.accentColor)
					.onChange(async (value) => {
						this.plugin.settings.accentColor = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('解析默认展开')
			.setDesc('打开笔记时，「语法解析」面板就是展开的。')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.notesDefaultOpen).onChange(async (value) => {
					this.plugin.settings.notesDefaultOpen = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('自定义卡片类型').setHeading();

		renderCustomTypesEditor(containerEl, {
			types: this.plugin.settings.customTypes,
			update: (next) => this.applyTypes(next),
			refresh: () => {
				this.draft = null;
				this.display();
			},
		});

		const jsonSetting = new Setting(containerEl)
			.setName('JSON 定义')
			.setDesc('一个数组，或形如 { "types": [...] } 的对象；字段 id、name、aliases、defaults。id 会成为代码块语言。')
			.addTextArea((area) => {
				area.inputEl.rows = 12;
				area.inputEl.addClass('card-kit-json-input');
				area.setPlaceholder(JSON_PLACEHOLDER)
					.setValue(this.draft ?? stringifyCardTypes(this.plugin.settings.customTypes))
					.onChange((value) => {
						this.draft = value;
					});
			});
		jsonSetting.settingEl.addClass('card-kit-json-setting');

		new Setting(containerEl)
			.addButton((button) =>
				button
					.setButtonText('校验并保存')
					.setCta()
					.onClick(() => {
						void this.saveTypes();
					}),
			)
			.addButton((button) =>
				button.setButtonText('重新载入').onClick(() => {
					this.draft = null;
					this.problems = [];
					this.savedMessage = null;
					this.display();
				}),
			)
			.addButton((button) =>
				button.setButtonText('清空').onClick(() => {
					this.draft = '';
					this.problems = [];
					this.savedMessage = null;
					this.display();
				}),
			);

		if (this.problems.length > 0) {
			const box = containerEl.createDiv({ cls: 'card-kit-settings-problems' });
			for (const problem of this.problems) {
				box.createDiv({ cls: 'card-kit-settings-problem', text: problem });
			}
		}
		if (this.savedMessage !== null) {
			containerEl.createDiv({ cls: 'card-kit-settings-ok', text: this.savedMessage });
		}

		new Setting(containerEl).setName('全局变量').setHeading();

		const variables = this.plugin.settings.globalVariables;
		for (let index = 0; index < variables.length; index += 1) {
			const variable = variables[index];
			if (variable === undefined) continue;
			const row = new Setting(containerEl).setName('变量 ' + String(index + 1));
			row.settingEl.addClass('card-kit-settings-variable');
			row.addText((text) =>
				text
					.setPlaceholder('{{ip}}')
					.setValue(variable.key)
					.onChange(async (value) => {
						variable.key = value.trim();
						await this.plugin.saveSettings();
					}),
			);
			row.addText((text) =>
				text
					.setPlaceholder('替换成')
					.setValue(variable.value)
					.onChange(async (value) => {
						variable.value = value;
						await this.plugin.saveSettings();
					}),
			);
			row.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('删除这个变量')
					.onClick(async () => {
						this.plugin.settings.globalVariables.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		}

		new Setting(containerEl)
			.setName('新变量')
			.setDesc('复制卡片时 {{key}} 会替换成对应的值；「复制原文」始终给未替换的文本。')
			.addButton((button) =>
				button.setButtonText('添加变量').onClick(async () => {
					this.plugin.settings.globalVariables.push({ key: '', value: '' });
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}

	/** Persist a new type list and re-register what depends on it. */
	private async applyTypes(next: CardTypeDefinition[]): Promise<void> {
		this.plugin.settings.customTypes = next;
		await this.plugin.saveSettings();
		syncCardProcessors(this.plugin);
		syncCardCommands(this.plugin);
	}

	private async saveTypes(): Promise<void> {
		const text = this.draft ?? stringifyCardTypes(this.plugin.settings.customTypes);
		const result = parseCardTypes(text);
		if (result.problems.length > 0) {
			this.problems = result.problems;
			this.savedMessage = null;
			this.display();
			new Notice('自定义卡片类型没有保存，有 ' + String(result.problems.length) + ' 处问题');
			return;
		}
		await this.applyTypes(result.types);
		this.draft = null;
		this.problems = [];
		this.savedMessage = '已保存 ' + String(result.types.length) + ' 个自定义类型；已打开的笔记重新打开后生效。';
		this.display();
		new Notice('已保存 ' + String(result.types.length) + ' 个自定义类型');
	}
}
