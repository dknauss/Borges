import fs from 'node:fs';
import path from 'node:path';
import CSL from 'citeproc';
import { getStyleDefinition } from '../formatting';

const STYLE_FILE_CACHE = new Map();
const LOCALE_FILE_CACHE = new Map();

const STYLE_DIRECTORY = path.resolve(
	__dirname,
	'../../../packages/citation-style-language-styles'
);
const LOCALE_DIRECTORY = path.resolve(
	__dirname,
	'../../../packages/citation-style-language-locales'
);

function readCachedFile(cache, absolutePath) {
	if (!cache.has(absolutePath)) {
		cache.set(absolutePath, fs.readFileSync(absolutePath, 'utf8'));
	}

	return cache.get(absolutePath);
}

function getStyleXml(styleTemplate) {
	const stylePath = path.join(STYLE_DIRECTORY, `${styleTemplate}.csl`);
	return readCachedFile(STYLE_FILE_CACHE, stylePath);
}

function getLocaleXml(locale) {
	const localePath = path.join(LOCALE_DIRECTORY, `locales-${locale}.xml`);
	return readCachedFile(LOCALE_FILE_CACHE, localePath);
}

function normalizeCslItems(cslItems = []) {
	return cslItems.map((cslItem, index) => {
		const id = String(cslItem.id || `fixture-${index + 1}`);
		return {
			...cslItem,
			id,
		};
	});
}

export function runCiteprocBibliographyOrder({
	styleKey,
	cslItems,
	locale,
	styleTemplate,
}) {
	const styleDefinition = getStyleDefinition(styleKey);
	const effectiveStyleTemplate = styleTemplate || styleDefinition.cslTemplate;
	const effectiveLocale = locale || styleDefinition.locale || 'en-US';
	const normalizedItems = normalizeCslItems(cslItems);
	const itemById = Object.fromEntries(
		normalizedItems.map((item) => [item.id, item])
	);
	const styleXml = getStyleXml(effectiveStyleTemplate);
	const localeXml = getLocaleXml(effectiveLocale);
	const processor = new CSL.Engine(
		{
			retrieveItem: (id) => itemById[id],
			retrieveLocale: () => localeXml,
		},
		styleXml,
		effectiveLocale,
		true
	);
	const itemIds = normalizedItems.map((item) => item.id);
	processor.updateItems(itemIds);
	const [bibliographyMeta] = processor.makeBibliography();

	return (bibliographyMeta.entry_ids || []).map((entryId) =>
		Array.isArray(entryId) ? entryId[0] : entryId
	);
}
