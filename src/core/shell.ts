/**
 * The card DOM shell.
 *
 * One module owns the element structure and the class names so the renderers,
 * the writer toolbar and styles.css stay in sync.
 */

export interface CardShell {
	root: HTMLElement;
	header: HTMLElement;
	titleArea: HTMLElement;
	/** Step badge and title share this row. */
	titleRow: HTMLElement;
	/** Scope badge and tags share this row. */
	metaRow: HTMLElement;
	descArea: HTMLElement;
	body: HTMLElement;
	footer: HTMLElement;
}

export interface CardShellOptions {
	/** Fence language that produced the card. */
	type: string;
	/** Per-card accent override; empty string keeps the theme value. */
	accentColor: string;
}

export function createCardShell(parent: HTMLElement, options: CardShellOptions): CardShell {
	const root = parent.createDiv({ cls: 'card-kit' });
	root.dataset.cardType = options.type;
	if (options.accentColor !== '') {
		root.setCssProps({ '--card-kit-accent': options.accentColor });
	}

	const header = root.createDiv({ cls: 'card-kit-header' });
	const titleArea = header.createDiv({ cls: 'card-kit-title-area' });
	const titleRow = titleArea.createDiv({ cls: 'card-kit-title-row' });
	const metaRow = titleArea.createDiv({ cls: 'card-kit-meta' });
	const descArea = titleArea.createDiv({ cls: 'card-kit-desc' });
	const body = root.createDiv({ cls: 'card-kit-body' });
	const footer = root.createDiv({ cls: 'card-kit-footer' });

	return {
		root: root,
		header: header,
		titleArea: titleArea,
		titleRow: titleRow,
		metaRow: metaRow,
		descArea: descArea,
		body: body,
		footer: footer,
	};
}
