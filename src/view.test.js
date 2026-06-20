import { applyExportFilenames, attachCiteCopy } from './view';

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

describe('attachCiteCopy (cite copy-to-clipboard PE)', () => {
	let writeText;

	beforeEach(() => {
		writeText = jest.fn().mockResolvedValue();
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});
	});

	afterEach(() => {
		document.body.innerHTML = '';
		jest.useRealTimers();
	});

	function copyPanel(citeText = 'Smith, A. Example. 2024.') {
		document.body.innerHTML = `<div class="bibliography-builder-cite-export"><button class="bibliography-builder-cite-copy" data-cite-text="${citeText}">Copy citation</button></div>`;
		return document.querySelector('button');
	}

	it('copies the citation text to the clipboard on click', () => {
		const button = copyPanel('Smith, A. Example. 2024.');
		attachCiteCopy(document);
		button.click();
		expect(writeText).toHaveBeenCalledWith('Smith, A. Example. 2024.');
	});

	it('does nothing when there is no cite text', () => {
		document.body.innerHTML =
			'<div class="bibliography-builder-cite-export"><button class="bibliography-builder-cite-copy" data-cite-text="">Copy citation</button></div>';
		attachCiteCopy(document);
		document.querySelector('button').click();
		expect(writeText).not.toHaveBeenCalled();
	});

	it('binds each button once even if called repeatedly', () => {
		const button = copyPanel('X');
		attachCiteCopy(document);
		attachCiteCopy(document);
		button.click();
		expect(writeText).toHaveBeenCalledTimes(1);
	});

	it('shows copied feedback then restores the original label', async () => {
		jest.useFakeTimers();
		const button = copyPanel('X');
		attachCiteCopy(document);
		button.click();
		await Promise.resolve();
		expect(button.textContent).toBe('Copied');
		expect(button.classList.contains('is-copied')).toBe(true);
		jest.advanceTimersByTime(2000);
		expect(button.textContent).toBe('Copy citation');
		expect(button.classList.contains('is-copied')).toBe(false);
	});
});
