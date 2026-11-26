import { isRecord, isUnknownArray, readText } from './json';
import type { CardVariable } from './types';

/** Validate the global variables that came out of data.json. */
export function coerceVariables(value: unknown): CardVariable[] {
	if (!isUnknownArray(value)) return [];
	const variables: CardVariable[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const key = readText(entry['key']);
		if (key === null || key === '') continue;
		const replacement = entry['value'];
		variables.push({
			key: key,
			value: typeof replacement === 'string' ? replacement : '',
		});
	}
	return variables;
}

/**
 * Replace {{key}} placeholders using the configured global variables.
 *
 * Plain string splitting on purpose: no regex, so a key with regex characters
 * cannot blow up and cannot accidentally match more than it should. A key may
 * be configured with or without the braces. Unknown placeholders stay as they
 * are, so a half filled settings list never destroys a payload.
 */
export function substituteVariables(text: string, variables: readonly CardVariable[]): string {
	if (variables.length === 0) return text;
	let result = text;
	for (const variable of variables) {
		const key = variable.key.trim();
		if (key === '') continue;
		const placeholder =
			key.startsWith('{{') && key.endsWith('}}') ? key : '{{' + key + '}}';
		if (placeholder === '{{}}') continue;
		result = result.split(placeholder).join(variable.value);
	}
	return result;
}

/** Variable keys that actually occur in the text, for the settings hint. */
export function findPlaceholders(text: string, variables: readonly CardVariable[]): string[] {
	const found: string[] = [];
	for (const variable of variables) {
		const key = variable.key.trim();
		if (key === '') continue;
		const placeholder =
			key.startsWith('{{') && key.endsWith('}}') ? key : '{{' + key + '}}';
		if (placeholder === '{{}}') continue;
		if (text.includes(placeholder) && !found.includes(placeholder)) found.push(placeholder);
	}
	return found;
}
