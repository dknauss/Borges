const { test, expect } = require( '@playwright/test' );

// Configure via environment variables when running against a specific WordPress install:
//   SMOKE_FRONTEND_PATH  — relative path to the test post (default: /2026/04/01/bibliography-builder-test/)
//   SMOKE_REST_PATH      — relative path to the REST endpoint (default: /wp-json/bibliography/v1/posts/6/bibliographies/0)
const FRONTEND_PATH =
	process.env.SMOKE_FRONTEND_PATH || '/2026/04/01/bibliography-builder-test/';
const REST_BASE =
	process.env.SMOKE_REST_PATH ||
	'/wp-json/bibliography/v1/posts/6/bibliographies/0';

test( 'frontend sample page renders bibliography content', async ( {
	page,
} ) => {
	await page.goto( FRONTEND_PATH );

	await expect(
		page.locator( '.wp-block-bibliography-builder-bibliography' )
	).toBeVisible();
	await expect(
		page.locator( '.bibliography-builder-entry-text' ).first()
	).toBeVisible();
	await expect(
		page
			.locator( '.bibliography-builder-entry-text a[href^="https://"]' )
			.first()
	).toBeVisible();
} );

test( 'REST endpoint exposes plain-text bibliography output', async ( {
	request,
} ) => {
	const response = await request.get( `${ REST_BASE }?format=text` );

	expect( response.ok() ).toBeTruthy();
	expect( response.headers()[ 'content-type' ] ).toContain( 'text/plain' );
	await expect
		.poll( async () => ( await response.text() ).startsWith( '"' ) )
		.toBeFalsy();
	await expect
		.poll( async () => ( await response.text() ).length > 20 )
		.toBeTruthy();
} );

test( 'REST endpoint exposes CSL-JSON bibliography output', async ( {
	request,
} ) => {
	const response = await request.get( `${ REST_BASE }?format=csl-json` );
	const data = await response.json();

	expect( response.ok() ).toBeTruthy();
	expect( Array.isArray( data ) ).toBeTruthy();
	expect( data[ 0 ] ).toHaveProperty( 'title' );
} );
