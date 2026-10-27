import {
	getArxivUrlFromRawEntry,
	normalizeBibtexCsl,
	normalizeBibtexLanguage,
} from './bibtex-fields';

describe('normalizeBibtexLanguage', () => {
	it.each([
		['english', 'en'],
		['English', 'en'],
		['american', 'en-US'],
		['british', 'en-GB'],
		['ngerman', 'de'],
		['nswissgerman', 'de-CH'],
		['french', 'fr'],
		['brazil', 'pt-BR'],
		['nynorsk', 'nn'],
		['  spanish  ', 'es'],
	])('maps babel name %p to %p', (input, expected) => {
		expect(normalizeBibtexLanguage(input)).toBe(expected);
	});

	it.each(['en', 'fr', 'en-US', 'zh-Hant', 'pt-BR'])(
		'passes BCP 47 tag %p through unchanged',
		(tag) => {
			expect(normalizeBibtexLanguage(tag)).toBe(tag);
		}
	);

	it.each([
		'klingon',
		'english and german',
		'english, french',
		'',
		undefined,
		42,
	])('returns undefined for unmappable value %p', (value) => {
		expect(normalizeBibtexLanguage(value)).toBeUndefined();
	});
});

describe('getArxivUrlFromRawEntry', () => {
	it('builds a URL from BibLaTeX eprint + eprinttype', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, title={T}, eprint={2301.00001}, eprinttype={arxiv}}'
			)
		).toBe('https://arxiv.org/abs/2301.00001');
	});

	it('builds a URL from BibTeX eprint + archiveprefix, keeping the version', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@misc{a,\n  archivePrefix = "arXiv",\n  eprint = "2301.00001v2"\n}'
			)
		).toBe('https://arxiv.org/abs/2301.00001v2');
	});

	it('accepts legacy arXiv identifiers and an arXiv: prefix', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, eprinttype={arXiv}, eprint={arXiv:hep-th/9901001}}'
			)
		).toBe('https://arxiv.org/abs/hep-th/9901001');
	});

	it('ignores non-arXiv eprints', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, eprint={12345}, eprinttype={pubmed}}'
			)
		).toBeUndefined();
	});

	it('ignores eprint values that are not arXiv identifiers', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, eprinttype={arxiv}, eprint={javascript:alert(1)}}'
			)
		).toBeUndefined();
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, eprinttype={arxiv}, eprint={../../etc}}'
			)
		).toBeUndefined();
	});

	it('reads bare (unbraced, unquoted) field values', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, eprinttype = arxiv, eprint = 2301.00001}'
			)
		).toBe('https://arxiv.org/abs/2301.00001');
	});

	it('treats an empty eprint as absent', () => {
		expect(
			getArxivUrlFromRawEntry(
				'@article{a, eprinttype={arxiv}, eprint={ }}'
			)
		).toBeUndefined();
	});

	it('does not mistake eprinttype for eprint', () => {
		expect(
			getArxivUrlFromRawEntry('@article{a, eprinttype={arxiv}}')
		).toBeUndefined();
	});

	it('returns undefined without a raw entry', () => {
		expect(getArxivUrlFromRawEntry(undefined)).toBeUndefined();
	});
});

describe('normalizeBibtexCsl', () => {
	it('normalizes language and adds an arXiv URL without mutating input', () => {
		const csl = { type: 'article', title: 'T', language: 'ngerman' };
		const result = normalizeBibtexCsl(
			csl,
			'@article{a, langid={ngerman}, eprint={2301.00001}, eprinttype={arxiv}}'
		);

		expect(result).toEqual({
			type: 'article',
			title: 'T',
			language: 'de',
			URL: 'https://arxiv.org/abs/2301.00001',
		});
		expect(csl.language).toBe('ngerman');
		expect(csl).not.toHaveProperty('URL');
	});

	it('drops an unmappable language instead of saving an invalid lang', () => {
		expect(
			normalizeBibtexCsl({ title: 'T', language: 'klingon' }, '')
		).toEqual({ title: 'T' });
	});

	it('keeps an existing URL over the arXiv fallback', () => {
		expect(
			normalizeBibtexCsl(
				{ title: 'T', URL: 'https://example.org/paper' },
				'@article{a, eprint={2301.00001}, eprinttype={arxiv}}'
			).URL
		).toBe('https://example.org/paper');
	});

	it.each([
		['mathesis', "Master's thesis"],
		['phdthesis', 'PhD thesis'],
		['techreport', 'technical report'],
		['patentde', 'German patent'],
	])('turns the BibLaTeX type key %s into the label %s', (key, label) => {
		expect(normalizeBibtexCsl({ title: 'T', genre: key }, '').genre).toBe(
			label
		);
	});

	it('keeps a genre that is not a BibLaTeX type key', () => {
		expect(
			normalizeBibtexCsl(
				{ title: 'T', genre: 'Doctoral dissertation' },
				''
			).genre
		).toBe('Doctoral dissertation');
	});

	it("reads Mendeley's city field as the place of publication", () => {
		expect(
			normalizeBibtexCsl(
				{ type: 'book', title: 'T' },
				'@book{a,\n   city = {Chicago},\n   title = {T}\n}'
			)['publisher-place']
		).toBe('Chicago');
	});

	it('keeps a place citation-js already mapped over city', () => {
		expect(
			normalizeBibtexCsl(
				{ type: 'book', title: 'T', 'publisher-place': 'Paris' },
				'@book{a, address = {Paris}, city = {Lyon}}'
			)['publisher-place']
		).toBe('Paris');
	});
});
