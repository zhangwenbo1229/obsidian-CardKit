import { Notice, setIcon } from 'obsidian';

/** Copy text to the clipboard, reporting the outcome. */
export async function copyText(text: string, message: string): Promise<void> {
	if (text.trim() === '') {
		new Notice('这里没有可复制的内容');
		return;
	}
	try {
		await navigator.clipboard.writeText(text);
		new Notice(message);
	} catch (error) {
		console.error('CardKit: 复制失败', error);
		new Notice('复制失败，请检查剪贴板权限');
	}
}

/** Button with a leading icon that copies whatever `text()` returns. */
export function addCopyButton(
	parent: HTMLElement,
	label: string,
	text: () => string,
	message: string,
): HTMLButtonElement {
	const button = parent.createEl('button', { cls: 'card-kit-btn' });
	setIcon(button.createSpan({ cls: 'card-kit-btn-icon' }), 'copy');
	button.createSpan({ text: label });
	button.addEventListener('click', () => {
		void copyText(text(), message);
	});
	return button;
}
