import { resetLocaleData, setLocaleData } from '@wordpress/i18n';
import {
	applyExportFilenames,
	attachCiteCopy,
	localizeCiteExport,
	localizeLinkLabels,
} from './view';

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

describe('localizeCiteExport (runtime translation of saved labels)', () => {
	const DOMAIN = 'borges-bibliography-builder';

	beforeEach(() => {
		setLocaleData(
			{
				'': { domain: DOMAIN },
				'Cite / Export': ['Citer / Exporter'],
				'Copy citation': ['Copier la citation'],
				Copied: ['Copié'],
				RIS: ['RIS-fr'],
				'CSL-JSON': ['CSL-JSON-fr'],
				BibTeX: ['BibTeX-fr'],
				BibLaTeX: ['BibLaTeX-fr'],
			},
			DOMAIN
		);
	});

	afterEach(() => {
		resetLocaleData(undefined, DOMAIN);
		document.body.innerHTML = '';
		jest.useRealTimers();
	});

	function savedPanel(extraButtonAttributes = '') {
		document.body.innerHTML = [
			'<details class="bibliography-builder-cite-export">',
			'<summary class="bibliography-builder-cite-export-toggle">Cite / Export</summary>',
			'<div class="bibliography-builder-cite-export-panel">',
			`<button type="button" class="bibliography-builder-cite-copy" data-cite-text="X"${extraButtonAttributes}>Copy citation</button>`,
			'<ul class="bibliography-builder-export-links">',
			'<li><a download data-cite-export-filename="c.ris">RIS</a></li>',
			'<li><a download data-cite-export-filename="c.csl.json">CSL-JSON</a></li>',
			'<li><a download data-cite-export-filename="c.bib">BibTeX</a></li>',
			'<li><a download data-cite-export-filename="c.biblatex.bib">BibLaTeX</a></li>',
			'</ul></div></details>',
		].join('');
	}

	it('translates the canonical English labels saved in post content', () => {
		savedPanel();

		localizeCiteExport(document);

		expect(document.querySelector('summary').textContent).toBe(
			'Citer / Exporter'
		);
		expect(document.querySelector('button').textContent).toBe(
			'Copier la citation'
		);
		expect(
			[
				...document.querySelectorAll(
					'.bibliography-builder-export-links a'
				),
			].map((a) => a.textContent)
		).toEqual(['RIS-fr', 'CSL-JSON-fr', 'BibTeX-fr', 'BibLaTeX-fr']);
	});

	it('leaves labels from older, already-localized markup alone', () => {
		document.body.innerHTML =
			'<details class="bibliography-builder-cite-export"><summary class="bibliography-builder-cite-export-toggle">Zitieren / Exportieren</summary></details>';

		localizeCiteExport(document);

		expect(document.querySelector('summary').textContent).toBe(
			'Zitieren / Exportieren'
		);
	});

	it('shows the translated copied label when the markup carries none', async () => {
		jest.useFakeTimers();
		const writeText = jest.fn().mockResolvedValue();
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});
		savedPanel();
		localizeCiteExport(document);
		attachCiteCopy(document);

		const button = document.querySelector('button');
		button.click();
		await Promise.resolve();
		expect(button.textContent).toBe('Copié');
		jest.advanceTimersByTime(2000);
		expect(button.textContent).toBe('Copier la citation');
	});

	it('translates a legacy English copied label but keeps a localized one', async () => {
		jest.useFakeTimers();
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText: jest.fn().mockResolvedValue() },
		});

		savedPanel(' data-copied-label="Copied"');
		attachCiteCopy(document);
		document.querySelector('button').click();
		await Promise.resolve();
		expect(document.querySelector('button').textContent).toBe('Copié');

		savedPanel(' data-copied-label="Kopiert"');
		attachCiteCopy(document);
		document.querySelector('button').click();
		await Promise.resolve();
		expect(document.querySelector('button').textContent).toBe('Kopiert');
	});
});

describe('localizeLinkLabels (legacy fallback aria-label)', () => {
	const DOMAIN = 'borges-bibliography-builder';

	afterEach(() => {
		resetLocaleData(undefined, DOMAIN);
		document.body.innerHTML = '';
	});

	it('translates the English fallback prefix saved by older markup', () => {
		setLocaleData(
			{
				'': { domain: DOMAIN },
				'Link to publication': ['Lien vers la publication'],
			},
			DOMAIN
		);
		document.body.innerHTML = [
			'<section class="wp-block-bibliography-builder-bibliography"><cite class="bibliography-builder-entry-text">',
			'<a href="https://e.org/x" aria-label="Link to publication — https://e.org/x">https://e.org/x</a>',
			'<a href="https://e.org/y" aria-label="Some Title — https://e.org/y">https://e.org/y</a>',
			'</cite></section>',
		].join('');

		localizeLinkLabels(document);

		const [fallback, titled] = document.querySelectorAll('a');
		expect(fallback.getAttribute('aria-label')).toBe(
			'Lien vers la publication — https://e.org/x'
		);
		expect(titled.getAttribute('aria-label')).toBe(
			'Some Title — https://e.org/y'
		);
	});
});
