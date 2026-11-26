/**
 * CardKit core data model.
 *
 * Everything that crosses a module boundary lives here so the splitter, the
 * field renderers, the shell and the writer agree on one shape.
 */

/** A single notes row: what kind of token it is, the token, and what it does. */
export interface CardNote {
	kind: string;
	token: string;
	note: string;
}

/**
 * Header values after normalisation.
 *
 * Absent fields are `null` (never `undefined`) so callers only need one check.
 */
export interface CardHeader {
	step: string | null;
	title: string | null;
	description: string | null;
	scope: string | null;
	language: string | null;
	tags: string[];
	notes: CardNote[];
	/** Header keys this build does not consume, kept for custom card types. */
	extra: Map<string, string>;
}

/** Which grammar produced a block's header. */
export type CardSyntax = 'yaml' | 'legacy' | 'plain';

/** A global placeholder replaced when copying, e.g. {{ip}}. */
export interface CardVariable {
	/** Key, with or without the braces. */
	key: string;
	/** Replacement text. */
	value: string;
}

/** A non-fatal parse problem, with the line of the block source (0 based). */
export interface CardProblem {
	message: string;
	/** null when the problem cannot be pinned to a line (e.g. bad JSON shape). */
	line: number | null;
}

/** Metadata chip of a request or response, e.g. a content type. */
export interface ApiMetadata {
	text: string;
	/** Empty string falls back to the theme accent. */
	color: string;
}

/** A character range inside one line of a body, coloured on render. */
export interface ApiHighlight {
	line: number;
	start: number;
	end: number;
	color: string;
}

/** One request/response pair of an endpoint. */
export interface ApiExample {
	requestBody: string;
	responseBody: string;
	requestType: string;
	responseType: string;
	requestMetadata: ApiMetadata[];
	responseMetadata: ApiMetadata[];
	requestHighlights: ApiHighlight[];
	responseHighlights: ApiHighlight[];
}

/** One entry of an api-endpoints block. */
export interface ApiEndpoint {
	method: string;
	endpoint: string;
	/** Free form flow, "登录 -> 取用户 -> 返回"; arrows are drawn between steps. */
	condition: string;
	examples: ApiExample[];
}

/** A fenced block after splitting and header parsing. */
export interface CardBlock {
	/** Fence language that produced the block: card, the legacy payload, or a custom type id. */
	type: string;
	header: CardHeader;
	/** Verbatim body: everything after the closing header fence. */
	body: string;
	/** Original block source, exactly as written in the note. */
	source: string;
	/** yaml: --- header; legacy: v1 micro syntax; plain: no header at all. */
	syntax: CardSyntax;
	/** Resolved rendering switches of the type that owns this fence language. */
	options: CardTypeOptions;
	/** Verbatim text before the body (yaml header or v1 meta region); null when there is none. */
	leadingText: string | null;
	/** Non-fatal parse problems, surfaced on the card so bad headers stay visible. */
	problems: CardProblem[];
}

/** Header fields a card type may preset. */
export interface CardTypeDefaults {
	scope?: string;
	language?: string;
	description?: string;
}

/** Per-type rendering switches. */
export interface CardTypeOptions {
	/** Render the annotation panel for blocks of this type. */
	notes: boolean;
	/** Show the copy buttons in the footer. */
	copy: boolean;
}

/** What a type gets when it says nothing. */
export const DEFAULT_TYPE_OPTIONS: CardTypeOptions = {
	notes: true,
	copy: true,
};

/** A user defined card type, stored in the plugin's data.json. */
export interface CardTypeDefinition {
	/** Fence language, unique, lower case. */
	id: string;
	/** Display name for the settings page. */
	name: string;
	/** Extra fence languages that render this type. */
	aliases: string[];
	/** Fields applied when a block does not set them itself. */
	defaults: CardTypeDefaults;
	/** Rendering switches for blocks of this type. */
	options: CardTypeOptions;
	/** Body the insert command starts from; empty means the built-in text. */
	skeleton: string;
}

/** Factory so every module starts from the same empty header. */
export function createEmptyHeader(): CardHeader {
	return {
		step: null,
		title: null,
		description: null,
		scope: null,
		language: null,
		tags: [],
		notes: [],
		extra: new Map<string, string>(),
	};
}
