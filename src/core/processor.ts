import { MarkdownPostProcessorContext, MarkdownRenderChild, Notice, setIcon } from 'obsidian';
import type { MarkdownSectionInformation } from 'obsidian';
import type CardKitPlugin from '../main';
import { buildCardBlock, collectLanguages, ENDPOINT_LANGUAGE } from './card-block';
import { parseEndpoints } from './endpoint-parser';
import { renderEndpoints } from './endpoint-renderers';
import { renderCodeString, normalizeLanguage } from './markdown';
import { createCardShell } from './shell';
import {
	renderDescription,
	renderNotesPanel,
	renderProblems,
	renderScopeBadge,
	renderStepBadge,
	renderTags,
	renderTitle,
} from './field-renderers';
import type { NotesPanel } from './field-renderers';
import { substituteVariables } from './variables';
import { locateCardBlock, saveCardInner } from './writer';
import type { CardBlock, CardProblem, CardVariable } from './types';
import { CardEditModal } from '../ui/card-edit-modal';
import { addCopyButton } from '../ui/buttons';

/** Fence languages already handed to Obsidian, per plugin instance. */
const registeredLanguages = new WeakMap<CardKitPlugin, Set<string>>();

/**
 * Register a processor for every fence language that does not have one yet.
 *
 * Safe to call again after the settings change: existing handlers stay put and
 * only languages new to the settings get added. A language removed from the
 * settings keeps its handler until the plugin reloads; it then renders like any
 * other unknown fence (no definition, so no defaults are applied).
 */
export function syncCardProcessors(plugin: CardKitPlugin): void {
	let known = registeredLanguages.get(plugin);
	if (known === undefined) {
		known = new Set<string>();
		registeredLanguages.set(plugin, known);
	}
	for (const language of collectLanguages(plugin.settings.customTypes)) {
		if (known.has(language)) continue;
		known.add(language);
		plugin.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) =>
			processBlock(plugin, language, source, el, ctx),
		);
	}
}

/** Endpoint blocks carry JSON, not a card header, so they render separately. */
async function processBlock(
	plugin: CardKitPlugin,
	language: string,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): Promise<void> {
	if (language === ENDPOINT_LANGUAGE) {
		await processEndpoints(plugin, source, el, ctx);
		return;
	}
	await processCardBlock(plugin, language, source, el, ctx);
}

async function processEndpoints(
	plugin: CardKitPlugin,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): Promise<void> {
	const child = new MarkdownRenderChild(el);
	ctx.addChild(child);
	const parsed = parseEndpoints(source);
	if (parsed.endpoints.length > 0) {
		await renderEndpoints(el, parsed.endpoints, {
			app: plugin.app,
			component: child,
			sourcePath: ctx.sourcePath,
		});
	}
	const sectionInfo = ctx.getSectionInfo(el);
	renderProblems(el, parsed.problems.map((problem) => formatProblem(problem, sectionInfo)));
}

async function processCardBlock(
	plugin: CardKitPlugin,
	fenceLanguage: string,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): Promise<void> {
	const block = buildCardBlock(fenceLanguage, source, plugin.settings.customTypes);
	const shell = createCardShell(el, {
		type: block.type,
		accentColor: plugin.settings.accentColor,
	});

	// The rendered markdown must live in a component tied to this section.
	const child = new MarkdownRenderChild(shell.root);
	ctx.addChild(child);

	renderStepBadge(shell.titleRow, block.header.step);
	renderTitle(shell.titleRow, block.header.title);
	renderScopeBadge(shell.metaRow, block.header.scope);
	renderTags(shell.metaRow, block.header.tags);
	await renderDescription(plugin.app, shell.descArea, block.header.description, ctx.sourcePath, child);

	const language = block.header.language;
	if (language !== null && language.trim() !== '') {
		shell.footer.createDiv({ cls: 'card-kit-lang', text: normalizeLanguage(language) });
	}

	const sectionInfo = ctx.getSectionInfo(el);
	const problemTexts = block.problems.map((problem) => formatProblem(problem, sectionInfo));

	const notesOpen = plugin.settings.notesDefaultOpen;
	const notesPanel = block.options.notes
		? renderNotesPanel(shell.body, block.header.notes, notesOpen)
		: null;
	const actions = shell.footer.createDiv({ cls: 'card-kit-actions' });
	addEditButton(actions, plugin, block, ctx, el, problemTexts);
	if (notesPanel !== null) {
		addNotesButton(actions, notesPanel, notesOpen);
	}
	if (block.options.copy) {
		addCopyButtons(actions, block.body, plugin.settings.globalVariables);
	}

	const codeArea = shell.body.createDiv({ cls: 'card-kit-code' });
	await renderCodeString(plugin.app, block.body, language, codeArea, ctx.sourcePath, child);

	renderProblems(shell.footer, problemTexts);

	if (!hasHeaderContent(block)) shell.header.detach();
	// Nothing to show (no language badge, no buttons, no problems): drop the bar.
	if (shell.footer.childElementCount === 0) shell.footer.detach();
}

