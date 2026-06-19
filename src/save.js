/**
 * Static save function for the Bibliography block.
 *
 * Produces semantic HTML with a DPUB-ARIA bibliography role, JSON-LD by default,
 * and optional CSL-JSON / COinS layers.
 * All output is baked into post content — no PHP render_callback.
 */

import { renderBibliographySave } from './save-markup';

export default function save({ attributes }) {
	return renderBibliographySave(attributes, {
		sortEntries: true,
		headingTag: 'p',
		entryTag: 'cite',
		includeCiteExport: attributes.outputCiteExport ?? false,
	});
}
