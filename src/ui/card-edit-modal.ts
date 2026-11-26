import { App, Modal, Notice, Setting } from 'obsidian';
import { innerForEdit } from '../core/writer';
import type { WriteOutcome } from '../core/writer';
import type { CardBlock } from '../core/types';

export interface CardEditModalOptions {
	block: CardBlock;
	/** Already formatted problem lines, shown as a warning list. */
	problems: readonly string[];
	/** Write the new block text; the modal only closes when it succeeded. */
	save: (newInner: string) => Promise<WriteOutcome>;
}

/**
 * Edit a card's header and body.
 *
 * Saving goes through the same conflict check as every other write, so a note
 * edited elsewhere is refused instead of overwritten - and on a refusal the
 * dialog stays open, because the reader's text is in it.
 */
export class CardEditModal extends Modal {
	private readonly options: CardEditModalOptions;
	private headerValue: string;
	private bodyValue: string;
	private saving = false;

	constructor(app: App, options: CardEditModalOptions) {
		super(app);
		this.options = options;
		this.headerValue = options.block.leadingText ?? '';
		this.bodyValue = options.block.body;
	}

	onOpen(): void {
		this.titleEl.setText('编辑卡片');
		const { contentEl } = this;
		contentEl.empty();

		if (this.options.problems.length > 0) {
			const box = contentEl.createDiv({ cls: 'card-kit-problems' });
			for (const problem of this.options.problems) {
				box.createDiv({ cls: 'card-kit-problem', text: problem });
			}
		}

		const block = this.options.block;
		if (block.leadingText !== null) {
			contentEl.createDiv({
				cls: 'card-kit-edit-note',
				text:
					block.syntax === 'legacy'
						? '包头（v1 微语法，例如 # 标题 / > 描述 / @ Linux）'
						: '包头（两个 --- 之间的内容）',
			});
			new Setting(contentEl).addTextArea((area) => {
				area.inputEl.rows = 6;
				area.inputEl.addClass('card-kit-edit-input');
				area.setValue(this.headerValue).onChange((value) => {
					this.headerValue = value;
				});
			});
		}

		contentEl.createDiv({ cls: 'card-kit-edit-note', text: '正文' });
		new Setting(contentEl).addTextArea((area) => {
			area.inputEl.rows = 14;
			area.inputEl.addClass('card-kit-edit-input');
			area.setValue(this.bodyValue).onChange((value) => {
				this.bodyValue = value;
			});
		});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText('保存')
					.setCta()
					.onClick(() => {
						void this.save();
					}),
			)
			.addButton((button) =>
				button.setButtonText('取消').onClick(() => {
					this.close();
				}),
			);

		this.scope.register(['Mod'], 'Enter', () => {
			void this.save();
			return false;
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		if (this.saving) return;
		const block = this.options.block;
		const options: { body: string; headerText?: string } = { body: this.bodyValue };
		if (block.leadingText !== null) options.headerText = this.headerValue;
		const next = innerForEdit(block, options);
		if (next === block.source) {
			new Notice('卡片没有改动');
			this.close();
			return;
		}
		this.saving = true;
		const outcome = await this.options.save(next);
		this.saving = false;
		if (outcome.ok) {
			new Notice('已保存卡片');
			this.close();
			return;
		}
		new Notice(outcome.reason);
	}
}
