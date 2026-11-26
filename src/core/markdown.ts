import { App, Component, MarkdownRenderer } from 'obsidian';

const FENCE_CHAR = '\u0060';
const LANGUAGE_PATTERN = /^[A-Za-z0-9+#._-]+$/;

/** Fence languages that Obsidian does not highlight, mapped to a close match. */
const LANGUAGE_ALIASES: ReadonlyArray<readonly [string, string]> = [
	['yak', 'python'],
	['shell', 'bash'],
	['ps1', 'powershell'],
	['cmd', 'batch'],
];

/**
 * Pick a fence strictly longer than any backtick run in the content, so code
 * that itself contains fences still renders verbatim.
 */
export function safeFence(content: string): string {
	let longest = 0;
	let run = 0;
	for (const char of content) {
		if (char === FENCE_CHAR) {
			run += 1;
			if (run > longest) longest = run;
		} else {
			run = 0;
		}
	}
	const length = Math.max(3, longest + 1);
	return FENCE_CHAR.repeat(length);
}

export function normalizeLanguage(language: string | null): string {
	if (language === null) return 'plaintext';
	const cleaned = language.trim().toLowerCase();
	if (cleaned === '') return 'plaintext';
	for (const pair of LANGUAGE_ALIASES) {
		const [alias, target] = pair;
		if (cleaned === alias) return target;
	}
	return LANGUAGE_PATTERN.test(cleaned) ? cleaned : 'plaintext';
}

/**
 * Render markdown into an element.
 *
 * The component must be a MarkdownRenderChild registered through the post
 * processor context: handing the plugin itself to MarkdownRenderer leaks the
 * rendered children for the lifetime of the app (and is an eslint error).
 */
export async function renderMarkdownString(
	app: App,
	markdown: string,
	el: HTMLElement,
	sourcePath: string,
	component: Component,
): Promise<void> {
	if (markdown.trim() === '') return;
	await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
}

/** Render a code body as a highlighted code block inside the card. */
export async function renderCodeString(
	app: App,
	code: string,
	language: string | null,
	el: HTMLElement,
	sourcePath: string,
	component: Component,
): Promise<void> {
	if (code.trim() === '') return;
	const fence = safeFence(code);
	const body = fence + normalizeLanguage(language) + '\n' + code + '\n' + fence;
	await renderMarkdownString(app, body, el, sourcePath, component);
}
