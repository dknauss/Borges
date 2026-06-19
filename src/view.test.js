import { applyExportFilenames } from './view';

describe('applyExportFilenames (cite/export download filename PE)', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	function panel(inner) {
		document.body.innerHTML = `<div class="bibliography-builder-cite-export">${inner}</div>`;
	}

	it('copies data-cite-export-filename onto the download attribute', () => {
		panel(
			'<a href="data:text/plain,x" download data-cite-export-filename="citation-abc.ris">RIS</a>'
		);

		applyExportFilenames(document);

		expect(document.querySelector('a').getAttribute('download')).toBe(
			'citation-abc.ris'
		);
	});

	it('sets the correct per-format name on every export link', () => {
		panel(
			[
				'<a download data-cite-export-filename="citation-1.ris">RIS</a>',
				'<a download data-cite-export-filename="citation-1.csl.json">CSL-JSON</a>',
				'<a download data-cite-export-filename="citation-1.bib">BibTeX</a>',
				'<a download data-cite-export-filename="citation-1.biblatex.bib">BibLaTeX</a>',
			].join('')
		);

		applyExportFilenames(document);

		const names = [...document.querySelectorAll('a')].map((a) =>
			a.getAttribute('download')
		);
		expect(names).toEqual([
			'citation-1.ris',
			'citation-1.csl.json',
			'citation-1.bib',
			'citation-1.biblatex.bib',
		]);
	});

	it('leaves links without the data attribute untouched', () => {
		panel('<a href="https://example.com">External</a>');

		applyExportFilenames(document);

		expect(document.querySelector('a').hasAttribute('download')).toBe(
			false
		);
	});
});
