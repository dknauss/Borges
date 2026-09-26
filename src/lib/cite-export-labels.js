/**
 * Labels for the per-entry Cite / Export panel.
 *
 * Gutenberg re-validates a static block's saved markup against save() in the
 * *current* editor's locale, so a translated label baked into post content
 * makes the block invalid for an editor in any other locale. save() therefore
 * writes these canonical English strings, and the block's render filter
 * (includes/frontend-labels.php) translates them for visitors. Keep the PHP
 * list there in step with this one.
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
 * The accessible-name prefix that markup saved before labels were made
 * locale-independent gave links whose citation has no title, in the current
 * locale. Only deprecations use it; the current save() writes no such label.
 *
 * @return {string} Translated label.
 */
export function getTranslatedLinkFallbackLabel() {
	return __('Link to publication', 'borges-bibliography-builder');
}
