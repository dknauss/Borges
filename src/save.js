/**
 * Static save function for the Bibliography block.
 *
 * Produces semantic HTML with a DPUB-ARIA bibliography role, JSON-LD by default,
 * and optional CSL-JSON / COinS layers.
 * All output is baked into post content — no PHP render_callback — so it
 * carries no translated strings: the editor re-validates it in whatever locale
 * the next editor uses. The frontend view script localizes the visible labels.
 */

import {
	LOCALE_INDEPENDENT_SAVE_LABELS,
	renderBibliographySave,
} from './save-markup';

export default function save({ attributes }) {
	return renderBibliographySave(attributes, {
		sortEntries: true,
		headingTag: 'p',
		entryTag: 'cite',
		includeCiteExport: attributes.outputCiteExport ?? false,
		labels: LOCALE_INDEPENDENT_SAVE_LABELS,
	});
}
