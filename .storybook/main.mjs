/**
 * Storybook for the block's editor components.
 *
 * Borges builds with wp-scripts (webpack). Storybook uses Vite instead, so
 * it needs two things wp-scripts' Babel setup gives the build: JSX in `.js`
 * files and the automatic JSX runtime. The stories import the real
 * WordPress packages from node_modules, not the window globals the block
 * uses in WordPress.
 *
 * Stories live beside their components as `*.stories.js`. None of this
 * ships: the release ZIP copies only the plugin's runtime files
 * (scripts/package-release.sh), and .distignore leaves `.storybook/` out.
 */

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
	stories: [ '../src/**/*.stories.js' ],
	addons: [ '@storybook/addon-docs', '@storybook/addon-a11y' ],
	framework: {
		name: '@storybook/react-vite',
		options: {},
	},
	async viteFinal( viteConfig ) {
		const { mergeConfig } = await import( 'vite' );

		return mergeConfig( viteConfig, {
			esbuild: {
				loader: 'jsx',
				include: /\.jsx?$/,
				exclude: /node_modules/,
				jsx: 'automatic',
			},
			optimizeDeps: {
				esbuildOptions: {
					loader: { '.js': 'jsx' },
					jsx: 'automatic',
				},
			},
		} );
	},
};

export default config;
