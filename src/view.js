/**
 * Frontend progressive enhancement for per-entry Cite / Export panels.
 *
 * Gutenberg's block serializer (`@wordpress/element`'s renderToString) treats
 * `download` as a boolean attribute and drops its value, so the static save()
 * output cannot carry per-format download filenames directly. The intended
 * filename is stored in `data-cite-export-filename` instead; this script copies
 * it onto each link's `download` attribute at runtime.
 *
 * Without JS (or with the plugin deactivated) the links still download — just
 * with the browser's generic "download" name — so the no-JS, deactivation-
 * resilient contract is preserved. This is pure progressive enhancement.
 */

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

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () =>
			applyExportFilenames()
		);
	} else {
		applyExportFilenames();
	}
}
