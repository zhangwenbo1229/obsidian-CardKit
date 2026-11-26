import { splitCardBlock } from './block-splitter';
import { parseCardHeader } from './header-parser';
import { parseLegacyPayload } from './legacy-parser';
import { createEmptyHeader, DEFAULT_TYPE_OPTIONS } from './types';
import type { CardBlock, CardTypeDefinition, CardTypeOptions, CardSyntax } from './types';

/** The canonical fence language. */
export const PRIMARY_LANGUAGE = 'card';
/** The v1 fence language, kept as a permanent alias for existing notes. */
export const LEGACY_LANGUAGE = 'payload';
/** Endpoint cards: the block content is a JSON array, not a card header. */
export const ENDPOINT_LANGUAGE = 'api-endpoints';

/** Every fence language the plugin answers to: the two built-ins plus custom types. */
export function collectLanguages(customTypes: readonly CardTypeDefinition[]): string[] {
	const languages = new Set<string>([PRIMARY_LANGUAGE, LEGACY_LANGUAGE, ENDPOINT_LANGUAGE]);
	for (const type of customTypes) {
		if (type.id !== '') languages.add(type.id);
		for (const alias of type.aliases) {
			if (alias !== '') languages.add(alias);
		}
	}
	return Array.from(languages);
}

export function findDefinition(
	language: string,
	customTypes: readonly CardTypeDefinition[],
): CardTypeDefinition | null {
	for (const type of customTypes) {
		if (type.id === language) return type;
		for (const alias of type.aliases) {
			if (alias === language) return type;
		}
	}
	return null;
}

/**
 * Split and parse one block.
 *
 * Pure: no DOM and no Obsidian API, so the exact same path runs in the plugin,
 * in the smoke test and in the corpus check over the whole vault.
 *
 * Grammar per fence language:
 * - card / custom types: a --- fenced header, or nothing but code.
 * - payload: a --- fenced header wins; without one the v1 micro syntax applies,
 *   which is what keeps the thousands of existing blocks working.
 */
export function buildCardBlock(
	fenceLanguage: string,
	source: string,
	customTypes: readonly CardTypeDefinition[],
): CardBlock {
	const split = splitCardBlock(source);
	const problems = split.problems.slice();
	let header = createEmptyHeader();
	let body = split.bodyText;
	let syntax: CardSyntax = 'plain';
	let leadingText: string | null = null;

	if (split.headerText !== null) {
		syntax = 'yaml';
		leadingText = split.headerText;
		const parsed = parseCardHeader(split.headerText);
		header = parsed.header;
		// Header problems carry a line relative to the header text; shift them into
		// block coordinates so the card can point at the offending line.
		for (const problem of parsed.problems) {
			problems.push({
				message: problem.message,
				line: problem.line === null ? null : problem.line + split.headerOpenLine + 1,
			});
		}
	} else if (fenceLanguage === LEGACY_LANGUAGE) {
		const parsedLegacy = parseLegacyPayload(source);
		body = parsedLegacy.body;
		if (parsedLegacy.hasMeta) {
			syntax = 'legacy';
			leadingText = parsedLegacy.metaText;
			header = parsedLegacy.header;
			for (const problem of parsedLegacy.problems) problems.push(problem);
		}
	}

	const definition = findDefinition(fenceLanguage, customTypes);
	let options: CardTypeOptions = DEFAULT_TYPE_OPTIONS;
	if (definition !== null) {
		options = definition.options;
		header.scope = header.scope ?? definition.defaults.scope ?? null;
		header.language = header.language ?? definition.defaults.language ?? null;
		header.description = header.description ?? definition.defaults.description ?? null;
	}

	return {
		type: fenceLanguage,
		syntax: syntax,
		options: options,
		leadingText: leadingText,
		header: header,
		body: body,
		source: source,
		problems: problems,
	};
}
