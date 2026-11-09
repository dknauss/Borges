import { parseIeeeCitation, parseIeeeNames } from './free-text-ieee';
import { parseFreeTextCitation } from './free-text-parser';

describe( 'parseIeeeNames', () => {
	it( 'reads initials-first names joined by commas and "and"', () => {
		expect(
			parseIeeeNames(
				'C. R. Harris, M.-W. Chang, S. J. van der Walt, and G.V. Candler'
			)
		).toEqual( [
			{ given: 'C. R.', family: 'Harris' },
			{ given: 'M.-W.', family: 'Chang' },
			{ given: 'S. J.', family: 'van der Walt' },
			{ given: 'G.V.', family: 'Candler' },
		] );
		expect( parseIeeeNames( 'J-L. Gaudiot and D. Knauss' ) ).toEqual( [
			{ given: 'J-L.', family: 'Gaudiot' },
			{ given: 'D.', family: 'Knauss' },
		] );
	} );

	it( 'keeps "et al." and, when asked, one organization', () => {
		expect( parseIeeeNames( 'J. Devlin et al.' ) ).toEqual( [
			{ given: 'J.', family: 'Devlin' },
			{ literal: 'et al.' },
		] );
		expect( parseIeeeNames( 'WordPress.org' ) ).toEqual( [] );
		expect(
			parseIeeeNames( 'WordPress.org', { allowLiteral: true } )
		).toEqual( [ { literal: 'WordPress.org' } ] );
	} );

	it( 'rejects surname-first names and lower-case surnames', () => {
		expect( parseIeeeNames( 'Knuth, Donald E.' ) ).toEqual( [] );
		expect( parseIeeeNames( 'Donald E. Knuth' ) ).toEqual( [] );
		expect( parseIeeeNames( 'A. van der' ) ).toEqual( [] );
		expect(
			parseIeeeNames( 'Baputaki, C', { allowLiteral: true } )
		).toEqual( [] );
	} );
} );

