import { App, Component, setIcon } from 'obsidian';
import { renderMarkdownString } from './markdown';
import type { CardNote } from './types';

/** Scope keyword to icon, checked in order on the lower cased scope text. */
const SCOPE_ICONS: ReadonlyArray<readonly [string, string]> = [
	['win', 'layout-dashboard'],
	['linux', 'terminal'],
	['mac', 'command'],
	['apple', 'command'],
	['android', 'smartphone'],
	['ios', 'smartphone'],
	['web', 'globe'],
	['browser', 'globe'],
];

export function scopeIcon(scope: string): string {
	const lowered = scope.toLowerCase();
	for (const pair of SCOPE_ICONS) {
		const [needle, icon] = pair;
		if (lowered.includes(needle)) return icon;
	}
	return 'box';
}

export function renderStepBadge(parent: HTMLElement, step: string | null): void {
	if (step === null || step.trim() === '') return;
	parent.createDiv({ cls: 'card-kit-step', text: step.trim() });
}

export function renderTitle(parent: HTMLElement, title: string | null): void {
	if (title === null || title.trim() === '') return;
	parent.createDiv({ cls: 'card-kit-title', text: title.trim() });
}

export function renderScopeBadge(parent: HTMLElement, scope: string | null): void {
	if (scope === null || scope.trim() === '') return;
	const text = scope.trim();
	const badge = parent.createDiv({ cls: 'card-kit-scope' });
	setIcon(badge.createSpan({ cls: 'card-kit-scope-icon' }), scopeIcon(text));
	badge.createSpan({ cls: 'card-kit-scope-text', text: text });
}

export function renderTags(parent: HTMLElement, tags: readonly string[]): void {
	for (const tag of tags) {
		if (tag.trim() === '') continue;
		parent.createDiv({ cls: 'card-kit-tag', text: tag.trim() });
	}
}

export interface NotesPanel {
	element: HTMLElement;
	/** Panel id, so the toggle button can point aria-controls at it. */
	id: string;
	/** Number of annotation rows, shown on the toggle button. */
	count: number;
	toggle: () => boolean;
}

/** Serial for unique panel ids. */
let notesPanelSerial = 0;

/**
 * Notes are a list of {kind, token, note} rows. They start hidden unless the
 * settings ask for them open. Returns null when there is nothing to show.
 */
export function renderNotesPanel(
	parent: HTMLElement,
	notes: readonly CardNote[],
	defaultOpen: boolean,
): NotesPanel | null {
	if (notes.length === 0) return null;
	notesPanelSerial += 1;
	const element = parent.createDiv({ cls: 'card-kit-notes' });
	element.id = 'card-kit-notes-' + String(notesPanelSerial);
	element.hidden = !defaultOpen;
	element.setAttribute('role', 'list');
	for (const note of notes) {
		const row = element.createDiv({ cls: 'card-kit-note-row' });
		row.setAttribute('role', 'listitem');
		const left = row.createDiv({ cls: 'card-kit-note-left' });
		if (note.token !== '') {
			const token = left.createDiv({ cls: 'card-kit-note-token', text: note.token });
			// The column clips long tokens; the tooltip keeps them readable.
			token.setAttribute('title', note.token);
		}
		if (note.kind !== '') {
			left.createDiv({ cls: 'card-kit-note-kind', text: note.kind });
		}
		if (note.token === '' && note.kind === '') {
			left.addClass('card-kit-note-left-empty');
		}
		row.createDiv({ cls: 'card-kit-note-text', text: note.note === '' ? '—' : note.note });
	}
	const toggle = (): boolean => {
		const visible = element.hidden;
		element.hidden = !visible;
		return visible;
	};
	return { element: element, id: element.id, count: notes.length, toggle: toggle };
}

export async function renderDescription(
	app: App,
	parent: HTMLElement,
	text: string | null,
	sourcePath: string,
	component: Component,
): Promise<void> {
	if (text === null || text.trim() === '') return;
	await renderMarkdownString(app, text, parent, sourcePath, component);
}

/** Parse problems stay on the card instead of only reaching the console. */
export function renderProblems(parent: HTMLElement, problems: readonly string[]): void {
	if (problems.length === 0) return;
	const box = parent.createDiv({ cls: 'card-kit-problems' });
	setIcon(box.createSpan({ cls: 'card-kit-problems-icon' }), 'alert-triangle');
	const list = box.createDiv({ cls: 'card-kit-problems-list' });
	for (const problem of problems) {
		list.createDiv({ cls: 'card-kit-problem', text: problem });
	}
}
