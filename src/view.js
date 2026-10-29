/**
 * Frontend Cite / Export panels.
 *
 * save() does not write the panel into post content. Email clients, feed
 * readers, and other places that show post content without this script and
 * the block's stylesheet would display it expanded and unusable. Each entry
 * carries the panel's data in `data-cite-*` attributes instead, and
 * buildCiteExportPanels() builds the panel here, after the entry text:
 * a `<details>` toggle with a "Copy citation" button and RIS, CSL-JSON, and
 * (when the editor computed them) BibTeX and BibLaTeX downloads.
 *
 * Markup saved before then carries the panel itself. Its download links keep
 * their filename in `data-cite-export-filename`, because Gutenberg's
 * serializer writes `download` as a bare boolean attribute, and
 * applyExportFilenames() copies it back. attachCiteCopy() wires every copy
 * button, built or saved, to the clipboard.
 *
 * Labels are English unless the block's render filter
 * (includes/frontend-labels.php) supplies translations in the section's
 * `data-cite-labels` attribute, so this script needs no `wp-i18n`.
 */

const DEFAULT_LABELS = Object.freeze( {
	toggle: 'Cite / Export',
	copy: 'Copy citation',
	copied: 'Copied',
	ris: 'RIS',
	cslJson: 'CSL-JSON',
	bibtex: 'BibTeX',
	biblatex: 'BibLaTeX',
} );

/**
 * Downloads offered for an entry, in panel order: data attribute, media type,
 * filename suffix, and label key.
 */
const EXPORT_FORMATS = Object.freeze( [
	[ 'citeRis', 'application/x-research-info-systems', '.ris', 'ris' ],
	[
		'citeCslJson',
		'application/vnd.citationstyles.csl+json',
		'.csl.json',
		'cslJson',
	],
	[ 'citeBibtex', 'text/x-bibtex', '.bib', 'bibtex' ],
	[ 'citeBiblatex', 'text/x-bibtex', '.biblatex.bib', 'biblatex' ],
] );

function getLabels( entry ) {
	const section = entry.closest( '[data-cite-labels]' );

	if ( ! section ) {
		return DEFAULT_LABELS;
	}

	try {
		const translated = JSON.parse(
			section.getAttribute( 'data-cite-labels' )
		);

		return { ...DEFAULT_LABELS, ...translated };
	} catch {
		return DEFAULT_LABELS;
	}
}

function createElement( tag, className, text ) {
	const element = document.createElement( tag );

	if ( className ) {
		element.className = className;
	}

	if ( typeof text === 'string' ) {
		element.textContent = text;
	}

	return element;
}

/**
 * Build the Cite / Export panel for every entry that carries its data.
 *
 * @param {Document|Element} root Where to look.
 */
export function buildCiteExportPanels( root = document ) {
	const entries = root.querySelectorAll( 'li[data-cite-ris]' );

	entries.forEach( ( entry ) => {
		if (
			entry.querySelector( ':scope > .bibliography-builder-cite-export' )
		) {
			return;
		}

		const labels = getLabels( entry );
		const base = entry.dataset.citeFilename || 'citation';
		const details = createElement(
			'details',
			'bibliography-builder-cite-export'
		);
		const panel = createElement(
			'div',
			'bibliography-builder-cite-export-panel'
		);
		const copy = createElement(
			'button',
			'bibliography-builder-cite-copy',
			labels.copy
		);
		const links = createElement(
			'ul',
			'bibliography-builder-export-links'
		);
		// Its markers are hidden: without the role, Safari reads no list.
		links.setAttribute( 'role', 'list' );

		details.appendChild(
			createElement(
				'summary',
				'bibliography-builder-cite-export-toggle',
				labels.toggle
			)
		);

		copy.type = 'button';
		copy.setAttribute( 'aria-live', 'polite' );
		copy.setAttribute( 'data-cite-text', entry.dataset.citeText || '' );
		copy.setAttribute( 'data-copied-label', labels.copied );
		panel.appendChild( copy );

		EXPORT_FORMATS.forEach( ( [ key, mime, suffix, labelKey ] ) => {
			const body = entry.dataset[ key ];

			if ( ! body ) {
				return;
			}

			const item = document.createElement( 'li' );
			const link = createElement( 'a', null, labels[ labelKey ] );

			link.href = `data:${ mime };charset=utf-8,${ encodeURIComponent(
				body
			) }`;
			link.setAttribute( 'download', base + suffix );
			link.setAttribute( 'data-cite-export-filename', base + suffix );
			link.rel = 'noopener';
			item.appendChild( link );
			links.appendChild( item );
		} );

		panel.appendChild( links );
		details.appendChild( panel );
		entry.appendChild( details );
	} );
}

const COPY_LABEL_RESET_MS = 2000;

export function applyExportFilenames( root = document ) {
	const links = root.querySelectorAll(
		'.bibliography-builder-cite-export a[data-cite-export-filename]'
	);

	links.forEach( ( link ) => {
		const filename = link.getAttribute( 'data-cite-export-filename' );
		if ( filename ) {
			link.setAttribute( 'download', filename );
		}
	} );
}

function writeToClipboard( text ) {
	const clipboard =
		typeof window !== 'undefined' && window.navigator
			? window.navigator.clipboard
			: undefined;

	if ( clipboard && typeof clipboard.writeText === 'function' ) {
		return clipboard.writeText( text );
	}

	// Legacy fallback for browsers without the async Clipboard API.
	try {
		const textarea = document.createElement( 'textarea' );
		textarea.value = text;
		textarea.setAttribute( 'readonly', '' );
		textarea.style.position = 'absolute';
		textarea.style.left = '-9999px';
		document.body.appendChild( textarea );
		textarea.select();
		document.execCommand( 'copy' );
		document.body.removeChild( textarea );
		return Promise.resolve();
	} catch ( error ) {
		return Promise.reject( error );
	}
}

function showCopied( button ) {
	if ( typeof button.dataset.copyResetLabel === 'undefined' ) {
		button.dataset.copyResetLabel = button.textContent;
	}

	button.classList.add( 'is-copied' );
	button.textContent = button.getAttribute( 'data-copied-label' ) || 'Copied';

	window.clearTimeout( button.copyResetTimer );
	button.copyResetTimer = window.setTimeout( () => {
		button.classList.remove( 'is-copied' );
		button.textContent = button.dataset.copyResetLabel;
	}, COPY_LABEL_RESET_MS );
}

export function attachCiteCopy( root = document ) {
	const buttons = root.querySelectorAll(
		'.bibliography-builder-cite-export .bibliography-builder-cite-copy'
	);

	buttons.forEach( ( button ) => {
		if ( button.dataset.citeCopyBound === 'true' ) {
			return;
		}
		button.dataset.citeCopyBound = 'true';

		button.addEventListener( 'click', () => {
			const text = button.getAttribute( 'data-cite-text' ) || '';
			if ( ! text ) {
				return;
			}

			writeToClipboard( text ).then(
				() => showCopied( button ),
				() => {}
			);
		} );
	} );
}

if ( typeof document !== 'undefined' ) {
	const enhance = () => {
		buildCiteExportPanels();
		applyExportFilenames();
		attachCiteCopy();
	};

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', enhance );
	} else {
		enhance();
	}
}