function hasHeaderContent(block: CardBlock): boolean {
	const header = block.header;
	return (
		header.step !== null ||
		header.title !== null ||
		header.description !== null ||
		header.scope !== null ||
		header.tags.length > 0 ||
		header.notes.length > 0
	);
}

/**
 * Open the editor for this card.
 *
 * The location is resolved on click: the element is attached by then, which is
 * what Obsidian needs to answer getSectionInfo.
 */
function addEditButton(
	parent: HTMLElement,
	plugin: CardKitPlugin,
	block: CardBlock,
	ctx: MarkdownPostProcessorContext,
	el: HTMLElement,
	problems: readonly string[],
): void {
	const button = parent.createEl('button', { cls: 'card-kit-btn' });
	setIcon(button.createSpan({ cls: 'card-kit-btn-icon' }), 'pencil');
	button.createSpan({ text: '编辑' });
	button.addEventListener('click', () => {
		const location = locateCardBlock(plugin.app.vault, ctx, el);
		if (location === null) {
			new Notice('无法定位代码块位置，请重新打开这篇笔记再试');
			return;
		}
		new CardEditModal(plugin.app, {
			block: block,
			problems: problems,
			save: (newInner) => saveCardInner(plugin.app, location, block.source, newInner),
		}).open();
	});
}

function addNotesButton(parent: HTMLElement, panel: NotesPanel, initiallyOpen: boolean): void {
	const button = parent.createEl('button', { cls: 'card-kit-btn' });
	setIcon(button.createSpan({ cls: 'card-kit-btn-icon' }), 'book-open');
	const label = button.createSpan({ text: notesLabel(initiallyOpen, panel.count) });
	button.setAttribute('aria-controls', panel.id);
	button.setAttribute('aria-expanded', initiallyOpen ? 'true' : 'false');
	button.addEventListener('click', () => {
		const nowVisible = panel.toggle();
		label.setText(notesLabel(nowVisible, panel.count));
		button.setAttribute('aria-expanded', nowVisible ? 'true' : 'false');
	});
}

/** Toggle caption, with the number of annotations so it is worth clicking. */
function notesLabel(open: boolean, count: number): string {
	return (open ? '收起解析' : '语法解析') + ' (' + String(count) + ')';
}

/**
 * Point at the offending line: the line number in the file when Obsidian tells
 * us where the block starts, the line inside the block otherwise.
 */
function formatProblem(problem: CardProblem, info: MarkdownSectionInformation | null): string {
	if (problem.line === null) return problem.message;
	const line = info === null ? problem.line + 1 : info.lineStart + problem.line + 2;
	return '第 ' + String(line) + ' 行：' + problem.message;
}

/**
 * Copy the body, with {{placeholders}} replaced when global variables exist.
 * The raw variant is only offered when there is something to replace, so the
 * footer does not grow a useless button.
 */
function addCopyButtons(parent: HTMLElement, body: string, variables: readonly CardVariable[]): void {
	const replaces = variables.length > 0;
	addCopyButton(
		parent,
		'复制',
		() => (replaces ? substituteVariables(body, variables) : body),
		replaces ? '代码已复制（变量已替换）' : '代码已复制',
	);
	if (replaces) {
		addCopyButton(parent, '复制原文', () => body, '已复制未替换的原文');
	}
}


