import apiFetch from '@wordpress/api-fetch';
import {
	clearFormattingCache,
	formatBibliographyEntries,
	formatBibliographyEntry,
} from './csl';

jest.mock('@wordpress/api-fetch', () => jest.fn());

describe('REST-backed citation formatting', () => {
	beforeEach(() => {
		clearFormattingCache();
		apiFetch.mockResolvedValue({
			entries: [
				{ index: 0, text: 'Alpha formatted' },
				{ index: 1, text: 'Beta formatted' },
			],
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		apiFetch.mockReset();
	});

	it('formats a batch through the local WordPress REST formatter endpoint', async () => {
		const results = await formatBibliographyEntries(
			[
				{ type: 'book', title: 'Alpha' },
				{ type: 'book', title: 'Beta' },
			],
			'chicago-author-date'
		);

		expect(results).toEqual(['Alpha formatted', 'Beta formatted']);
		expect(apiFetch).toHaveBeenCalledWith({
			path: '/bibliography/v1/format',
			method: 'POST',
			data: {
				style: 'chicago-author-date',
				cslItems: [
					{ type: 'book', title: 'Alpha' },
					{ type: 'book', title: 'Beta' },
				],
			},
		});
	});

	it('returns an empty batch without calling the formatter endpoint', async () => {
		await expect(
			formatBibliographyEntries([], 'chicago-author-date')
		).resolves.toEqual([]);

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('formats the full bibliography payload including duplicate-looking entries', async () => {
		apiFetch.mockResolvedValueOnce({
			entries: [
				{ index: 0, text: 'Shared formatted first' },
				{ index: 1, text: 'Shared formatted second' },
			],
		});

		const results = await formatBibliographyEntries(
			[
				{
					type: 'book',
					title: 'Shared',
					issued: { 'date-parts': [[2024]] },
				},
				{
					issued: { 'date-parts': [[2024]] },
					title: 'Shared',
					type: 'book',
				},
			],
			'apa-7'
		);

		expect(results).toEqual([
			'Shared formatted first',
			'Shared formatted second',
		]);
		expect(apiFetch.mock.calls[0][0].data.cslItems).toHaveLength(2);
	});

	it('formats a single entry through the same batch boundary', async () => {
		apiFetch.mockResolvedValueOnce({
			entries: [{ index: 0, text: 'Single formatted' }],
		});

		await expect(
			formatBibliographyEntry({ type: 'book', title: 'Single' }, 'apa-7')
		).resolves.toBe('Single formatted');
	});

	it('caches equivalent CSL objects with stable key order', async () => {
		apiFetch.mockResolvedValue({
			entries: [{ index: 0, text: 'Cached formatted' }],
		});

		await formatBibliographyEntry(
			{
				type: 'book',
				title: 'Stable',
				issued: { 'date-parts': [[2024]] },
			},
			'apa-7'
		);
		await formatBibliographyEntry(
			{
				issued: { 'date-parts': [[2024]] },
				title: 'Stable',
				type: 'book',
			},
			'apa-7'
		);

		expect(apiFetch).toHaveBeenCalledTimes(1);
	});

	it('falls back to inert title text if the formatter request fails', async () => {
		const warnSpy = jest
			.spyOn(console, 'warn')
			.mockImplementation(() => {});
		const onFallback = jest.fn();
		apiFetch.mockRejectedValueOnce(new Error('Formatter request failed.'));

		await expect(
			formatBibliographyEntries(
				[
					{ type: 'book', title: 'Fallback title' },
					{ type: 'book', 'container-title': 'Fallback container' },
				],
				'apa-7',
				{ onFallback }
			)
		).resolves.toEqual(['Fallback title', 'Fallback container']);
		expect(warnSpy).toHaveBeenCalled();
		expect(onFallback).toHaveBeenCalledWith(expect.any(Error));
	});

	it('falls back when the formatter response does not include an entries array', async () => {
		const warnSpy = jest
			.spyOn(console, 'warn')
			.mockImplementation(() => {});
		apiFetch.mockResolvedValueOnce({ entries: null });

		await expect(
			formatBibliographyEntry(
				{
					type: 'article-journal',
					'container-title': 'Fallback Journal',
				},
				'apa-7'
			)
		).resolves.toBe('Fallback Journal');

		expect(warnSpy).toHaveBeenCalled();
	});
});
