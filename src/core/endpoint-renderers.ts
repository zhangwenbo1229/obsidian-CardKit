import { App, Component, setIcon } from 'obsidian';
import { formatBody, splitHighlights } from './body-format';
import { addCopyButton } from '../ui/buttons';
import { renderCodeString } from './markdown';
import type { ApiEndpoint, ApiHighlight, ApiMetadata } from './types';

export interface EndpointRenderOptions {
	app: App;
	/** Lifecycle owner; the card processor passes its MarkdownRenderChild. */
	component: Component;
	sourcePath: string;
}

/**
 * Render the endpoint cards of one block.
 *
 * Presentation only: the previous plugin also let the reader edit the method and
 * URL in place and fire a real request from the note. Neither is ported - the
 * first belongs to the edit flow (the card modal rewrites a block from its own
 * source), and the second is a network call the renderer should not make.
 */
export async function renderEndpoints(
	parent: HTMLElement,
	endpoints: readonly ApiEndpoint[],
	options: EndpointRenderOptions,
): Promise<void> {
	const wrapper = parent.createDiv({ cls: 'card-kit-endpoints' });
	for (const endpoint of endpoints) {
		await renderEndpoint(wrapper, endpoint, options);
	}
}

async function renderEndpoint(
	parent: HTMLElement,
	endpoint: ApiEndpoint,
	options: EndpointRenderOptions,
): Promise<void> {
	const card = parent.createDiv({ cls: 'card-kit-endpoint' });

	if (endpoint.condition.trim() !== '') {
		const flow = card.createDiv({ cls: 'card-kit-endpoint-flow' });
		const steps = endpoint.condition
			.split('->')
			.map((step) => step.trim())
			.filter((step) => step !== '');
		for (let index = 0; index < steps.length; index += 1) {
			flow.createDiv({ cls: 'card-kit-endpoint-step', text: steps[index] ?? '' });
			if (index < steps.length - 1) {
				setIcon(flow.createDiv({ cls: 'card-kit-endpoint-arrow' }), 'chevron-right');
			}
		}
		addCopyButton(flow, '复制路径', () => endpoint.condition, '调用路径已复制');
	}

	const header = card.createDiv({ cls: 'card-kit-endpoint-header' });
	const method = header.createDiv({ cls: 'card-kit-endpoint-method', text: endpoint.method });
	method.dataset.method = endpoint.method;
	const url = header.createDiv({
		cls: 'card-kit-endpoint-url',
		text: endpoint.endpoint === '' ? '（没有 endpoint）' : endpoint.endpoint,
	});
	url.setAttribute('title', endpoint.endpoint);
	addCopyButton(header, '复制地址', () => endpoint.endpoint, '接口地址已复制');

	for (let index = 0; index < endpoint.examples.length; index += 1) {
		const example = endpoint.examples[index];
		if (example === undefined) continue;
		const block = card.createDiv({ cls: 'card-kit-endpoint-example' });
		if (endpoint.examples.length > 1) {
			block.createDiv({ cls: 'card-kit-endpoint-example-label', text: '示例 ' + String(index + 1) });
		}
		await renderPane(block, '请求', example.requestBody, example.requestType, example.requestMetadata, example.requestHighlights, options);
		await renderPane(block, '响应', example.responseBody, example.responseType, example.responseMetadata, example.responseHighlights, options);
	}
}

async function renderPane(
	parent: HTMLElement,
	label: string,
	body: string,
	contentType: string,
	metadata: readonly ApiMetadata[],
	highlights: readonly ApiHighlight[],
	options: EndpointRenderOptions,
): Promise<void> {
	if (body.trim() === '' && metadata.length === 0) return;
	const pane = parent.createDiv({ cls: 'card-kit-endpoint-pane' });
	const head = pane.createDiv({ cls: 'card-kit-endpoint-pane-head' });
	head.createDiv({ cls: 'card-kit-endpoint-pane-label', text: label });
	for (const meta of metadata) {
		const chip = head.createDiv({ cls: 'card-kit-endpoint-chip', text: meta.text });
		if (meta.color !== '') chip.setCssProps({ '--card-kit-chip-color': meta.color });
	}
	if (body.trim() === '') return;

	const formatted = formatBody(body, contentType);
	if (contentType !== '') head.createDiv({ cls: 'card-kit-endpoint-type', text: formatted.language });
	const code = pane.createDiv({ cls: 'card-kit-endpoint-code' });

	if (highlights.length > 0) {
		// Coloured ranges need our own DOM: MarkdownRenderer escapes the text and
		// gives no hook to wrap a character range.
		const pre = code.createEl('pre', { cls: 'card-kit-endpoint-pre' });
		const element = pre.createEl('code');
		for (const segment of splitHighlights(formatted.text, highlights)) {
			if (segment.color === null) {
				element.appendText(segment.text);
				continue;
			}
			element.createSpan({ text: segment.text }).setCssProps({ color: segment.color });
		}
		return;
	}

	await renderCodeString(options.app, formatted.text, formatted.language, code, options.sourcePath, options.component);
}
