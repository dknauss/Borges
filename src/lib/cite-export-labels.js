/**
 * Labels for the per-entry Cite / Export panel.
 *
 * Gutenberg re-validates a static block's saved markup against save() in the
 * *current* editor's locale, so a translated label baked into post content
 * makes the block invalid for an editor in any other locale. save() therefore
 * writes these canonical English strings, and the frontend view script swaps
 * in the visitor's translation at runtime.
 */
import { __ } from '@wordpress/i18n';

export const CITE_EXPORT_LABELS = Object.freeze({
	toggle: 'Cite / Export',
	copy: 'Copy citation',
	copied: 'Copied',
	ris: 'RIS',
	cslJson: 'CSL-JSON',
	bibtex: 'BibTeX',
	biblatex: 'BibLaTeX',
});

/**
 * The Cite / Export labels in the current locale.
 *
 * @return {Object} Labels keyed as CITE_EXPORT_LABELS.
 */
export function getTranslatedCiteExportLabels() {
	return {
		toggle: __('Cite / Export', 'borges-bibliography-builder'),
		copy: __('Copy citation', 'borges-bibliography-builder'),
		copied: __('Copied', 'borges-bibliography-builder'),
		ris: __('RIS', 'borges-bibliography-builder'),
		cslJson: __('CSL-JSON', 'borges-bibliography-builder'),
		bibtex: __('BibTeX', 'borges-bibliography-builder'),
		biblatex: __('BibLaTeX', 'borges-bibliography-builder'),
	};
}

/**
 * Accessible-name prefix that markup saved before labels were made
 * locale-independent gives links whose citation has no title. The current
 * save() writes no such label.
 */
export const LEGACY_LINK_FALLBACK_LABEL = 'Link to publication';

export function getTranslatedLinkFallbackLabel() {
	return __('Link to publication', 'borges-bibliography-builder');
}