describe( 'parseIeeeCitation', () => {
	it( 'reads a journal article with a DOI', () => {
		expect(
			parseIeeeCitation(
				'C. R. Harris, K. J. Millman, and R. Gommers, “Array programming with NumPy,” Nature, vol. 585, no. 7825, pp. 357–362, Sept. 2020, doi: 10.1038/s41586-020-2649-2.'
			)
		).toEqual( {
			csl: {
				type: 'article-journal',
				title: 'Array programming with NumPy',
				'container-title': 'Nature',
				volume: '585',
				issue: '7825',
				page: '357–362',
				issued: { 'date-parts': [ [ 2020, 9 ] ] },
				author: [
					{ given: 'C. R.', family: 'Harris' },
					{ given: 'K. J.', family: 'Millman' },
					{ given: 'R.', family: 'Gommers' },
				],
				DOI: '10.1038/s41586-020-2649-2',
			},
			confidence: 'low',
		} );
	} );

	it( 'reads an article number and a dated issue', () => {
		expect(
			parseIeeeCitation(
				'M. D. Wilkinson, “The FAIR Guiding Principles,” Sci. Data, vol. 3, Art. no. 160018, Mar. 15, 2016.'
			)?.csl
		).toMatchObject( {
			'container-title': 'Sci. Data',
			number: '160018',
			issued: { 'date-parts': [ [ 2016, 3, 15 ] ] },
		} );
	} );

	it( 'reads a book with an edition and a place', () => {
		expect(
			parseIeeeCitation(
				'T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, Introduction to algorithms, 3rd ed. Cambridge, MA: MIT Press, 2009.'
			)?.csl
		).toEqual( {
			type: 'book',
			title: 'Introduction to algorithms',
			author: [
				{ given: 'T. H.', family: 'Cormen' },
				{ given: 'C. E.', family: 'Leiserson' },
				{ given: 'R. L.', family: 'Rivest' },
				{ given: 'C.', family: 'Stein' },
			],
			'publisher-place': 'Cambridge, MA',
			publisher: 'MIT Press',
			edition: '3',
			issued: { 'date-parts': [ [ 2009 ] ] },
		} );
		expect(
			parseIeeeCitation(
				'T. H. Cormen et al., Introduction to algorithms. MIT Press, 2009.'
			)?.csl.author
		).toEqual( [
			{ given: 'T. H.', family: 'Cormen' },
			{ literal: 'et al.' },
		] );
	} );

	it( 'reads a chapter in an edited book', () => {
		expect(
			parseIeeeCitation(
				'J. L. Borges, “The library of Babel,” in Labyrinths, D. A. Yates and J. E. Irby, Eds. New York: New Directions, 1962, pp. 51–58.'
			)?.csl
		).toEqual( {
			type: 'chapter',
			title: 'The library of Babel',
			author: [ { given: 'J. L.', family: 'Borges' } ],
			'container-title': 'Labyrinths',
			editor: [
				{ given: 'D. A.', family: 'Yates' },
				{ given: 'J. E.', family: 'Irby' },
			],
			'publisher-place': 'New York',
			publisher: 'New Directions',
			page: '51–58',
			issued: { 'date-parts': [ [ 1962 ] ] },
		} );
	} );

	it( 'reads a conference paper with its publisher', () => {
		expect(
			parseIeeeCitation(
				'J. Devlin and K. Lee, “BERT,” in Proceedings of NAACL-HLT, Association for Computational Linguistics, 2019, pp. 4171–4186.'
			)?.csl
		).toMatchObject( {
			type: 'paper-conference',
			'container-title': 'Proceedings of NAACL-HLT',
			publisher: 'Association for Computational Linguistics',
			page: '4171–4186',
		} );
	} );

	it( 'reads an encyclopedia entry with no author', () => {
		expect(
			parseIeeeCitation( '“Isnād,” in Encyclopaedia Britannica.' )?.csl
		).toEqual( {
			type: 'entry-encyclopedia',
			title: 'Isnād',
			'container-title': 'Encyclopaedia Britannica',
		} );
	} );

	it( 'reads a preprint and a thesis', () => {
		expect(
			parseIeeeCitation(
				'A. Vaswani and N. Shazeer, “Attention is all you need,” arXiv:1706.03762 [cs.CL], 2017.'
			)?.csl
		).toMatchObject( {
			type: 'article',
			publisher: 'arXiv',
			number: 'arXiv:1706.03762',
			genre: 'Preprint',
		} );
		expect(
			parseIeeeCitation(
				'D. H. van Hessem, “Stochastic control,” Ph.D. dissertation, TU Delft, 2004.'
			)?.csl
		).toMatchObject( {
			type: 'thesis',
			genre: 'Ph.D. dissertation',
			publisher: 'TU Delft',
			issued: { 'date-parts': [ [ 2004 ] ] },
		} );
	} );

	it( 'reads web pages, with or without an author', () => {
		expect(
			parseIeeeCitation(
				'D. Knauss. “The page is an interface.” Marginalia. [Online]. Available: https://m.arginalia.com/the-page-is-an-interface/'
			)?.csl
		).toEqual( {
			type: 'webpage',
			title: 'The page is an interface',
			author: [ { given: 'D.', family: 'Knauss' } ],
			'container-title': 'Marginalia',
			URL: 'https://m.arginalia.com/the-page-is-an-interface/',
		} );
		expect(
			parseIeeeCitation(
				'“citation.” Accessed: Oct. 27, 2026. [Online]. Available: https://schema.org/citation'
			)?.csl
		).toEqual( {
			type: 'webpage',
			title: 'citation',
			URL: 'https://schema.org/citation',
			accessed: { 'date-parts': [ [ 2026, 10, 27 ] ] },
		} );
	} );

	it( 'skips an access date with an unknown month', () => {
		expect(
			parseIeeeCitation(
				'“citation.” Schema.org. Accessed: Foo. 27, 2026. [Online]. Available: https://schema.org/citation'
			)?.csl.accessed
		).toBeUndefined();
	} );

	it.each( [
		[
			'Chicago, with the surname first',
			'Knuth, Donald E. “Literate Programming.” The Computer Journal 27, no. 2 (1984): 97–111.',
		],
		[
			'names closed by a full stop before an unquoted title',
			'R. Fagin, J. Halpern, and M. Vardi. A model-theoretic analysis of knowledge. Journal of the ACM, 38(2), 382-428, 1991.',
		],
		[
			'an editor named before the title',
			'A. Elmagarmid, editor. Transaction Models for Advanced Database Applications. Morgan-Kaufmann, 1992.',
		],
		[
			'a journal part that is not a label or a date',
			'J. P. Callan, "Document Filtering," Proceedings of SIGIR, 262-269, 1996.',
		],
		[
			'a journal with no year',
			'L. Hernquist, "Vectorization of Tree Traversals," Journal of Computational Physics, vol. 87.',
		],
		[
			'a journal date with an unknown month',
			'L. Hernquist, "Vectorization," Journal of Computational Physics, Foo. 1990.',
		],
		[
			'a quoted title with no author and no link',
			'“Aeronautical Information Manual,” February 2012.',
		],
		[
			'a chapter with no year',
			'J. L. Borges, “The library of Babel,” in Labyrinths.',
		],
		[
			'editors that are not names',
			'J. L. Borges, “The library of Babel,” in Labyrinths, some friends, Eds. New Directions, 1962.',
		],
		[
			'a preprint with no year',
			'A. Vaswani, “Attention is all you need,” arXiv:1706.03762, soon.',
		],
		[
			'a thesis with no year',
			'D. H. van Hessem, “Stochastic control,” Ph.D. dissertation, TU Delft, soon.',
		],
		[
			'a book whose publisher holds numbers',
			'A. Grafton, The footnote. Journal of the ACM, 38(2), 1997.',
		],
		[ 'an empty title', 'D. Knauss, “,” Nature, vol. 1, 2001.' ],
		[
			'editors with no container before them',
			'J. L. Borges, “The library of Babel,” in Labyrinths, Eds. New Directions, 1962.',
		],
	] )( 'declines %s', ( _, input ) => {
		expect( parseIeeeCitation( input ) ).toBeNull();
	} );
} );

