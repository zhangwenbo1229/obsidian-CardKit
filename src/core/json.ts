/**
 * Guards for values that come from JSON (settings, data.json, the clipboard)
 * or from the vault.
 *
 * Hand written narrowings keep values as `unknown` instead of `any`: the plugin
 * lints with `@typescript-eslint/no-unsafe-*` at error level, and `JSON.parse`
 * as well as `Array.isArray` (which narrows to `any[]`) would otherwise leak
 * `any` into the rest of the code.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

export function readText(value: unknown): string | null {
	return typeof value === 'string' ? value.trim() : null;
}

export function readNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
