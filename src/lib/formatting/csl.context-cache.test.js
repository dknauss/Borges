import apiFetch from '@wordpress/api-fetch';
import { clearFormattingCache, formatBibliographyEntries } from './csl';

jest.mock('@wordpress/api-fetch', () => jest.fn());

function makeEntry(title) {
	return {
		type: 'article-journal',
		title,
		author: [{ family: 'Smith', given: 'Alex' }],
		issued: { 'date-parts': [[2020]] },
	};
}

describe('bibliography-context cache', () => {
	beforeEach(() => {
		clearFormattingCache();
		apiFetch.mockReset();
	});

	it('reformats existing items when a same-author/same-year item is added', async () => {
		apiFetch.mockImplementation(({ data }) => {
			const titles = (data?.cslItems || []).map((item) => item.title);

			if (titles.includes('Alpha') && titles.includes('Beta')) {
				return Promise.resolve({
					entries: [
						{ text: 'Alpha (2020a)' },
						{ text: 'Beta (2020b)' },
					],
				});
			}

			return Promise.resolve({
				entries: [{ text: `${titles[0]} (2020)` }],
			});
		});

		await expect(
			formatBibliographyEntries(
				[makeEntry('Alpha')],
				'chicago-author-date'
			)
		).resolves.toEqual(['Alpha (2020)']);

		await expect(
			formatBibliographyEntries(
				[makeEntry('Alpha'), makeEntry('Beta')],
				'chicago-author-date'
			)
		).resolves.toEqual(['Alpha (2020a)', 'Beta (2020b)']);
	});

	it('invalidates cache when bibliography order changes', async () => {
		apiFetch.mockImplementation(({ data }) =>
			Promise.resolve({
				entries: (data?.cslItems || []).map((item, index) => ({
					text: `${item.title}@${index}`,
				})),
			})
		);

		await expect(
			formatBibliographyEntries(
				[makeEntry('Alpha'), makeEntry('Beta')],
				'apa-7'
			)
		).resolves.toEqual(['Alpha@0', 'Beta@1']);

		await expect(
			formatBibliographyEntries(
				[makeEntry('Beta'), makeEntry('Alpha')],
				'apa-7'
			)
		).resolves.toEqual(['Beta@0', 'Alpha@1']);
	});

	it('produces cache hits for identical bibliographies with key-order differences', async () => {
		apiFetch.mockResolvedValue({
			entries: [{ text: 'Alpha cached' }, { text: 'Beta cached' }],
		});

		await formatBibliographyEntries(
			[
				makeEntry('Alpha'),
				{
					issued: { 'date-parts': [[2020]] },
					author: [{ given: 'Alex', family: 'Smith' }],
					title: 'Beta',
					type: 'article-journal',
				},
			],
			'apa-7',
			{ locale: 'en-US' }
		);

		await formatBibliographyEntries(
			[
				{
					author: [{ family: 'Smith', given: 'Alex' }],
					type: 'article-journal',
					title: 'Alpha',
					issued: { 'date-parts': [[2020]] },
				},
				makeEntry('Beta'),
			],
			'apa-7',
			{ locale: 'en-US' }
		);

		expect(apiFetch).toHaveBeenCalledTimes(1);
	});

	it('invalidates cache when style or locale changes', async () => {
		apiFetch.mockResolvedValue({
			entries: [{ text: 'Alpha' }],
		});

		await formatBibliographyEntries([makeEntry('Alpha')], 'apa-7', {
			locale: 'en-US',
		});
		await formatBibliographyEntries([makeEntry('Alpha')], 'apa-7', {
			locale: 'pt-BR',
		});
		await formatBibliographyEntries(
			[makeEntry('Alpha')],
			'chicago-author-date',
			{
				locale: 'pt-BR',
			}
		);

		expect(apiFetch).toHaveBeenCalledTimes(3);
	});
});
