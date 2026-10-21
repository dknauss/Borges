/**
 * Static save function for the Bibliography block.
 *
 * Produces semantic HTML with a DPUB-ARIA bibliography role, JSON-LD by default,
 * and optional CSL-JSON / COinS layers. Nothing saved depends on the block's
 * stylesheet or script to read correctly, because email clients and feed
 * readers show post content without them: entries are plain spans (a `<cite>`
 * would italicize the whole reference), and the Cite / Export panel is built
 * by the view script from `data-` attributes rather than saved.
 * All output is baked into post content — no PHP render_callback — so it
 * carries no translated strings: the editor re-validates it in whatever locale
 * the next editor uses. The frontend view script localizes the visible labels.
 */

import { getHeadingTag } from './lib/heading-level';
import {
	LOCALE_INDEPENDENT_SAVE_LABELS,
	renderBibliographySave,
} from './save-markup';

export default function save({ attributes }) {
	return renderBibliographySave(attributes, {
		sortEntries: true,
		headingTag: getHeadingTag(attributes.headingLevel),
		entryTag: 'span',
		includeCiteExport: attributes.outputCiteExport ?? false,
		repeatedAuthors: true,
		inlineMarkup: true,
		quoteAwareItalics: true,
		urlAwareItalics: true,
		particleAwareSort: true,
		citeExportData: true,
		canonicalDoiUrl: true,
		jsonLdItemList: true,
		labels: LOCALE_INDEPENDENT_SAVE_LABELS,
	});
}
