import { formatBibliographyEntry } from './csl';

jest.mock('@wordpress/api-fetch', () => undefined);

describe('REST-backed citation formatting without WordPress apiFetch', () => {
	it('falls back to inert text when the API fetch dependency is unavailable', async () => {
		const warnSpy = jest
			.spyOn(console, 'warn')
			.mockImplementation(() => {});

		await expect(
			formatBibliographyEntry(
				{
					type: 'book',
					title: 'Fallback without API',
				},
				'apa-7'
			)
		).resolves.toBe('Fallback without API');

		expect(warnSpy).toHaveBeenCalledWith(
			'Falling back to raw citation text for style "apa-7".',
			expect.any(Error)
		);

		warnSpy.mockRestore();
	});
});
