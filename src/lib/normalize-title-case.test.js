import {
	normalizeTitleCase,
	normalizeCslTitleCase,
} from './normalize-title-case';

describe('normalizeTitleCase', () => {
	it.each([
		[
			'COMPUTING MACHINERY AND INTELLIGENCE',
			'Computing Machinery and Intelligence',
		],
		[
			'I.—COMPUTING MACHINERY AND INTELLIGENCE',
			'I.—Computing Machinery and Intelligence',
		],
		[
			'THE STRUCTURE OF SCIENTIFIC REVOLUTIONS',
			'The Structure of Scientific Revolutions',
		],
		['STUDY: A REVIEW', 'Study: A Review'],
		["WOMEN'S RIGHTS", "Women's Rights"],
		['ON THE ORIGIN OF SPECIES', 'On the Origin of Species'],
		['INTELLIGENCE', 'Intelligence'],
	])('title-cases all-caps %s -> %s', (input, expected) => {
		expect(normalizeTitleCase(input)).toBe(expected);
	});

	it.each([
		['A logical calculus of the ideas immanent in nervous activity'],
		['Computing Machinery and Intelligence'],
		['Array programming with NumPy'],
		[''],
	])('leaves already-cased title %s unchanged', (input) => {
		expect(normalizeTitleCase(input)).toBe(input);
	});

	it('leaves caseless scripts unchanged', () => {
		expect(normalizeTitleCase('科学革命的结构')).toBe('科学革命的结构');
	});

	it('returns non-strings untouched', () => {
		expect(normalizeTitleCase(undefined)).toBe(undefined);
		expect(normalizeTitleCase(42)).toBe(42);
	});

	// Known, accepted limitation: acronyms inside an all-caps title cannot be
	// distinguished from ordinary words, so they flatten to title case.
	it('flattens acronyms inside an all-caps title (documented)', () => {
		expect(normalizeTitleCase('THE ROLE OF DNA')).toBe('The Role of Dna');
	});
});

describe('normalizeCslTitleCase', () => {
	it('normalizes an all-caps title, leaving an already-cased container-title', () => {
		const csl = {
			type: 'article-journal',
			title: 'COMPUTING MACHINERY AND INTELLIGENCE',
			'container-title': 'Mind',
		};
		const out = normalizeCslTitleCase(csl);
		expect(out.title).toBe('Computing Machinery and Intelligence');
		expect(out['container-title']).toBe('Mind');
	});

	it('normalizes an all-caps container-title', () => {
		const csl = { 'container-title': 'NATURE' };
		expect(normalizeCslTitleCase(csl)['container-title']).toBe('Nature');
	});

	it('does not mutate the input object', () => {
		const csl = { title: 'COMPUTING MACHINERY AND INTELLIGENCE' };
		normalizeCslTitleCase(csl);
		expect(csl.title).toBe('COMPUTING MACHINERY AND INTELLIGENCE');
	});

	it('returns non-objects untouched and ignores non-string titles', () => {
		expect(normalizeCslTitleCase(null)).toBe(null);
		expect(normalizeCslTitleCase({ title: 123 }).title).toBe(123);
	});

	it('preserves unrelated fields', () => {
		const csl = {
			type: 'book',
			title: 'A Quiet Title',
			issued: { 'date-parts': [[1962]] },
		};
		const out = normalizeCslTitleCase(csl);
		expect(out.type).toBe('book');
		expect(out.title).toBe('A Quiet Title');
		expect(out.issued).toEqual({ 'date-parts': [[1962]] });
	});
});
