/**
 * Frontend progressive enhancement for per-entry Cite / Export panels.
 *
 * Gutenberg's block serializer (`@wordpress/element`'s renderToString) treats
 * `download` as a boolean attribute and drops its value, so the static save()
 * output cannot carry per-format download filenames directly. The intended
 * filename is stored in `data-cite-export-filename` instead; this script copies
 * it onto each link's `download` attribute at runtime.
 *
 * The panel's "Copy citation" button is also enhanced here: the citation text
 * is carried in `data-cite-text`, and this script wires the button to the
 * clipboard. Without JS the button is inert, but the citation is still visible
 * (and selectable) in the entry above it, so nothing is lost — pure progressive
 * enhancement. Likewise the export links still download (with the browser's
 * generic name) without this script, preserving the deactivation-resilient
 * contract.
 *
 * Finally, the panel's visible labels are localized here. save() writes them in
 * fixed English so saved markup is identical in every editor locale; this
 * script swaps each canonical English label for the visitor's translation.
 * Markup saved before that change carries labels already translated at save
 * time, which match no canonical string and are left as they are.
 */

import {
	CITE_EXPORT_LABELS,
	getTranslatedCiteExportLabels,
	getTranslatedLinkFallbackLabel,
	LEGACY_LINK_FALLBACK_LABEL,
} from './lib/cite-export-labels';

const COPY_LABEL_RESET_MS = 2000;

/**
 * Translate a label if it is one of the canonical English strings save()
 * writes; return anything else unchanged.
 *
 * @param {string} text Label text from the markup.
 * @return {string} Label to display.
 */
function localizeLabel(text) {
	const translated = getTranslatedCiteExportLabels();
	const key = Object.keys(CITE_EXPORT_LABELS).find(
		(name) => CITE_EXPORT_LABELS[name] === text
	);

	return key ? translated[key] : text;
}

export function localizeCiteExport(root = document) {
	const labelled = root.querySelectorAll(
		[
			'.bibliography-builder-cite-export-toggle',
			'.bibliography-builder-cite-copy',
			'.bibliography-builder-export-links a',
		]
			.map((selector) => `.bibliography-builder-cite-export ${selector}`)
			.join(', ')
	);

	labelled.forEach((element) => {
		const localized = localizeLabel(element.textContent);
		if (localized !== element.textContent) {
			element.textContent = localized;
		}
	});
}

export function applyExportFilenames(root = document) {
	const links = root.querySelectorAll(
		'.bibliography-builder-cite-export a[data-cite-export-filename]'
	);

	links.forEach((link) => {
		const filename = link.getAttribute('data-cite-export-filename');
		if (filename) {
			link.setAttribute('download', filename);
		}
	});
}

/**
 * Translate the English "Link to publication — <url>" accessible name that
 * older saved markup gives links whose citation has no title.
 *
 * @param {Document|Element} root Root to search.
 */
export function localizeLinkLabels(root = document) {
	const prefix = `${LEGACY_LINK_FALLBACK_LABEL} — `;
	const translated = getTranslatedLinkFallbackLabel();

	if (translated === LEGACY_LINK_FALLBACK_LABEL) {
		return;
	}

	root.querySelectorAll(
		'.bibliography-builder-entry-text a[aria-label]'
	).forEach((link) => {
		const label = link.getAttribute('aria-label');
		if (label.startsWith(prefix)) {
			link.setAttribute(
				'aria-label',
				`${translated} — ${label.slice(prefix.length)}`
			);
		}
	});
}

function writeToClipboard(text) {
	const clipboard =
		typeof window !== 'undefined' && window.navigator
			? window.navigator.clipboard
			: undefined;

	if (clipboard && typeof clipboard.writeText === 'function') {
		return clipboard.writeText(text);
	}

	// Legacy fallback for browsers without the async Clipboard API.
	try {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'absolute';
		textarea.style.left = '-9999px';
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		document.body.removeChild(textarea);
		return Promise.resolve();
	} catch (error) {
		return Promise.reject(error);
	}
}

function showCopied(button) {
	if (typeof button.dataset.copyResetLabel === 'undefined') {
		button.dataset.copyResetLabel = button.textContent;
	}

	button.classList.add('is-copied');
	button.textContent = localizeLabel(
		button.getAttribute('data-copied-label') || CITE_EXPORT_LABELS.copied
	);

	window.clearTimeout(button.copyResetTimer);
	button.copyResetTimer = window.setTimeout(() => {
		button.classList.remove('is-copied');
		button.textContent = button.dataset.copyResetLabel;
	}, COPY_LABEL_RESET_MS);
}

export function attachCiteCopy(root = document) {
	const buttons = root.querySelectorAll(
		'.bibliography-builder-cite-export .bibliography-builder-cite-copy'
	);

	buttons.forEach((button) => {
		if (button.dataset.citeCopyBound === 'true') {
			return;
		}
		button.dataset.citeCopyBound = 'true';

		button.addEventListener('click', () => {
			const text = button.getAttribute('data-cite-text') || '';
			if (!text) {
				return;
			}

			writeToClipboard(text).then(
				() => showCopied(button),
				() => {}
			);
		});
	});
}

if (typeof document !== 'undefined') {
	const enhance = () => {
		localizeCiteExport();
		localizeLinkLabels();
		applyExportFilenames();
		attachCiteCopy();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', enhance);
	} else {
		enhance();
	}
}
