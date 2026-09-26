/**
 * Saved markup must not depend on the editor's locale.
 *
 * Gutenberg re-validates a static block's saved markup against `save()` in the
 * *current* editor's locale. Any translated string baked into post content
 * therefore makes a post saved by (say) a French editor open as an invalid
 * block for a German one. These tests save under one locale and parse under
 * another, through the real block registry.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
	createBlock,
	getBlockTypes,
	getSaveContent,
	parse,
	registerBlockType,
	serialize,
	unregisterBlockType,
} from '@wordpress/blocks';
import { resetLocaleData, setLocaleData } from '@wordpress/i18n';

import metadata from '../block.json';
import save from './save';
import { deprecated } from './deprecated';
import { renderBibliographySave } from './save-markup';

jest.mock(
	'@wordpress/block-editor',
	() => ({
		useBlockProps: {
			save: () => ({
				className: 'wp-block-bibliography-builder-bibliography',
			}),
		},
	}),
	{ virtual: true }
);

const DOMAIN = 'borges-bibliography-builder';

const LOCALES = {
	fr: {
		'Cite / Export': ['Citer / Exporter'],
		'Copy citation': ['Copier la citation'],
		Copied: ['Copié'],
		RIS: ['RIS (fr)'],
		'CSL-JSON': ['CSL-JSON (fr)'],
		BibTeX: ['BibTeX (fr)'],
		BibLaTeX: ['BibLaTeX (fr)'],
		'Link to publication': ['Lien vers la publication'],
	},
	de: {
		'Cite / Export': ['Zitieren / Exportieren'],
		'Copy citation': ['Zitat kopieren'],
		Copied: ['Kopiert'],
		RIS: ['RIS (de)'],
		'CSL-JSON': ['CSL-JSON (de)'],
		BibTeX: ['BibTeX (de)'],
		BibLaTeX: ['BibLaTeX (de)'],
		'Link to publication': ['Link zur Publikation'],
	},
};

function activateLocale(locale) {
	resetLocaleData(undefined, DOMAIN);
	if (locale) {
		setLocaleData({ '': { domain: DOMAIN }, ...LOCALES[locale] }, DOMAIN);
	}
}

const ATTRIBUTES = {
	citationStyle: 'chicago-notes-bibliography',
	headingText: 'References',
	outputCiteExport: true,
	citations: [
		{
			id: 'titled',
			csl: {
				id: 'titled',
				type: 'book',
				title: 'A Titled Work',
				author: [{ family: 'Alpha', given: 'Ada' }],
			},
			formattedText:
				'Alpha, Ada. A Titled Work. https://example.com/titled.',
			exportBibtex: '@book{alpha}',
			exportBiblatex: '@book{alpha, date = {2018}}',
		},
		{
			id: 'untitled',
			csl: {
				id: 'untitled',
				type: 'webpage',
				author: [{ family: 'Beta', given: 'Bea' }],
			},
			formattedText: 'Beta, Bea. https://example.com/a?b=1&c=2.',
		},
	],
};

function withBlock(saveImplementation, deprecations, fn) {
	const name = metadata.name;
	if (getBlockTypes().some((type) => type.name === name)) {
		unregisterBlockType(name);
	}
	registerBlockType(name, {
		...metadata,
		save: saveImplementation,
		deprecated: deprecations,
	});
	try {
		return fn(name);
	} finally {
		unregisterBlockType(name);
	}
}

function serializeUnder(locale, saveImplementation) {
	activateLocale(locale);
	return withBlock(saveImplementation, [], (name) =>
		serialize(createBlock(name, ATTRIBUTES))
	);
}

/* eslint-disable no-console -- walking the deprecation chain logs diffs. */
function parseUnder(locale, markup) {
	activateLocale(locale);
	const saved = {
		error: console.error,
		warn: console.warn,
		info: console.info,
	};
	console.error = () => {};
	console.warn = () => {};
	console.info = () => {};
	try {
		return withBlock(save, deprecated, () => parse(markup));
	} finally {
		Object.assign(console, saved);
	}
}
/* eslint-enable no-console */

// The save() shape that shipped before labels were made locale-independent:
// every label passed through __() at save time.
function localizedLegacySave({ attributes }) {
	return renderBibliographySave(attributes, {
		sortEntries: true,
		headingTag: 'p',
		entryTag: 'cite',
		includeCiteExport: attributes.outputCiteExport ?? false,
	});
}

afterEach(() => {
	activateLocale(null);
});

describe('locale-independent saved markup', () => {
	it('serializes identically whatever the editor locale', () => {
		const english = serializeUnder(null, save);

		expect(serializeUnder('fr', save)).toBe(english);
		expect(serializeUnder('de', save)).toBe(english);
	});

	it('bakes no translated label into the markup', () => {
		const markup = serializeUnder('fr', save);

		expect(markup).toContain('>Cite / Export</summary>');
		expect(markup).toContain('>Copy citation</button>');
		expect(markup).not.toContain('data-copied-label');
		expect(markup).not.toContain('Link to publication');
		expect(markup).not.toContain('(fr)');
	});

	it('validates a block saved in one locale when opened in another', () => {
		const markup = serializeUnder('fr', save);
		const [block] = parseUnder('de', markup);

		expect(block.name).toBe(metadata.name);
		expect(block.isValid).toBe(true);
	});
});

describe('legacy localized markup', () => {
	it.each([
		['fr', 'de'],
		['fr', null],
		[null, 'de'],
		['de', 'de'],
	])(
		'saved under %s still validates when opened under %s',
		(savedLocale, openedLocale) => {
			const markup = serializeUnder(savedLocale, localizedLegacySave);
			const [block] = parseUnder(openedLocale, markup);

			expect(block.name).toBe(metadata.name);
			expect(block.isValid).toBe(true);
			expect(block.attributes.citations).toHaveLength(2);
		}
	);

	it('drops the sourced legacy labels when migrating', () => {
		const markup = serializeUnder('fr', localizedLegacySave);
		const [block] = parseUnder('de', markup);

		Object.keys(block.attributes).forEach((key) => {
			expect(key.startsWith('legacy')).toBe(false);
		});
	});
});

describe('frozen legacy markup saved in French by an earlier release', () => {
	// Generated by the real pre-change save(), not by this code; see
	// tests/fixtures/legacy-localized/README.md.
	const legacyFrench = readFileSync(
		join(
			__dirname,
			'..',
			'tests',
			'fixtures',
			'legacy-localized',
			'fr-cite-export.html'
		),
		'utf8'
	);

	it.each([['de'], [null], ['fr']])(
		'validates when opened under %s and migrates to fixed labels',
		(openedLocale) => {
			const [block] = parseUnder(openedLocale, legacyFrench);

			expect(block.name).toBe(metadata.name);
			expect(block.isValid).toBe(true);
			expect(block.attributes.citations).toHaveLength(2);
			Object.keys(block.attributes).forEach((key) => {
				expect(key.startsWith('legacy')).toBe(false);
			});

			activateLocale(openedLocale);
			const resaved = withBlock(save, deprecated, (name) =>
				getSaveContent(name, block.attributes)
			);
			expect(resaved).toContain('>Cite / Export<');
			expect(resaved).not.toMatch(/Citer|Copier|Copié|Lien vers/);
		}
	);
});
