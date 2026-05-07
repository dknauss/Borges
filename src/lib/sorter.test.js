import { sortCitations } from './sorter';

function createCitation({ id, title, family, given, literal, authors, year }) {
	return {
		id,
		csl: {
			title,
			...(authors || family || literal
				? {
						author: authors || [
							{
								...(family ? { family } : {}),
								...(given ? { given } : {}),
								...(literal ? { literal } : {}),
							},
						],
				  }
				: {}),
			...(year
				? {
						issued: {
							'date-parts': [[year]],
						},
				  }
				: {}),
		},
	};
}

describe('sortCitations', () => {
	it('sorts notes-bibliography entries by author, then title, then year', () => {
		const citations = [
			createCitation({
				id: 'c',
				family: 'Smith',
				year: 2024,
				title: 'Zeta',
			}),
			createCitation({
				id: 'a',
				family: 'Binder',
				year: 2025,
				title: 'Zeta',
			}),
			createCitation({
				id: 'b',
				family: 'Binder',
				year: 2024,
				title: 'Omega',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['b', 'a', 'c']
		);
	});

	it('sorts author-date entries by author, then year, then title', () => {
		const citations = [
			createCitation({
				id: 'c',
				family: 'Smith',
				year: 2024,
				title: 'Zeta',
			}),
			createCitation({
				id: 'a',
				family: 'Binder',
				year: 2025,
				title: 'Gamma',
			}),
			createCitation({
				id: 'b',
				family: 'Binder',
				year: 2024,
				title: 'Omega',
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map(
				(citation) => citation.id
			)
		).toEqual(['b', 'a', 'c']);
	});

	it('sorts author-date entries without dates after dated works by the same author', () => {
		const citations = [
			createCitation({
				id: 'dated',
				family: 'Binder',
				year: 2022,
				title: 'Title A',
			}),
			createCitation({
				id: 'undated',
				family: 'Binder',
				title: 'Title B',
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map(
				(citation) => citation.id
			)
		).toEqual(['dated', 'undated']);
	});

	it('ignores leading articles and case in title sorting', () => {
		const citations = [
			createCitation({
				id: 'b',
				family: 'Smith',
				year: 2024,
				title: 'The Zebra Handbook',
			}),
			createCitation({
				id: 'a',
				family: 'Smith',
				year: 2024,
				title: 'an aardvark study',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['a', 'b']
		);
	});

	it('falls back to title sorting when author data is absent', () => {
		const citations = [
			createCitation({
				id: 'no-author-b',
				title: 'The Zebra Handbook',
			}),
			createCitation({
				id: 'no-author-a',
				title: 'An Assistant Handbook',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['no-author-a', 'no-author-b']
		);
	});

	it('sorts corporate authors from literal names instead of falling back to title order', () => {
		const citations = [
			createCitation({
				id: 'title-only',
				title: 'Zebra Institutions',
			}),
			createCitation({
				id: 'literal-author',
				literal: 'World Health Organization',
				title: 'Alpha Report',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['literal-author', 'title-only']
		);
	});

	it('sorts edited collections by editor surname before title fallback', () => {
		const citations = [
			{
				id: 'marks',
				csl: {
					title: 'The Book by Design',
					editor: [
						{
							family: 'Marks',
							given: 'P. J. M.',
						},
					],
				},
			},
			createCitation({
				id: 'borel',
				family: 'Borel',
				year: 2023,
				title: 'The Chicago Guide to Fact-Checking',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['borel', 'marks']
		);
	});

	it('sorts author names case-insensitively with locale-aware comparison', () => {
		const citations = [
			createCitation({
				id: 'z',
				family: 'Zulu',
				year: 2024,
				title: 'Alpha',
			}),
			createCitation({
				id: 'a-umlaut',
				family: 'Ångström',
				year: 2024,
				title: 'Beta',
			}),
			createCitation({
				id: 'a-lower',
				family: 'anderson',
				year: 2024,
				title: 'Gamma',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['a-lower', 'a-umlaut', 'z']
		);
	});

	it('sorts accented and particle surnames in a stable locale-aware order', () => {
		const citations = [
			createCitation({
				id: 'garcia',
				family: 'García',
				year: 2024,
				title: 'Alpha',
			}),
			createCitation({
				id: 'de-beauvoir-upper',
				family: 'De Beauvoir',
				year: 2024,
				title: 'Beta',
			}),
			createCitation({
				id: 'de-beauvoir-lower',
				family: 'de Beauvoir',
				year: 2024,
				title: 'Alpha',
			}),
		];

		expect(sortCitations(citations).map((citation) => citation.id)).toEqual(
			['de-beauvoir-lower', 'de-beauvoir-upper', 'garcia']
		);
	});

	it('sorts notes-bibliography entries with same author and title by year ascending', () => {
		const citations = [
			createCitation({
				id: 'later',
				family: 'Smith',
				title: 'Alpha Study',
				year: 2024,
			}),
			createCitation({
				id: 'earlier',
				family: 'Smith',
				title: 'Alpha Study',
				year: 2018,
			}),
		];

		expect(sortCitations(citations).map((c) => c.id)).toEqual([
			'earlier',
			'later',
		]);
	});

	it('treats notes-bibliography entries with identical author, title, and year as equal order', () => {
		const citations = [
			createCitation({
				id: 'first',
				family: 'Smith',
				title: 'Alpha',
				year: 2024,
			}),
			createCitation({
				id: 'second',
				family: 'Smith',
				title: 'Alpha',
				year: 2024,
			}),
		];

		expect(sortCitations(citations)).toHaveLength(2);
	});

	it('sorts author-date entries with same author and year by title', () => {
		const citations = [
			createCitation({
				id: 'z-title',
				family: 'Jones',
				year: 2022,
				title: 'Zebra Study',
			}),
			createCitation({
				id: 'a-title',
				family: 'Jones',
				year: 2022,
				title: 'Alpha Study',
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map((c) => c.id)
		).toEqual(['a-title', 'z-title']);
	});

	it('applies solo-first ordering before year for matching first author in author-date styles', () => {
		const citations = [
			createCitation({
				id: 'smith-adams-2018',
				title: 'Smith with Adams',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Adams', given: 'Bert' },
				],
				year: 2018,
			}),
			createCitation({
				id: 'smith-solo-2020',
				title: 'Smith Solo',
				authors: [{ family: 'Smith', given: 'Alice' }],
				year: 2020,
			}),
			createCitation({
				id: 'smith-adams-2022',
				title: 'Smith with Adams Later',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Adams', given: 'Bert' },
				],
				year: 2022,
			}),
			createCitation({
				id: 'smith-brown-2019',
				title: 'Smith with Brown',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Brown', given: 'Cara' },
				],
				year: 2019,
			}),
			createCitation({
				id: 'smith-brown-davis-2017',
				title: 'Smith with Brown and Davis',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Brown', given: 'Cara' },
					{ family: 'Davis', given: 'Drew' },
				],
				year: 2017,
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map((c) => c.id)
		).toEqual([
			'smith-solo-2020',
			'smith-adams-2018',
			'smith-adams-2022',
			'smith-brown-2019',
			'smith-brown-davis-2017',
		]);
	});

	it('breaks ties by year for identical author chains in author-date styles', () => {
		const citations = [
			createCitation({
				id: 'later',
				title: 'Later',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Adams', given: 'Bert' },
				],
				year: 2022,
			}),
			createCitation({
				id: 'earlier',
				title: 'Earlier',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Adams', given: 'Bert' },
				],
				year: 2018,
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map((c) => c.id)
		).toEqual(['earlier', 'later']);
	});

	it('breaks ties by coauthor chain before year in author-date styles', () => {
		const citations = [
			createCitation({
				id: 'smith-brown-2019',
				title: 'Smith with Brown',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Brown', given: 'Cara' },
				],
				year: 2019,
			}),
			createCitation({
				id: 'smith-adams-2020',
				title: 'Smith with Adams',
				authors: [
					{ family: 'Smith', given: 'Alice' },
					{ family: 'Adams', given: 'Bert' },
				],
				year: 2020,
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map((c) => c.id)
		).toEqual(['smith-adams-2020', 'smith-brown-2019']);
	});

	it('distinguishes same-family single authors by given name in author-date styles', () => {
		const citations = [
			createCitation({
				id: 'smith-bob',
				title: 'Bob Smith Work',
				family: 'Smith',
				given: 'Bob',
				year: 2020,
			}),
			createCitation({
				id: 'smith-alice',
				title: 'Alice Smith Work',
				family: 'Smith',
				given: 'Alice',
				year: 2020,
			}),
		];

		expect(
			sortCitations(citations, 'chicago-author-date').map((c) => c.id)
		).toEqual(['smith-alice', 'smith-bob']);
	});

	it('does not collide literal corporate and personal author keys with similar surnames', () => {
		const citations = [
			createCitation({
				id: 'personal-open',
				title: 'Personal Open',
				family: 'Open',
				given: 'Alice',
				year: 2021,
			}),
			createCitation({
				id: 'literal-open',
				title: 'Literal Open',
				literal: 'Open',
				year: 2021,
			}),
		];

		const sortedIds = sortCitations(citations, 'chicago-author-date').map(
			(c) => c.id
		);

		expect(sortedIds).toHaveLength(2);
		expect(sortedIds[0]).not.toBe(sortedIds[1]);
	});

	it('sorts citations with no author and no title last using sentinel value', () => {
		const citations = [
			createCitation({ id: 'titled', title: 'Something' }),
			{ id: 'bare', csl: {} },
		];

		expect(sortCitations(citations).map((c) => c.id)).toEqual([
			'titled',
			'bare',
		]);
	});

	it('returns single-entry and empty citation arrays unchanged', () => {
		const single = [
			createCitation({
				id: 'single',
				family: 'Smith',
				title: 'Only Entry',
				year: 2024,
			}),
		];

		expect(sortCitations(single)).toEqual(single);
		expect(sortCitations([])).toEqual([]);
	});

	it('preserves input order for IEEE numeric style', () => {
		const citations = [
			createCitation({
				id: 'smith',
				family: 'Smith',
				year: 2024,
				title: 'Smith Study',
			}),
			createCitation({
				id: 'adams',
				family: 'Adams',
				year: 2019,
				title: 'Adams Study',
			}),
			createCitation({
				id: 'zulu',
				family: 'Zulu',
				year: 2018,
				title: 'Zulu Study',
			}),
			createCitation({
				id: 'brown',
				family: 'Brown',
				year: 2021,
				title: 'Brown Study',
			}),
			createCitation({
				id: 'lee',
				family: 'Lee',
				year: 2020,
				title: 'Lee Study',
			}),
		];

		expect(sortCitations(citations, 'ieee').map((c) => c.id)).toEqual([
			'smith',
			'adams',
			'zulu',
			'brown',
			'lee',
		]);
	});

	it('preserves input order for Vancouver numeric style', () => {
		const citations = [
			createCitation({
				id: 'three',
				family: 'Zulu',
				year: 2018,
				title: 'Zulu Study',
			}),
			createCitation({
				id: 'one',
				family: 'Adams',
				year: 2024,
				title: 'Adams Study',
			}),
			createCitation({
				id: 'five',
				family: 'Lee',
				year: 2019,
				title: 'Lee Study',
			}),
			createCitation({
				id: 'two',
				family: 'Brown',
				year: 2021,
				title: 'Brown Study',
			}),
			createCitation({
				id: 'four',
				family: 'Smith',
				year: 2020,
				title: 'Smith Study',
			}),
		];

		expect(sortCitations(citations, 'vancouver').map((c) => c.id)).toEqual([
			'three',
			'one',
			'five',
			'two',
			'four',
		]);
	});
});
