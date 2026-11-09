import { parseHarvardCitation, parseHarvardNames } from './free-text-harvard';
import { parseFreeTextCitation } from './free-text-parser';

describe( 'parseHarvardNames', () => {
	it( 'reads initials-last names joined by commas and "and"', () => {
		expect(
			parseHarvardNames( 'LeCun, Y., Bengio, Y. and Hinton, G.' )
		).toEqual( [
			{ family: 'LeCun', given: 'Y.' },
			{ family: 'Bengio', given: 'Y.' },
			{ family: 'Hinton', given: 'G.' },
		] );
	} );

	it( 'keeps "et al." and organizations', () => {
		expect( parseHarvardNames( 'Cormen, T.H. et al.' ) ).toEqual( [
			{ family: 'Cormen', given: 'T.H.' },
			{ literal: 'et al.' },
		] );
		expect( parseHarvardNames( 'WordPress.org' ) ).toEqual( [
			{ literal: 'WordPress.org' },
		] );
	} );

	it( 'rejects text that is not a name list', () => {
		expect(
			parseHarvardNames( 'The Competitiveness of the Industry.' )
		).toEqual( [] );
		expect( parseHarvardNames( 'Smith, J., Jones' ) ).toEqual( [] );
		expect( parseHarvardNames( 'Smith, a study of things' ) ).toEqual( [] );
	} );
} );

