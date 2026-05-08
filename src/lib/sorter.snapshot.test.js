import { STYLE_DEFINITIONS } from './formatting';
import { SORT_BASELINE_FIXTURES } from './__fixtures__/sort-fixtures';
import { sortCitations } from './sorter';

const STYLE_KEYS = Object.keys(STYLE_DEFINITIONS);

describe('sortCitations snapshot baseline', () => {
	it('covers the currently registered citation styles', () => {
		expect(STYLE_KEYS).toEqual([
			'chicago-notes-bibliography',
			'chicago-author-date',
			'apa-7',
			'mla-9',
			'harvard',
			'ieee',
			'vancouver',
			'oscola',
			'abnt',
		]);
	});

	test.each(STYLE_KEYS)('records current ordering for %s', (styleKey) => {
		const sortedIds = sortCitations(SORT_BASELINE_FIXTURES, styleKey).map(
			(citation) => citation.id
		);

		expect(sortedIds).toMatchSnapshot();
	});
});
