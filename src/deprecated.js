import metadata from '../block.json';
import { sortCitations } from './lib/sorter';
import { getHeadingTag } from './lib/heading-level';
import {
	LOCALE_INDEPENDENT_SAVE_LABELS,
	getLocalizedSaveLabels,
	renderBibliographySave,
} from './save-markup';

const deprecatedAttributes = metadata.attributes;

function sourcedText(selector) {
	return { type: 'string', source: 'text', selector };
}

/**
 * Labels as the saved markup actually spells them, read back from it.
 *
 * Markup saved before the labels were made locale-independent carries them
 * translated into the *saving* editor's locale. Re-rendering with the current
 * editor's translations would fail for anyone in another locale, so the
 * deprecation re-renders with whatever the markup itself says.
 */
const legacyLabelAttributes = {
	legacyToggleLabel: sourcedText('.bibliography-builder-cite-export-toggle'),
	legacyCopyLabel: sourcedText('.bibliography-builder-cite-copy'),
	legacyCopiedLabel: {
		type: 'string',
		source: 'attribute',
		selector: '.bibliography-builder-cite-copy',
		attribute: 'data-copied-label',
	},
	legacyRisLabel: sourcedText('a[data-cite-export-filename$=".ris"]'),
	legacyCslJsonLabel: sourcedText(
		'a[data-cite-export-filename$=".csl.json"]'
	),
	legacyBibtexLabel: sourcedText(
		'a[data-cite-export-filename$=".bib"]:not([data-cite-export-filename$=".biblatex.bib"])'
	),
	legacyBiblatexLabel: sourcedText(
		'a[data-cite-export-filename$=".biblatex.bib"]'
	),
	legacyEntryLinks: {
		type: 'array',
		source: 'query',
		selector: '.bibliography-builder-entry-text a[aria-label]',
		query: {
			ariaLabel: {
				type: 'string',
				source: 'attribute',
				attribute: 'aria-label',
			},
			href: { type: 'string', source: 'attribute', attribute: 'href' },
		},
	},
};

/**
 * The saved "Link to publication" label: an entry link's aria-label is
 * `${label} — ${href}`, and any label that is not some citation's title or
 * container title is the fallback.
 *
 * @param {Object} attributes Deprecation attributes.
 * @return {string|undefined} The saved fallback label, if the markup has one.
 */
function getSavedLinkFallback(attributes) {
	const titled = new Set(
		(attributes.citations || [])
			.map(
				(citation) =>
					citation?.csl?.title || citation?.csl?.['container-title']
			)
			.filter(Boolean)
			.map(String)
	);

	for (const { ariaLabel, href } of attributes.legacyEntryLinks || []) {
		const suffix = ` — ${href}`;
		if (ariaLabel && href && ariaLabel.endsWith(suffix)) {
			const label = ariaLabel.slice(0, -suffix.length);
			if (!titled.has(label)) {
				return label;
			}
		}
	}

	return undefined;
}

function getSavedLabels(attributes) {
	const localized = getLocalizedSaveLabels();

	return {
		toggle: attributes.legacyToggleLabel ?? localized.toggle,
		copy: attributes.legacyCopyLabel ?? localized.copy,
		copied: attributes.legacyCopiedLabel ?? localized.copied,
		ris: attributes.legacyRisLabel ?? localized.ris,
		cslJson: attributes.legacyCslJsonLabel ?? localized.cslJson,
		bibtex: attributes.legacyBibtexLabel ?? localized.bibtex,
		biblatex: attributes.legacyBiblatexLabel ?? localized.biblatex,
		linkFallback:
			getSavedLinkFallback(attributes) ?? localized.linkFallback,
	};
}

function withoutLegacyLabels(attributes) {
	const migrated = { ...attributes };
	Object.keys(legacyLabelAttributes).forEach((key) => {
		delete migrated[key];
	});
	return migrated;
}

function migrateSortedAttributes(attributes) {
	return {
		...attributes,
		citations: sortCitations(
			attributes.citations || [],
			attributes.citationStyle
		),
	};
}

export const deprecated = [
	{
		// Freezes the save() shape from before 1.10.0: a title could be
		// italicized inside a URL when the journal name is part of its own DOI
		// (eLife's 10.7554/eLife.83254), which split the link.
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: getHeadingTag(attributes.headingLevel),
				entryTag: 'cite',
				includeCiteExport: attributes.outputCiteExport ?? false,
				repeatedAuthors: true,
				inlineMarkup: true,
				quoteAwareItalics: true,
				canonicalDoiUrl: true,
				labels: LOCALE_INDEPENDENT_SAVE_LABELS,
			}),
	},
	{
		// Freezes the save() shape from before 1.9.1: a quoted title with
		// punctuation inside the closing quote (Chicago's `"Title."`) was also
		// italicized, and the JSON-LD url encoded the DOI's slash.
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: getHeadingTag(attributes.headingLevel),
				entryTag: 'cite',
				includeCiteExport: attributes.outputCiteExport ?? false,
				repeatedAuthors: true,
				inlineMarkup: true,
				labels: LOCALE_INDEPENDENT_SAVE_LABELS,
			}),
	},
	{
		// Freezes the save() shape from before inline HTML was read: a tag in
		// formatted text, a title, or a manual override was escaped and shown
		// as text, and titles carrying tags were not matched for italics.
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
				includeCiteExport: attributes.outputCiteExport ?? false,
				repeatedAuthors: true,
				labels: LOCALE_INDEPENDENT_SAVE_LABELS,
			}),
	},
	{
		// Freezes the save() shape from before MLA 9 repeated authors became
		// three hyphens: every entry writes its author names out in full.
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
				includeCiteExport: attributes.outputCiteExport ?? false,
				labels: LOCALE_INDEPENDENT_SAVE_LABELS,
			}),
	},
	{
		// Freezes the save() shape from before labels were made
		// locale-independent: Cite / Export labels and the link fallback label
		// translated at save time, plus a data-copied-label attribute.
		attributes: { ...deprecatedAttributes, ...legacyLabelAttributes },
		migrate: withoutLegacyLabels,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
				includeCiteExport: attributes.outputCiteExport ?? false,
				labels: getSavedLabels(attributes),
			}),
	},
	{
		// Freezes the current pre-Phase-4 save() shape (no <details>) so that
		// existing saved blocks keep validating once Plan 02 adds per-entry
		// cite/export disclosure panels. Mirrors src/save.js exactly.
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
			}),
	},
	{
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
				linkVisibleUrls: true,
				includeDeprecatedBiblioEntryRole: true,
			}),
	},
	{
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
				linkVisibleUrls: true,
				ariaLabel: 'Bibliography',
				includeDeprecatedBiblioEntryRole: true,
			}),
	},
	{
		attributes: deprecatedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: true,
				headingTag: 'p',
				entryTag: 'cite',
				linkVisibleUrls: false,
				includeDeprecatedBiblioEntryRole: true,
			}),
	},
	{
		attributes: deprecatedAttributes,
		migrate: migrateSortedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: false,
				headingTag: 'p',
				entryTag: 'cite',
				linkVisibleUrls: false,
				includeDeprecatedBiblioEntryRole: true,
			}),
	},
	{
		attributes: deprecatedAttributes,
		migrate: migrateSortedAttributes,
		save: ({ attributes }) =>
			renderBibliographySave(attributes, {
				sortEntries: false,
				headingTag: 'h2',
				entryTag: 'span',
				linkVisibleUrls: false,
				includeDeprecatedBiblioEntryRole: true,
			}),
	},
];
