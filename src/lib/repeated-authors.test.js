import {
	REPEATED_AUTHOR_MARK,
	REPEATED_AUTHOR_STYLES,
	getRepeatedAuthorPrefixes,
} from './repeated-authors';

function entry(id, author, text, extra = {}) {
	return { id, csl: { type: 'book', author }, text, ...extra };
}

const displayText = (citation) => citation.text;
const prefixes = (citations, style = 'mla-9') =>
	getRepeatedAuthorPrefixes(citations, style, displayText);

const borges = [{ family: 'Borges', given: 'Jorge Luis' }];

describe('getRepeatedAuthorPrefixes', () => {
	it('applies to MLA 9 only, with three hyphens', () => {
		expect(REPEATED_AUTHOR_STYLES).toEqual(['mla-9']);
		expect(REPEATED_AUTHOR_MARK).toBe('---');

		const list = [
			entry('a', borges, 'Borges, Jorge Luis. Ficciones. 1944.'),
			entry('b', borges, 'Borges, Jorge Luis. Labyrinths. 1962.'),
		];

		expect(prefixes(list)).toEqual([null, 'Borges, Jorge Luis']);
		expect(prefixes(list, 'chicago-notes-bibliography')).toEqual([
			null,
			null,
		]);
	});

	it('handles two authors, three or more, suffixes and literal names', () => {
		const two = [
			{ family: 'Becker', given: 'Thomas' },
			{ family: 'Nakamura', given: 'Yuki' },
		];
		const three = [...two, { family: 'Ortiz', given: 'Ana' }];
		const suffixed = [{ family: 'King', given: 'Martin', suffix: 'Jr.' }];
		const org = [{ literal: 'World Health Organization' }];

		const twoText = 'Becker, Thomas, and Yuki Nakamura';
		const threeText = 'Becker, Thomas, et al';

		expect(
			prefixes([
				entry('a', two, `${twoText}. One.`),
				entry('b', two, `${twoText}. Two.`),
				entry('c', three, `${threeText}. Three.`),
				entry('d', three, `${threeText}. Four.`),
				entry('e', suffixed, 'King, Martin, Jr. Five.'),
				entry('f', suffixed, 'King, Martin, Jr. Six.'),
				entry('g', org, 'World Health Organization. Seven.'),
				entry('h', org, 'World Health Organization. Eight.'),
			])
		).toEqual([
			null,
			twoText,
			null,
			threeText,
			null,
			'King, Martin, Jr',
			null,
			'World Health Organization',
		]);
	});

	it('finds the last of two authors who share a family name', () => {
		const smiths = [
			{ family: 'Smith', given: 'John' },
			{ family: 'Smith', given: 'Jane' },
		];
		const names = 'Smith, John, and Jane Smith';

		expect(
			prefixes([
				entry('a', smiths, `${names}. One.`),
				entry('b', smiths, `${names}. Two.`),
			])
		).toEqual([null, names]);
	});

	it('writes particles and suffixes the way the MLA style does', () => {
		const gogh = [
			{
				family: 'Gogh',
				given: 'Vincent',
				'non-dropping-particle': 'van',
			},
		];
		const beauvoir = [
			{ family: 'Beauvoir', given: 'Simone', 'dropping-particle': 'de' },
		];
		const juniors = [
			{ family: 'Smith', given: 'John', suffix: 'Jr.' },
			{ family: 'Doe', given: 'James', suffix: 'Jr.' },
		];
		const pair = 'Smith, John, Jr., and James Doe Jr';

		expect(
			prefixes([
				entry('a', gogh, 'van Gogh, Vincent. One.'),
				entry('b', gogh, 'van Gogh, Vincent. Two.'),
				entry('c', beauvoir, 'Beauvoir, Simone de. Three.'),
				entry('d', beauvoir, 'Beauvoir, Simone de. Four.'),
				entry('e', juniors, `${pair}. Five.`),
				entry('f', juniors, `${pair}. Six.`),
			])
		).toEqual([
			null,
			'van Gogh, Vincent',
			null,
			'Beauvoir, Simone de',
			null,
			pair,
		]);
	});

	it('never mistakes a title for the names', () => {
		const lee = [{ family: 'Lee', given: 'Kim' }];

		// The formatter fell back to titles alone, and the titles name the author.
		expect(
			prefixes([
				entry('a', lee, '“About Lee, Kim. Part One.”'),
				entry('b', lee, '“About Lee, Kim. Part Two.”'),
				entry('c', lee, 'About Lee, Kim. Part Three.'),
				entry('d', lee, 'About Lee, Kim. Part Four.'),
			])
		).toEqual([null, null, null, null]);
	});

	it('writes a second author with a literal name as it is', () => {
		const pair = [{ family: 'Becker', given: 'T.' }, { literal: 'NASA' }];

		expect(
			prefixes([
				entry('a', pair, 'Becker, T., and NASA. One.'),
				entry('b', pair, 'Becker, T., and NASA. Two.'),
			])
		).toEqual([null, 'Becker, T., and NASA']);
	});

	it('keeps full names when a second author has no name to write', () => {
		const pair = [{ family: 'Lee', given: 'Kim' }, { given: 'Ann' }];

		expect(
			prefixes([
				entry('a', pair, 'Lee, Kim, and Ann. One.'),
				entry('b', pair, 'Lee, Kim, and Ann. Two.'),
			])
		).toEqual([null, null]);
	});

	it('keeps full names whenever the match is not exact', () => {
		const norah = [{ family: 'Borges', given: 'Norah' }];

		expect(
			prefixes([
				entry('a', borges, 'Borges, Jorge Luis. One.'),
				// Manual display text.
				entry('b', borges, 'Borges, Jorge Luis. Two.', {
					displayOverride: 'Borges, Jorge Luis. Two.',
				}),
				// A different author.
				entry('c', norah, 'Borges, Norah. Three.'),
				// No authors: editors only.
				entry('d', [], 'Borges, Norah, editor. Four.'),
				entry('e', undefined, 'Borges, Norah, editor. Five.'),
			])
		).toEqual([null, null, null, null, null]);
	});

	it('keeps full names when the text does not start with the names', () => {
		const lee = [{ family: 'Lee', given: 'Kim' }];
		const blank = [{ family: '', given: '' }];
		const givenOnly = [{ given: 'Kim' }];

		expect(
			prefixes([
				entry('a', lee, 'Lee, Kim. One.'),
				// The names are abbreviated.
				entry('b', lee, 'Lee, K. Two.'),
				entry('c', lee, 'Lee, Kim. Three.'),
				// The names are not followed by a period.
				entry('d', lee, 'Lee, Kim, ed. Four.'),
				entry('e', lee, 'Lee, Kim. Five.'),
				// Someone else's names.
				entry('f', lee, 'Park, Kim. Six.'),
				entry('g', lee, 'Lee, Kim. Seven.'),
				// The previous entry starts differently.
				entry('h', lee, 'Lee, Kim. Eight.'),
				entry('i', blank, '. Nine.'),
				entry('j', blank, '. Ten.'),
				entry('k', givenOnly, 'Kim. Eleven.'),
				entry('l', givenOnly, 'Kim. Twelve.'),
			]).map((prefix, index) => [index, prefix])
		).toEqual([
			[0, null],
			[1, null],
			[2, null],
			[3, null],
			[4, null],
			[5, null],
			[6, null],
			[7, 'Lee, Kim'],
			[8, null],
			[9, null],
			[10, null],
			[11, null],
		]);
	});
});
