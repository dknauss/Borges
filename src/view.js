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
 */

const COPY_LABEL_RESET_MS = 2000;

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
	button.textContent = button.getAttribute('data-copied-label') || 'Copied';

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
		applyExportFilenames();
		attachCiteCopy();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', enhance);
	} else {
		enhance();
	}
}
