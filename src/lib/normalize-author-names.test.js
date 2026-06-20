import {
	normalizeNameToken,
	normalizeCslNameCase,
} from './normalize-author-names';

describe('normalizeNameToken — family-style (aggressive title-casing)', () => {
	it.each([
		['TURING', 'Turing'],
		['WATSON', 'Watson'],
		['CRICK', 'Crick'],
		['SHANNON', 'Shannon'],
		['WU', 'Wu'],
		['NG', 'Ng'],
		["O'BRIEN", "O'Brien"],
		['SMITH-JONES', 'Smith-Jones'],
		['DE LA CRUZ', 'de la Cruz'],
		['VAN DER BERG', 'van der Berg'],
	])('title-cases all-caps %s -> %s', (input, expected) => {
		expect(normalizeNameToken(input)).toBe(expected);
	});

	it.each([
		['Turing'],
		['McCulloch'],
		['van der Waals'],
		['A. M.'],
		['J.D.'],
		['A.'],
		[''],
	])('leaves already-cased or dotted-initial %s unchanged', (input) => {
		expect(normalizeNameToken(input)).toBe(input);
	});

	// Known, accepted limitation: when the SOURCE itself sends an all-caps name
	// with internal caps, we cannot recover them without a name dictionary, so
	// these flatten to simple title case. Still strictly better than rendering
	// the all-caps form, and only reached when the source is already all-caps
	// (a correctly-cased "McCulloch" keeps its lowercase and is left untouched).
	it.each([
		['MCCULLOCH', 'Mcculloch'],
		['MACDONALD', 'Macdonald'],
	])(
		'flattens source-all-caps internal caps %s -> %s (documented)',
		(input, expected) => {
			expect(normalizeNameToken(input)).toBe(expected);
		}
	);

	it('leaves caseless scripts (CJK) unchanged', () => {
		expect(normalizeNameToken('王')).toBe('王');
	});

	it('title-cases uppercase Cyrillic', () => {
		expect(normalizeNameToken('ИВАНОВ')).toBe('Иванов');
	});

	it('returns non-strings untouched', () => {
		expect(normalizeNameToken(undefined)).toBe(undefined);
		expect(normalizeNameToken(123)).toBe(123);
	});
});

describe('normalizeNameToken — given field (conservative initials)', () => {
	it.each([['JD'], ['FHC'], ['J D'], ['A. M.']])(
		'leaves concatenated/short initials %s unchanged',
		(input) => {
			expect(
				normalizeNameToken(input, { allowShortInitials: true })
			).toBe(input);
		}
	);

	it.each([
		['ALAN', 'Alan'],
		['JAMES D', 'James D'],
	])('title-cases full given names %s -> %s', (input, expected) => {
		expect(normalizeNameToken(input, { allowShortInitials: true })).toBe(
			expected
		);
	});
});

describe('normalizeCslNameCase', () => {
	it('normalizes author family + leaves dotted given initials', () => {
		const csl = {
			type: 'article-journal',
			author: [{ family: 'TURING', given: 'A. M.' }],
		};
		expect(normalizeCslNameCase(csl).author).toEqual([
			{ family: 'Turing', given: 'A. M.' },
		]);
	});

	it('normalizes editor and reviewed-author lists, leaving concatenated given initials', () => {
		const csl = {
			editor: [{ family: 'WATSON', given: 'JD' }],
			'reviewed-author': [{ family: 'CRICK', given: 'FHC' }],
		};
		const out = normalizeCslNameCase(csl);
		expect(out.editor).toEqual([{ family: 'Watson', given: 'JD' }]);
		expect(out['reviewed-author']).toEqual([
			{ family: 'Crick', given: 'FHC' },
		]);
	});

	it('leaves organization literal names untouched (acronym safety)', () => {
		const csl = { author: [{ literal: 'IEEE' }] };
		expect(normalizeCslNameCase(csl).author).toEqual([{ literal: 'IEEE' }]);
	});

	it('does not mutate the input object', () => {
		const csl = { author: [{ family: 'TURING', given: 'A. M.' }] };
		normalizeCslNameCase(csl);
		expect(csl.author[0].family).toBe('TURING');
	});

	it('returns non-objects untouched', () => {
		expect(normalizeCslNameCase(null)).toBe(null);
		expect(normalizeCslNameCase(undefined)).toBe(undefined);
	});

	it('preserves unrelated CSL fields and non-name shapes', () => {
		const csl = {
			type: 'book',
			title: 'X',
			issued: { 'date-parts': [[1962]] },
			author: [{ family: 'WU', given: 'Y' }],
		};
		const out = normalizeCslNameCase(csl);
		expect(out.type).toBe('book');
		expect(out.title).toBe('X');
		expect(out.issued).toEqual({ 'date-parts': [[1962]] });
		expect(out.author).toEqual([{ family: 'Wu', given: 'Y' }]);
	});
});