describe( 'parseHarvardCitation', () => {
	it( 'reads a journal article with a DOI link', () => {
		expect(
			parseHarvardCitation(
				'Knuth, D.E. (1984) ‘Literate programming’, The Computer Journal, 27(2), pp. 97–111. Available at: https://doi.org/10.1093/comjnl/27.2.97.'
			)
		).toEqual( {
			csl: {
				type: 'article-journal',
				title: 'Literate programming',
				'container-title': 'The Computer Journal',
				volume: '27',
				issue: '2',
				page: '97–111',
				author: [ { family: 'Knuth', given: 'D.E.' } ],
				issued: { 'date-parts': [ [ 1984 ] ] },
				DOI: '10.1093/comjnl/27.2.97',
			},
			confidence: 'low',
		} );
	} );

	it( 'reads an article with a month instead of a volume', () => {
		expect(
			parseHarvardCitation(
				'Brand, S. and Herron, M. (1985) ‘Keep designing’, Whole Earth Review, May, p. 44.'
			)?.csl
		).toMatchObject( {
			type: 'article-journal',
			'container-title': 'Whole Earth Review',
			issue: 'May',
			page: '44',
		} );
	} );

	it( 'reads a book with an edition and a place', () => {
		expect(
			parseHarvardCitation(
				'Cormen, T.H. et al. (2009) Introduction to algorithms. 3rd edn. Cambridge, MA: MIT Press.'
			)?.csl
		).toEqual( {
			type: 'book',
			title: 'Introduction to algorithms',
			'publisher-place': 'Cambridge, MA',
			publisher: 'MIT Press',
			edition: '3',
			author: [
				{ family: 'Cormen', given: 'T.H.' },
				{ literal: 'et al.' },
			],
			issued: { 'date-parts': [ [ 2009 ] ] },
		} );
	} );

	it( 'reads a chapter in an edited book', () => {
		expect(
			parseHarvardCitation(
				'Borges, J.L. (1962) ‘The library of Babel’, in Yates, D.A. and Irby, J.E. (eds) Labyrinths: Selected stories and other writings. New Directions, pp. 51–58.'
			)?.csl
		).toEqual( {
			type: 'chapter',
			title: 'The library of Babel',
			'container-title':
				'Labyrinths: Selected stories and other writings',
			editor: [
				{ family: 'Yates', given: 'D.A.' },
				{ family: 'Irby', given: 'J.E.' },
			],
			publisher: 'New Directions',
			page: '51–58',
			author: [ { family: 'Borges', given: 'J.L.' } ],
			issued: { 'date-parts': [ [ 1962 ] ] },
		} );
	} );

	it( 'reads a conference paper and a preprint', () => {
		expect(
			parseHarvardCitation(
				'Devlin, J. et al. (2019) ‘BERT’, in Proceedings of NAACL-HLT 2019. Association for Computational Linguistics, pp. 4171–4186.'
			)?.csl
		).toMatchObject( {
			type: 'paper-conference',
			'container-title': 'Proceedings of NAACL-HLT 2019',
			publisher: 'Association for Computational Linguistics',
		} );
		expect(
			parseHarvardCitation(
				'Vaswani, A. et al. (2017) ‘Attention is all you need’. arXiv [Preprint]. Available at: https://doi.org/10.48550/arXiv.1706.03762.'
			)?.csl
		).toMatchObject( {
			type: 'article',
			publisher: 'arXiv',
			genre: 'Preprint',
			DOI: '10.48550/arXiv.1706.03762',
		} );
	} );

	it( 'reads web pages, with or without an author', () => {
		expect(
			parseHarvardCitation(
				'WordPress.org (no date) Block editor handbook. Available at: https://developer.wordpress.org/block-editor/ (Accessed: 27 October 2026).'
			)?.csl
		).toEqual( {
			type: 'webpage',
			title: 'Block editor handbook',
			author: [ { literal: 'WordPress.org' } ],
			URL: 'https://developer.wordpress.org/block-editor/',
			accessed: { 'date-parts': [ [ 2026, 10, 27 ] ] },
		} );
		expect(
			parseHarvardCitation(
				'Structured data is valid (2019) Available at: https://developer.chrome.com/docs/lighthouse/seo/structured-data [Accessed 27 October 2026].'
			)?.csl
		).toEqual( {
			type: 'webpage',
			title: 'Structured data is valid',
			issued: { 'date-parts': [ [ 2019 ] ] },
			URL: 'https://developer.chrome.com/docs/lighthouse/seo/structured-data',
			accessed: { 'date-parts': [ [ 2026, 10, 27 ] ] },
		} );
	} );

	it( 'reads an encyclopedia entry with no author', () => {
		expect(
			parseHarvardCitation(
				'‘Isnād’ (no date) ‘Isnād’, in Encyclopaedia britannica. Available at: https://www.britannica.com/topic/isnad (Accessed: 27 October 2026).'
			)?.csl
		).toMatchObject( {
			type: 'entry-encyclopedia',
			title: 'Isnād',
			'container-title': 'Encyclopaedia britannica',
		} );
	} );

	it.each( [
		[
			'APA, with a full stop after the year',
			'Grafton, A. (1997). The footnote: A curious history. Harvard University Press.',
		],
		[
			'an original date in brackets',
			'Saussure, F. de (1968) [1916]. Cours de linguistique générale. Paris: Payot.',
		],
		[
			'a title ending in a full stop where the author should be',
			'The Competitiveness of the Industry. (2000) Prepared by Media Group. Luxembourg: Office for Publications.',
		],
		[
			'a web page with no link',
			'Knauss, D. (2026) The page is an interface.',
		],
		[ 'no year', 'Knauss, D. The page is an interface. Penguin.' ],
	] )( 'declines %s', ( _, input ) => {
		expect( parseHarvardCitation( input ) ).toBeNull();
	} );
} );

describe( 'style hint', () => {
	const harvardBook =
		'Grafton, A. (1997) The footnote: a curious history. Harvard University Press.';

	it( 'reads Harvard without a hint, after the other patterns decline', () => {
		expect( parseFreeTextCitation( harvardBook )?.csl ).toMatchObject( {
			type: 'book',
			title: 'The footnote: a curious history',
		} );
	} );

	it( 'gives the same result with the Harvard hint', () => {
		expect(
			parseFreeTextCitation( harvardBook, { styleKey: 'harvard' } )
		).toEqual( parseFreeTextCitation( harvardBook ) );
	} );

	it( 'leaves APA citations to the APA patterns under the Harvard hint', () => {
		const apa =
			'Grafton, A. (1997). The footnote: A curious history. Harvard University Press.';

		expect( parseFreeTextCitation( apa, { styleKey: 'harvard' } ) ).toEqual(
			parseFreeTextCitation( apa )
		);
	} );

	it( 'ignores an unknown style key', () => {
		expect(
			parseFreeTextCitation( harvardBook, { styleKey: 'nope' } )
		).toEqual( parseFreeTextCitation( harvardBook ) );
	} );
} );
