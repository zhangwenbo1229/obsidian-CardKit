import { Setting } from 'obsidian';
import { DEFAULT_TYPE_OPTIONS } from '../core/types';
import type { CardTypeDefinition } from '../core/types';

export interface CustomTypesEditorHost {
	readonly types: readonly CardTypeDefinition[];
	/** Persist the new list and re-register processors and commands. */
	update(next: CardTypeDefinition[]): Promise<void>;
	/** Re-render the settings page. */
	refresh(): void;
}

/** First free id for a freshly added type. */
function nextFreeId(types: readonly CardTypeDefinition[]): string {
	const taken = new Set<string>();
	for (const type of types) {
		taken.add(type.id);
		for (const alias of type.aliases) taken.add(alias);
	}
	if (!taken.has('newtype')) return 'newtype';
	let serial = 2;
	while (taken.has('newtype-' + String(serial))) serial += 1;
	return 'newtype-' + String(serial);
}

/**
 * Editable list of custom card types.
 *
 * The JSON box below is the power user path; this form exists so a type can be
 * adjusted without hand writing JSON. Every change rewrites the whole list and
 * saves, which is also why ticking a box clears an unsaved JSON draft.
 */
export function renderCustomTypesEditor(
	container: HTMLElement,
	host: CustomTypesEditorHost,
): void {
	if (host.types.length === 0) {
		container.createDiv({
			cls: 'card-kit-hint',
			text: '还没有自定义类型：用下面的 JSON 定义，或直接添加一个。',
		});
	}

	for (let index = 0; index < host.types.length; index += 1) {
		const type = host.types[index];
		if (type === undefined) continue;
		renderType(container, host, index, type);
	}

	new Setting(container)
		.setName('新类型')
		.setDesc('ID 就是代码块语言，建好后请在 JSON 定义里核对；skeleton 等高级字段也走 JSON。')
		.addButton((button) =>
			button.setButtonText('添加类型').onClick(() => {
				const next = host.types.slice();
				next.push({
					id: nextFreeId(host.types),
					name: '新类型',
					aliases: [],
					defaults: {},
					options: {
						notes: DEFAULT_TYPE_OPTIONS.notes,
						copy: DEFAULT_TYPE_OPTIONS.copy,
					},
					skeleton: '',
				});
				void host.update(next).then(() => {
					host.refresh();
				});
			}),
		);
}

function renderType(
	container: HTMLElement,
	host: CustomTypesEditorHost,
	index: number,
	type: CardTypeDefinition,
): void {
	const commit = (mutate: (draft: CardTypeDefinition) => void): void => {
		const draft: CardTypeDefinition = {
			id: type.id,
			name: type.name,
			aliases: type.aliases.slice(),
			defaults: { ...type.defaults },
			options: { notes: type.options.notes, copy: type.options.copy },
			skeleton: type.skeleton,
		};
		mutate(draft);
		const next = host.types.slice();
		next[index] = draft;
		void host.update(next);
	};

	new Setting(container)
		.setName('类型 ' + String(index + 1) + '：' + (type.name === '' ? type.id : type.name))
		.setDesc('代码块语言 ' + type.id)
		.addExtraButton((button) =>
			button
				.setIcon('trash')
				.setTooltip('删除这个类型')
				.onClick(() => {
					const next = host.types.slice();
					next.splice(index, 1);
					void host.update(next).then(() => {
						host.refresh();
					});
				}),
		);

	new Setting(container)
		.setName('显示名')
		.addText((text) =>
			text.setValue(type.name).onChange((value) => {
				commit((draft) => {
					draft.name = value.trim();
				});
			}),
		);

	new Setting(container)
		.setName('别名')
		.setDesc('逗号分隔；别名同样能触发这种卡片。')
		.addText((text) =>
			text.setValue(type.aliases.join(', ')).onChange((value) => {
				commit((draft) => {
					draft.aliases = value
						.split(',')
						.map((part) => part.trim().toLowerCase())
						.filter((part) => part !== '');
				});
			}),
		);

	const defaults = type.defaults;
	new Setting(container)
		.setName('默认 scope')
		.addText((text) =>
			text
				.setPlaceholder('例如 web')
				.setValue(defaults.scope ?? '')
				.onChange((value) => {
					commit((draft) => {
						setDefault(draft, 'scope', value);
					});
				}),
		);
	new Setting(container)
		.setName('默认语言')
		.addText((text) =>
			text
				.setPlaceholder('例如 bash')
				.setValue(defaults.language ?? '')
				.onChange((value) => {
					commit((draft) => {
						setDefault(draft, 'language', value);
					});
				}),
		);
	new Setting(container)
		.setName('默认说明')
		.addText((text) =>
			text
				.setPlaceholder('块没写 description 时用它')
				.setValue(defaults.description ?? '')
				.onChange((value) => {
					commit((draft) => {
						setDefault(draft, 'description', value);
					});
				}),
		);

	new Setting(container)
		.setName('显示注解面板')
		.addToggle((toggle) =>
			toggle.setValue(type.options.notes).onChange((value) => {
				commit((draft) => {
					draft.options.notes = value;
				});
			}),
		);

	new Setting(container)
		.setName('显示复制按钮')
		.addToggle((toggle) =>
			toggle.setValue(type.options.copy).onChange((value) => {
				commit((draft) => {
					draft.options.copy = value;
				});
			}),
		);
}

function setDefault(
	draft: CardTypeDefinition,
	key: 'scope' | 'language' | 'description',
	raw: string,
): void {
	const value = raw.trim();
	if (value === '') {
		delete draft.defaults[key];
		return;
	}
	draft.defaults[key] = value;
}
