import {
	getAutoFormattedText,
	getDisplaySegments,
	getDisplayText,
	splitTextIntoLinkParts,
} from './index';

function createCitation(overrides = {}) {
	return {
		csl: {
			type: 'article-journal',
			title: 'Example Article',
			'container-title': 'Journal of Examples',
			...overrides.csl,
		},
		formattedText:
			'Smith, Ada. “Example Article.” Journal of Examples 12 (3): 117–34.',
		displayOverride: null,
		...overrides,
	};
}

describe('formatting helpers', () => {
	it('returns the auto-formatted text when no override is present', () => {
		const citation = createCitation({
			formattedText: 'Auto formatted citation',
		});

		expect(getAutoFormattedText(citation)).toBe('Auto formatted citation');
		expect(getDisplayText(citation)).toBe('Auto formatted citation');
	});

	it('returns an empty non-italic segment when no display text exists', () => {
		expect(
			getDisplaySegments(
				createCitation({
					formattedText: '',
					csl: {
						title: '',
					},
				})
			)
		).toEqual([{ text: '', italic: false }]);
	});

	it('keeps a quoted article title plain and italicizes the journal title', () => {
		const citation = createCitation();

		expect(getDisplaySegments(citation)).toEqual([
			{
				text: 'Smith, Ada. “Example Article.” ',
				italic: false,
			},
			{
				text: 'Journal of Examples',
				italic: true,
			},
			{
				text: ' 12 (3): 117–34.',
				italic: false,
			},
		]);
	});

	it('chooses the last matching title range when the same text appears earlier', () => {
		const citation = createCitation({
			csl: {
				type: 'book',
				title: 'Data',
			},
			formattedText: 'Data Research Group. Data. Press, 2024.',
		});

		expect(getDisplaySegments(citation)).toEqual([
			{
				text: 'Data Research Group. ',
				italic: false,
			},
			{
				text: 'Data',
				italic: true,
			},
			{
				text: '. Press, 2024.',
				italic: false,
			},
		]);
	});

	it('falls back to an earlier unquoted title when the last title match is quoted', () => {
		const citation = createCitation({
			csl: {
				type: 'book',
				title: 'Data',
			},
			formattedText: 'Data “Data”',
		});

		expect(getDisplaySegments(citation)).toEqual([
			{
				text: 'Data',
				italic: true,
			},
			{
				text: ' “Data”',
				italic: false,
			},
		]);
	});

	it('treats mixed straight and curly quotes as quoted text', () => {
		const citation = createCitation({
			formattedText:
				'Smith, Ada. “Example Article". Journal of Examples 12 (3): 117–34.',
		});

		expect(getDisplaySegments(citation)[0]).toEqual({
			text: 'Smith, Ada. “Example Article". ',
			italic: false,
		});
	});

	it('splits visible URLs into linked parts and leaves trailing punctuation outside the link', () => {
		expect(
			splitTextIntoLinkParts(
				'Available at https://example.com/path/to/resource.'
			)
		).toEqual([
			{
				text: 'Available at ',
				link: false,
			},
			{
				text: 'https://example.com/path/to/resource',
				href: 'https://example.com/path/to/resource',
				link: true,
			},
			{
				text: '.',
				link: false,
			},
		]);
	});

	it('preserves balanced parentheses inside linked URLs', () => {
		expect(
			splitTextIntoLinkParts('See https://example.com/path_(alpha).')
		).toEqual([
			{
				text: 'See ',
				link: false,
			},
			{
				text: 'https://example.com/path_(alpha)',
				href: 'https://example.com/path_(alpha)',
				link: true,
			},
			{
				text: '.',
				link: false,
			},
		]);
	});

	it('leaves an unmatched closing parenthesis outside linked URLs', () => {
		expect(
			splitTextIntoLinkParts('See https://example.com/path).')
		).toEqual([
			{
				text: 'See ',
				link: false,
			},
			{
				text: 'https://example.com/path',
				href: 'https://example.com/path',
				link: true,
			},
			{
				text: ').',
				link: false,
			},
		]);
	});

	it('returns an empty plain segment for empty link text', () => {
		expect(splitTextIntoLinkParts('')).toEqual([
			{
				text: '',
				link: false,
			},
		]);
	});

	it('splits multiple visible URLs independently', () => {
		expect(
			splitTextIntoLinkParts(
				'See https://example.com/one and https://example.com/two.'
			)
		).toEqual([
			{ text: 'See ', link: false },
			{
				text: 'https://example.com/one',
				href: 'https://example.com/one',
				link: true,
			},
			{ text: ' and ', link: false },
			{
				text: 'https://example.com/two',
				href: 'https://example.com/two',
				link: true,
			},
			{ text: '.', link: false },
		]);
	});

	it('italicizes motion picture titles as monographic works', () => {
		const citation = createCitation({
			csl: {
				type: 'motion_picture',
				title: 'Example Film',
			},
			formattedText: 'Example Film. 2024.',
		});

		expect(getDisplaySegments(citation)).toEqual([
			{
				text: 'Example Film',
				italic: true,
			},
			{
				text: '. 2024.',
				italic: false,
			},
		]);
	});

	it.each([
		'broadcast',
		'entry-dictionary',
		'entry-encyclopedia',
		'graphic',
		'interview',
		'legal_case',
		'legislation',
		'manuscript',
		'map',
		'musical_score',
		'pamphlet',
		'performance',
		'periodical',
		'regulation',
		'song',
		'speech',
		'standard',
		'treaty',
	])('italicizes the title for standalone type "%s"', (type) => {
		const citation = createCitation({
			csl: {
				type,
				title: 'Standalone Work',
			},
			formattedText: 'Author. Standalone Work. Publisher, 2024.',
		});

		const segments = getDisplaySegments(citation);
		const italicSegment = segments.find((s) => s.italic);

		expect(italicSegment).toBeDefined();
		expect(italicSegment.text).toBe('Standalone Work');
	});

	it.each([
		'entry',
		'paper-conference',
		'post',
		'post-weblog',
		'review',
		'review-book',
	])('italicizes the container-title for type "%s"', (type) => {
		const citation = createCitation({
			csl: {
				type,
				title: 'Contained Work',
				'container-title': 'Parent Collection',
			},
			formattedText:
				'Author. "Contained Work." Parent Collection. Publisher, 2024.',
		});

		const segments = getDisplaySegments(citation);
		const italicSegment = segments.find((s) => s.italic);

		expect(italicSegment).toBeDefined();
		expect(italicSegment.text).toBe('Parent Collection');
	});

	it('returns no italic segments for an unrecognized CSL type', () => {
		const citation = createCitation({
			csl: {
				type: 'personal_communication',
				title: 'Private Note',
			},
			formattedText: 'Author. Private Note. 2024.',
		});

		const segments = getDisplaySegments(citation);

		expect(segments.every((s) => !s.italic)).toBe(true);
	});

	it('includes a label field on link segments when linkLabel is provided', () => {
		const parts = splitTextIntoLinkParts('See https://example.org/foo', {
			linkLabel: 'Some Title',
		});
		const linkPart = parts.find((p) => p.link);
		expect(linkPart).toBeDefined();
		expect(linkPart.label).toBe('Some Title');
	});

	it('omits the label field when no linkLabel option is provided (backward-compatible)', () => {
		const parts = splitTextIntoLinkParts('See https://example.org/foo');
		const linkPart = parts.find((p) => p.link);
		expect(linkPart).toBeDefined();
		expect(linkPart.label).toBeUndefined();
	});

	it('does not add label field to non-link segments', () => {
		const parts = splitTextIntoLinkParts(
			'Prefix https://example.org/foo suffix',
			{ linkLabel: 'My Title' }
		);
		const nonLink = parts.filter((p) => !p.link);
		expect(nonLink.every((p) => !('label' in p))).toBe(true);
	});
});
