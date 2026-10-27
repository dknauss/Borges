import fs from 'node:fs';
import path from 'node:path';

import { STYLE_DEFINITIONS } from './formatting/style-registry';
import {
	demotesParticleForSort,
	getSortFamily,
	splitNameParticle,
} from './name-particles';

describe( 'splitNameParticle', () => {
	it.each( [
		[ 'van Duijnhoven', 'van', 'Duijnhoven' ],
		[ 'van der Waals', 'van der', 'Waals' ],
		[ 'de la Cruz', 'de la', 'Cruz' ],
		[ 'von Neumann', 'von', 'Neumann' ],
		[ "d'Alembert", "d'", 'Alembert' ],
		[ 'd’Alembert', 'd’', 'Alembert' ],
		[ '  van Gogh', 'van', 'Gogh' ],
	] )( 'splits %p', ( family, particle, rest ) => {
		expect( splitNameParticle( family ) ).toEqual( {
			particle,
			family: rest,
		} );
	} );

	it.each( [
		[ 'Van Buren', 'a capitalized particle is part of the surname' ],
		[ 'De Witt', 'a capitalized particle is part of the surname' ],
		[ 'van der', 'particles with no surname after them' ],
		[ 'van gogh', 'a lowercase surname after the particle' ],
		[ 'al-Khwarizmi', 'a hyphenated prefix' ],
		[ 'Duijnhoven', 'no particle' ],
		[ "O'Brien", 'a capitalized elision' ],
		[ 42, 'a non-string family' ],
	] )( 'leaves %p alone (%s)', ( family ) => {
		expect( splitNameParticle( family ) ).toBeNull();
	} );
} );

describe( 'getSortFamily', () => {
	it( 'sorts by the surname when the style demotes the particle', () => {
		expect( getSortFamily( { family: 'van Duijnhoven' }, true ) ).toBe(
			'Duijnhoven'
		);
		expect(
			getSortFamily(
				{ family: 'Neumann', 'non-dropping-particle': 'von' },
				true
			)
		).toBe( 'Neumann' );
		expect( getSortFamily( { family: "d'Alembert" }, true ) ).toBe(
			'Alembert'
		);
	} );

	it( 'keeps the particle in front when the style does not demote it', () => {
		expect( getSortFamily( { family: 'van Duijnhoven' }, false ) ).toBe(
			'van Duijnhoven'
		);
		expect(
			getSortFamily(
				{ family: 'Neumann', 'non-dropping-particle': 'von' },
				false
			)
		).toBe( 'von Neumann' );
		expect(
			getSortFamily(
				{ family: 'Alembert', 'non-dropping-particle': 'd’' },
				false
			)
		).toBe( 'd’Alembert' );
	} );

	it( 'ignores a dropping particle and returns empty for a nameless entry', () => {
		expect(
			getSortFamily(
				{ family: 'Beethoven', 'dropping-particle': 'van' },
				false
			)
		).toBe( 'Beethoven' );
		expect( getSortFamily( { literal: 'UNESCO' }, false ) ).toBe( '' );
	} );
} );

describe( 'demotesParticleForSort', () => {
	it( 'demotes for display-and-sort and sort-only, not for never', () => {
		expect( demotesParticleForSort( 'display-and-sort' ) ).toBe( true );
		expect( demotesParticleForSort( 'sort-only' ) ).toBe( true );
		expect( demotesParticleForSort( 'never' ) ).toBe( false );
		expect( demotesParticleForSort( undefined ) ).toBe( false );
	} );
} );

describe( 'style registry particle settings', () => {
	const STYLE_DIR = path.resolve(
		__dirname,
		'../../packages/citation-style-language-styles'
	);

	it.each( Object.values( STYLE_DEFINITIONS ) )(
		'$key matches its bundled CSL style',
		( { cslTemplate, demoteNonDroppingParticle } ) => {
			const xml = fs.readFileSync(
				path.join( STYLE_DIR, `${ cslTemplate }.csl` ),
				'utf8'
			);
			const declared = xml.match(
				/demote-non-dropping-particle="([^"]+)"/
			);

			expect( demoteNonDroppingParticle ).toBe(
				declared ? declared[ 1 ] : 'display-and-sort'
			);
		}
	);
} );
