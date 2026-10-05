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
				// The given name never appears.
				entry('b', lee, 'Lee, K. Two.'),
				entry('c', lee, 'Lee, Kim. Three.'),
				// The given name is not followed by a period.
				entry('d', lee, 'Lee, Kim, ed. Four.'),
				entry('e', lee, 'Lee, Kim. Five.'),
				// The names found do not include the first author's.
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