describe( 'IEEE patterns on hostile input', () => {
	it( 'reads a long run of commas before "Eds." in linear time', () => {
		const input = `J. L. Borges, “T,” in a${ ', '.repeat( 20000 ) }x, Eds. P, 1962.`;
		const start = Date.now();

		parseIeeeCitation( input );

		expect( Date.now() - start ).toBeLessThan( 1000 );
	} );
} );

describe( 'IEEE style hint', () => {
	it( 'reads IEEE without a hint, after the other patterns decline', () => {
		const book =
			'A. Grafton, The footnote: a curious history. Cambridge, MA: Harvard University Press, 1997.';

		expect( parseFreeTextCitation( book )?.csl ).toMatchObject( {
			type: 'book',
			author: [ { given: 'A.', family: 'Grafton' } ],
		} );
		expect( parseFreeTextCitation( book, { styleKey: 'ieee' } ) ).toEqual(
			parseFreeTextCitation( book )
		);
	} );
} );

describe( 'IEEE edge cases from review', () => {
	it( 'reads "in Proc. …" as a conference paper', () => {
		const { csl } = parseIeeeCitation(
			'J. Devlin, “BERT,” in Proc. NAACL-HLT, Association for Computational Linguistics, 2019, pp. 4171–4186.'
		);

		expect( csl ).toMatchObject( { type: 'paper-conference' } );
	} );
} );
