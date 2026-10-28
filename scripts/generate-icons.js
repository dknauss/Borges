/* eslint-disable no-console, no-bitwise */
/**
 * Generate plugin icon PNGs from the dashicons "book" SVG path.
 * White background, #3c434a fill — matches the banner style.
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require( 'fs' );
const path = require( 'path' );
const zlib = require( 'zlib' );

const OUTPUT_DIR = path.resolve( __dirname, '../.wordpress-org' );

// Dashicons "book" — 20x20 viewBox.
// Source: https://developer.wordpress.org/resource/dashicons/#book
const BOOK_PATH =
	'M16 3h2v16H5c-1.66 0-3-1.34-3-3V4c0-1.66 1.34-3 3-3h9v14H5' +
	'c-.55 0-1 .45-1 1s.45 1 1 1h11z';
const VIEW = 20;

const BG = { r: 255, g: 255, b: 255 };
const FG = { r: 60, g: 67, b: 74 }; // #3c434a

// --- Minimal SVG path parser ---

function parsePath( d ) {
	const tokens = d.match(
		/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g
	);
	const cmds = [];
	let i = 0;
	while ( i < tokens.length ) {
		if ( /[A-Za-z]/.test( tokens[ i ] ) ) {
			const cmd = tokens[ i++ ];
			const args = [];
			while ( i < tokens.length && ! /[A-Za-z]/.test( tokens[ i ] ) ) {
				args.push( parseFloat( tokens[ i++ ] ) );
			}
			cmds.push( { cmd, args } );
		} else {
			i++;
		}
	}
	return cmds;
}

// --- Path to polygon conversion ---

function pathToPolygons( d ) {
	const cmds = parsePath( d );
	const polys = [];
	let poly = [];
	let cx = 0,
		cy = 0,
		startX = 0,
		startY = 0;

	function bezierQ( x0, y0, x1, y1, x2, y2 ) {
		for ( let t = 0.02; t <= 1.0; t += 0.02 ) {
			const mt = 1 - t;
			poly.push( [
				mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
				mt * mt * y0 + 2 * mt * t * y1 + t * t * y2,
			] );
		}
	}

	function bezierC( x0, y0, x1, y1, x2, y2, x3, y3 ) {
		for ( let t = 0.02; t <= 1.0; t += 0.02 ) {
			const mt = 1 - t;
			poly.push( [
				mt * mt * mt * x0 +
					3 * mt * mt * t * x1 +
					3 * mt * t * t * x2 +
					t * t * t * x3,
				mt * mt * mt * y0 +
					3 * mt * mt * t * y1 +
					3 * mt * t * t * y2 +
					t * t * t * y3,
			] );
		}
	}

	for ( const { cmd, args } of cmds ) {
		const rel = cmd === cmd.toLowerCase();
		switch ( cmd.toUpperCase() ) {
			case 'M':
				if ( poly.length > 1 ) {
					polys.push( poly );
				}
				poly = [];
				cx = rel ? cx + args[ 0 ] : args[ 0 ];
				cy = rel ? cy + args[ 1 ] : args[ 1 ];
				startX = cx;
				startY = cy;
				poly.push( [ cx, cy ] );
				for ( let j = 2; j < args.length; j += 2 ) {
					cx = rel ? cx + args[ j ] : args[ j ];
					cy = rel ? cy + args[ j + 1 ] : args[ j + 1 ];
					poly.push( [ cx, cy ] );
				}
				break;
			case 'L':
				for ( let j = 0; j < args.length; j += 2 ) {
					cx = rel ? cx + args[ j ] : args[ j ];
					cy = rel ? cy + args[ j + 1 ] : args[ j + 1 ];
					poly.push( [ cx, cy ] );
				}
				break;
			case 'H':
				for ( let j = 0; j < args.length; j++ ) {
					cx = rel ? cx + args[ j ] : args[ j ];
					poly.push( [ cx, cy ] );
				}
				break;
			case 'V':
				for ( let j = 0; j < args.length; j++ ) {
					cy = rel ? cy + args[ j ] : args[ j ];
					poly.push( [ cx, cy ] );
				}
				break;
			case 'C':
				for ( let j = 0; j < args.length; j += 6 ) {
					const x1 = rel ? cx + args[ j ] : args[ j ];
					const y1 = rel ? cy + args[ j + 1 ] : args[ j + 1 ];
					const x2 = rel ? cx + args[ j + 2 ] : args[ j + 2 ];
					const y2 = rel ? cy + args[ j + 3 ] : args[ j + 3 ];
					const x3 = rel ? cx + args[ j + 4 ] : args[ j + 4 ];
					const y3 = rel ? cy + args[ j + 5 ] : args[ j + 5 ];
					bezierC( cx, cy, x1, y1, x2, y2, x3, y3 );
					cx = x3;
					cy = y3;
				}
				break;
			case 'S': {
				for ( let j = 0; j < args.length; j += 4 ) {
					const x2 = rel ? cx + args[ j ] : args[ j ];
					const y2 = rel ? cy + args[ j + 1 ] : args[ j + 1 ];
					const x3 = rel ? cx + args[ j + 2 ] : args[ j + 2 ];
					const y3 = rel ? cy + args[ j + 3 ] : args[ j + 3 ];
					bezierC( cx, cy, cx, cy, x2, y2, x3, y3 );
					cx = x3;
					cy = y3;
				}
				break;
			}
			case 'Q':
				for ( let j = 0; j < args.length; j += 4 ) {
					const x1 = rel ? cx + args[ j ] : args[ j ];
					const y1 = rel ? cy + args[ j + 1 ] : args[ j + 1 ];
					const x2 = rel ? cx + args[ j + 2 ] : args[ j + 2 ];
					const y2 = rel ? cy + args[ j + 3 ] : args[ j + 3 ];
					bezierQ( cx, cy, x1, y1, x2, y2 );
					cx = x2;
					cy = y2;
				}
				break;
			case 'Z':
				cx = startX;
				cy = startY;
				if ( poly.length > 1 ) {
					polys.push( poly );
				}
				poly = [];
				break;
		}
	}
	if ( poly.length > 1 ) {
		polys.push( poly );
	}
	return polys;
}

// --- Scanline rasterizer with 4x supersampling ---

function rasterize( polys, size, padding ) {
	const inner = size - padding * 2;
	const ss = 4;
	const ssSize = size * ss;
	const mask = new Uint8Array( ssSize * ssSize );

	const scale = inner / VIEW;
	const offset = padding;

	const scaled = polys.map( ( poly ) =>
		poly.map( ( [ x, y ] ) => [
			( x * scale + offset ) * ss,
			( y * scale + offset ) * ss,
		] )
	);

	for ( let y = 0; y < ssSize; y++ ) {
		const crossings = [];
		for ( const poly of scaled ) {
			for ( let i = 0; i < poly.length; i++ ) {
				const [ x1, y1 ] = poly[ i ];
				const [ x2, y2 ] = poly[ ( i + 1 ) % poly.length ];
				if ( ( y1 <= y && y2 > y ) || ( y2 <= y && y1 > y ) ) {
					const t = ( y - y1 ) / ( y2 - y1 );
					crossings.push( {
						x: x1 + t * ( x2 - x1 ),
						dir: y2 > y1 ? 1 : -1,
					} );
				}
			}
		}
		crossings.sort( ( a, b ) => a.x - b.x );

		let winding = 0;
		for ( let i = 0; i < crossings.length - 1; i++ ) {
			winding += crossings[ i ].dir;
			if ( winding !== 0 ) {
				const xStart = Math.max( 0, Math.ceil( crossings[ i ].x ) );
				const xEnd = Math.min(
					ssSize - 1,
					Math.floor( crossings[ i + 1 ].x )
				);
				for ( let x = xStart; x <= xEnd; x++ ) {
					mask[ y * ssSize + x ] = 1;
				}
			}
		}
	}

	// Downsample
	const alpha = new Float32Array( size * size );
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			let sum = 0;
			for ( let sy = 0; sy < ss; sy++ ) {
				for ( let sx = 0; sx < ss; sx++ ) {
					sum += mask[ ( y * ss + sy ) * ssSize + ( x * ss + sx ) ];
				}
			}
			alpha[ y * size + x ] = sum / ( ss * ss );
		}
	}
	return alpha;
}

// --- PNG encoder ---

const crcTable = new Uint32Array( 256 );
for ( let n = 0; n < 256; n++ ) {
	let c = n;
	for ( let k = 0; k < 8; k++ ) {
		c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
	}
	crcTable[ n ] = c;
}

function crc32( buf ) {
	let c = 0xffffffff;
	for ( let i = 0; i < buf.length; i++ ) {
		c = crcTable[ ( c ^ buf[ i ] ) & 0xff ] ^ ( c >>> 8 );
	}
	return c ^ 0xffffffff;
}

function makeChunk( type, data ) {
	const len = Buffer.alloc( 4 );
	len.writeUInt32BE( data.length, 0 );
	const typeB = Buffer.from( type );
	const crcB = Buffer.alloc( 4 );
	crcB.writeUInt32BE( crc32( Buffer.concat( [ typeB, data ] ) ) >>> 0, 0 );
	return Buffer.concat( [ len, typeB, data, crcB ] );
}

function encodePNG( pixels, width, height ) {
	const sig = Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] );
	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( width, 0 );
	ihdr.writeUInt32BE( height, 4 );
	ihdr[ 8 ] = 8;
	ihdr[ 9 ] = 6;
	const raw = Buffer.alloc( height * ( 1 + width * 4 ) );
	for ( let y = 0; y < height; y++ ) {
		raw[ y * ( 1 + width * 4 ) ] = 0;
		pixels.copy(
			raw,
			y * ( 1 + width * 4 ) + 1,
			y * width * 4,
			( y + 1 ) * width * 4
		);
	}
	return Buffer.concat( [
		sig,
		makeChunk( 'IHDR', ihdr ),
		makeChunk( 'IDAT', zlib.deflateSync( raw ) ),
		makeChunk( 'IEND', Buffer.alloc( 0 ) ),
	] );
}

// --- Main ---

function createIcon( size, padding ) {
	const polys = pathToPolygons( BOOK_PATH );
	const alpha = rasterize( polys, size, padding );

	const pixels = Buffer.alloc( size * size * 4 );
	for ( let i = 0; i < size * size; i++ ) {
		const a = alpha[ i ];
		const idx = i * 4;
		pixels[ idx ] = Math.round( BG.r * ( 1 - a ) + FG.r * a );
		pixels[ idx + 1 ] = Math.round( BG.g * ( 1 - a ) + FG.g * a );
		pixels[ idx + 2 ] = Math.round( BG.b * ( 1 - a ) + FG.b * a );
		pixels[ idx + 3 ] = 255;
	}
	return encodePNG( pixels, size, size );
}

fs.writeFileSync(
	path.join( OUTPUT_DIR, 'icon-256x256.png' ),
	createIcon( 256, 30 )
);
fs.writeFileSync(
	path.join( OUTPUT_DIR, 'icon-128x128.png' ),
	createIcon( 128, 15 )
);
console.log( 'Icons saved to %s/', OUTPUT_DIR );
