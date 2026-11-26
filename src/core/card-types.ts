import { isRecord, isUnknownArray, readText } from './json';
import type { CardTypeDefaults, CardTypeDefinition, CardTypeOptions } from './types';

/** Fence languages CardKit owns; a custom type may not shadow them. */
export const RESERVED_LANGUAGES: readonly string[] = ['card', 'payload', 'api-endpoints'];

/** Fence safe id: lower case, starts with a letter. */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface CardTypeParseResult {
	types: CardTypeDefinition[];
	problems: string[];
}

function readAliases(value: unknown, label: string, problems: string[]): string[] {
	if (value === undefined || value === null) return [];
	if (!isUnknownArray(value)) {
		problems.push(label + '：aliases 必须是字符串数组');
		return [];
	}
	const aliases: string[] = [];
	for (const entry of value) {
		const alias = readText(entry);
		if (alias === null || alias === '') {
			problems.push(label + '：aliases 里只能放非空字符串');
			continue;
		}
		const normalized = alias.toLowerCase();
		if (!ID_PATTERN.test(normalized)) {
			problems.push(label + '：别名 "' + alias + '" 只能用小写字母、数字和短横线，且以字母开头');
			continue;
		}
		aliases.push(normalized);
	}
	return aliases;
}

const DEFAULT_KEYS: readonly string[] = ['scope', 'language', 'description'];
const OPTION_KEYS: readonly string[] = ['notes', 'copy'];

/** Rendering switches; anything missing keeps its default. */
function readOptions(value: unknown, label: string, problems: string[]): CardTypeOptions {
	const options: CardTypeOptions = { notes: true, copy: true };
	if (value === undefined || value === null) return options;
	if (!isRecord(value)) {
		problems.push(label + '：options 必须是对象');
		return options;
	}
	if (typeof value['notes'] === 'boolean') options.notes = value['notes'];
	if (typeof value['copy'] === 'boolean') options.copy = value['copy'];
	for (const key of Object.keys(value)) {
		if (!OPTION_KEYS.includes(key)) {
			problems.push(label + '：options 里不支持的字段 ' + key);
		}
	}
	return options;
}

/** Body text for the insert command; a fence inside it would break the block. */
function readSkeleton(value: unknown, label: string, problems: string[]): string {
	const text = readText(value);
	if (text === null) return '';
	if (text.includes('```')) {
		problems.push(label + '：skeleton 里不能出现 ``` 围栏');
		return '';
	}
	return text;
}

function readDefaults(value: unknown, label: string, problems: string[]): CardTypeDefaults {
	const defaults: CardTypeDefaults = {};
	if (value === undefined || value === null) return defaults;
	if (!isRecord(value)) {
		problems.push(label + '：defaults 必须是对象');
		return defaults;
	}
	const scope = readText(value['scope']);
	if (scope !== null) defaults.scope = scope;
	const language = readText(value['language']);
	if (language !== null) defaults.language = language;
	const description = readText(value['description']);
	if (description !== null) defaults.description = description;
	for (const key of Object.keys(value)) {
		if (!DEFAULT_KEYS.includes(key)) {
			problems.push(label + '：defaults 里不支持的字段 ' + key);
		}
	}
	return defaults;
}

function parseCardType(
	value: unknown,
	label: string,
	problems: string[],
): CardTypeDefinition | null {
	if (!isRecord(value)) {
		problems.push(label + '：必须是对象');
		return null;
	}
	const rawId = readText(value['id']);
	if (rawId === null || rawId === '') {
		problems.push(label + '：缺少 id');
		return null;
	}
	const id = rawId.toLowerCase();
	if (!ID_PATTERN.test(id)) {
		problems.push(label + '：id 只能用小写字母、数字和短横线，且以字母开头（当前 "' + rawId + '"）');
		return null;
	}
	if (RESERVED_LANGUAGES.includes(id)) {
		problems.push(label + '：id "' + id + '" 是内建块名，不能占用');
		return null;
	}
	return {
		id: id,
		name: readText(value['name']) ?? id,
		aliases: readAliases(value['aliases'], label, problems),
		defaults: readDefaults(value['defaults'], label, problems),
		options: readOptions(value['options'], label, problems),
		skeleton: readSkeleton(value['skeleton'], label, problems),
	};
}

function asTypeList(value: unknown): unknown[] | null {
	if (isUnknownArray(value)) return value;
	if (isRecord(value)) {
		const inner = value['types'];
		if (isUnknownArray(inner)) return inner;
	}
	return null;
}

/** Validate an already parsed value (array, or an object carrying `types`). */
export function validateCardTypes(value: unknown): CardTypeParseResult {
	const list = asTypeList(value);
	if (list === null) {
		return { types: [], problems: ['顶层必须是数组，或形如 { "types": [...] } 的对象'] };
	}
	const problems: string[] = [];
	const types: CardTypeDefinition[] = [];
	/** Fence language -> the label that claimed it, for collision reporting. */
	const owners = new Map<string, string>();

	for (let index = 0; index < list.length; index += 1) {
		const label = '第 ' + String(index + 1) + ' 项';
		const definition = parseCardType(list[index], label, problems);
		if (definition === null) continue;

		const claims: Array<readonly [string, string]> = [[definition.id, 'id']];
		for (const alias of definition.aliases) claims.push([alias, '别名']);

		let usable = true;
		for (const claim of claims) {
			const [language, where] = claim;
			if (RESERVED_LANGUAGES.includes(language)) {
				problems.push(label + '：' + where + ' "' + language + '" 是内建块名');
				usable = false;
				continue;
			}
			const owner = owners.get(language);
			if (owner !== undefined) {
				problems.push(label + '：' + where + ' "' + language + '" 与 ' + owner + ' 冲突');
				usable = false;
			}
		}
		if (!usable) continue;

		for (const claim of claims) owners.set(claim[0], label);
		types.push(definition);
	}

	return { types: types, problems: problems };
}

/** Parse the settings textarea. An empty box means "no custom types". */
export function parseCardTypes(text: string): CardTypeParseResult {
	const trimmed = text.trim();
	if (trimmed === '') return { types: [], problems: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as unknown;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { types: [], problems: ['JSON 解析失败：' + reason] };
	}
	return validateCardTypes(parsed);
}

/**
 * Coerce a value that came from data.json (which users may hand edit).
 * Invalid entries are dropped and reported once, never trusted.
 */
export function coerceCardTypes(value: unknown): CardTypeDefinition[] {
	const result = validateCardTypes(value);
	if (result.problems.length > 0) {
		console.warn('CardKit: data.json 里的自定义卡片类型被忽略：' + result.problems.join('；'));
	}
	return result.types;
}

/** Export for the settings textarea: stable key order, one entry per object. */
export function stringifyCardTypes(types: readonly CardTypeDefinition[]): string {
	const plain = [];
	for (const type of types) {
		const entry: Record<string, unknown> = {
			id: type.id,
			name: type.name,
			aliases: type.aliases.slice(),
			defaults: { ...type.defaults },
			options: { notes: type.options.notes, copy: type.options.copy },
		};
		if (type.skeleton !== '') entry['skeleton'] = type.skeleton;
		plain.push(entry);
	}
	return JSON.stringify(plain, null, 2);
}