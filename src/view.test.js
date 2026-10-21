import { readFileSync } from 'fs';
import { join } from 'path';
import {
	applyExportFilenames,
	attachCiteCopy,
	buildCiteExportPanels,
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

	it('shows a server-supplied copied label', async () => {
		const button = copyPanel('X');
		button.setAttribute('data-copied-label', 'Copié');
		attachCiteCopy(document);
		button.click();
		await Promise.resolve();

		expect(button.textContent).toBe('Copié');
	});
});

describe('view.js translation', () => {
	it('loads no i18n library: labels arrive translated from the server', () => {
		// includes/frontend-labels.php translates the saved labels as the block
		// renders. Importing @wordpress/i18n here would add wp-i18n and
		// wp-hooks to every page that shows a bibliography.
		const source = readFileSync(join(__dirname, 'view.js'), 'utf8');

		expect(source).not.toMatch(/@wordpress\/i18n|cite-export-labels/);
	});
});

describe('buildCiteExportPanels (panel built from saved data)', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	function bibliography(entryAttributes, sectionAttributes = '') {
		document.body.innerHTML = `<section class="wp-block-bibliography-builder-bibliography"${sectionAttributes}><ul><li id="ref-a"${entryAttributes}><span class="bibliography-builder-entry-text">Alpha, Ada. <i>A Book</i>.</span></li></ul></section>`;
	}

	const fullData =
		' data-cite-text="Alpha, Ada. A Book." data-cite-filename="Alpha-2018"' +
		' data-cite-ris="TY  - BOOK&#10;ER  - " data-cite-csl-json="{&quot;type&quot;: &quot;book&quot;}&#10;"' +
		' data-cite-bibtex="@book{a}" data-cite-biblatex="@book{a, date = {2018}}"';

	it('builds the same panel that save() used to write, after the entry text', () => {
		bibliography(fullData);
		buildCiteExportPanels(document);

		const entry = document.querySelector('#ref-a');
		const details = entry.lastElementChild;

		expect(
			details.matches('details.bibliography-builder-cite-export')
		).toBe(true);
		expect(details.querySelector('summary').textContent).toBe(
			'Cite / Export'
		);

		const copy = details.querySelector('.bibliography-builder-cite-copy');
		expect(copy.getAttribute('type')).toBe('button');
		expect(copy.getAttribute('data-cite-text')).toBe('Alpha, Ada. A Book.');
		expect(copy.getAttribute('data-copied-label')).toBe('Copied');

		const links = [...details.querySelectorAll('a')];
		expect(links.map((a) => a.textContent)).toEqual([
			'RIS',
			'CSL-JSON',
			'BibTeX',
			'BibLaTeX',
		]);
		expect(links.map((a) => a.getAttribute('download'))).toEqual([
			'Alpha-2018.ris',
			'Alpha-2018.csl.json',
			'Alpha-2018.bib',
			'Alpha-2018.biblatex.bib',
		]);
		expect(decodeURIComponent(links[0].getAttribute('href'))).toBe(
			'data:application/x-research-info-systems;charset=utf-8,TY  - BOOK\nER  - '
		);
		expect(decodeURIComponent(links[1].getAttribute('href'))).toBe(
			'data:application/vnd.citationstyles.csl+json;charset=utf-8,{"type": "book"}\n'
		);
	});

	it('offers only the downloads the entry has data for', () => {
		bibliography(
			' data-cite-text="x" data-cite-filename="x" data-cite-ris="TY  - BOOK" data-cite-csl-json="{}"'
		);
		buildCiteExportPanels(document);

		expect(
			[...document.querySelectorAll('a')].map((a) => a.textContent)
		).toEqual(['RIS', 'CSL-JSON']);
	});

	it('uses translated labels from the section when the server supplies them', () => {
		bibliography(
			fullData,
			` data-cite-labels='{"toggle":"Citer / Exporter","copied":"Copié"}'`
		);
		buildCiteExportPanels(document);

		expect(document.querySelector('summary').textContent).toBe(
			'Citer / Exporter'
		);
		expect(
			document
				.querySelector('.bibliography-builder-cite-copy')
				.getAttribute('data-copied-label')
		).toBe('Copié');
		expect(document.querySelector('a').textContent).toBe('RIS');
	});

	it('builds each panel once, and leaves entries without data alone', () => {
		bibliography(fullData);
		document
			.querySelector('ul')
			.insertAdjacentHTML(
				'beforeend',
				'<li id="ref-b"><span class="bibliography-builder-entry-text">Beta.</span></li>'
			);
		buildCiteExportPanels(document);
		buildCiteExportPanels(document);

		expect(
			document.querySelectorAll(
				'#ref-a .bibliography-builder-cite-export'
			)
		).toHaveLength(1);
		expect(
			document.querySelector('#ref-b .bibliography-builder-cite-export')
		).toBeNull();
	});

	it('wires the built copy button to the clipboard', () => {
		const writeText = jest.fn(() => Promise.resolve());
		Object.defineProperty(window.navigator, 'clipboard', {
			value: { writeText },
			configurable: true,
		});
		bibliography(fullData);
		buildCiteExportPanels(document);
		attachCiteCopy(document);

		document.querySelector('.bibliography-builder-cite-copy').click();

		expect(writeText).toHaveBeenCalledWith('Alpha, Ada. A Book.');
	});
});
