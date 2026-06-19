import { computeExportStrings } from './compute-export-strings';
import {
	buildBibtexExportContent,
	buildBiblatexExportContent,
} from '../lib/export';

jest.mock('../lib/export', () => ({
	buildBibtexExportContent: jest.fn(),
	buildBiblatexExportContent: jest.fn(),
}));

describe('computeExportStrings', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		buildBibtexExportContent.mockResolvedValue('@article{a}\n');
		buildBiblatexExportContent.mockResolvedValue('@article{b}\n');
	});

	it('returns a {exportBibtex, exportBiblatex} pair per citation, in order', async () => {
		const result = await computeExportStrings(
			[{ title: 'One' }, { title: 'Two' }],
			'apa-7'
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			exportBibtex: '@article{a}\n',
			exportBiblatex: '@article{b}\n',
		});
		expect(result[1].exportBibtex).toBe('@article{a}\n');
	});

	it('passes each CSL as a single-item [{ csl }] array to the builders', async () => {
		await computeExportStrings([{ title: 'One' }], 'apa-7');

		expect(buildBibtexExportContent).toHaveBeenCalledWith(
			[{ csl: { title: 'One' } }],
			'apa-7'
		);
		expect(buildBiblatexExportContent).toHaveBeenCalledWith(
			[{ csl: { title: 'One' } }],
			'apa-7'
		);
	});

	it('falls back to empty strings (never undefined) when a builder throws', async () => {
		buildBibtexExportContent.mockRejectedValueOnce(new Error('boom'));

		const result = await computeExportStrings([{ title: 'One' }], 'apa-7');

		expect(result[0]).toEqual({ exportBibtex: '', exportBiblatex: '' });
		expect(result[0].exportBibtex).not.toBeUndefined();
	});

	it('handles an empty or missing input gracefully', async () => {
		expect(await computeExportStrings([], 'apa-7')).toEqual([]);
		expect(await computeExportStrings(undefined, 'apa-7')).toEqual([]);
	});
});
