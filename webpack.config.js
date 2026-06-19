const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const DependencyExtractionWebpackPlugin = require('@wordpress/dependency-extraction-webpack-plugin');

const wpIconsRequest = '@wordpress/icons';

const defaultEntry = defaultConfig.entry;

module.exports = {
	...defaultConfig,
	// Extend the default entry map to include the optional BAC validation script.
	entry: async () => {
		const base =
			typeof defaultEntry === 'function'
				? await defaultEntry()
				: defaultEntry;
		return {
			...base,
			validation: path.resolve(__dirname, 'src/validation.js'),
			view: path.resolve(__dirname, 'src/view.js'),
		};
	},
	resolve: {
		...(defaultConfig.resolve || {}),
		alias: {
			...(defaultConfig.resolve?.alias || {}),
			'react/jsx-runtime$': path.resolve(
				__dirname,
				'node_modules/react/jsx-runtime.js'
			),
			'react/jsx-dev-runtime$': path.resolve(
				__dirname,
				'node_modules/react/jsx-dev-runtime.js'
			),
		},
	},
	plugins: [
		...(defaultConfig.plugins || []).filter(
			(plugin) =>
				plugin.constructor.name !== 'DependencyExtractionWebpackPlugin'
		),
		new DependencyExtractionWebpackPlugin({
			requestToExternal(request) {
				if (request === wpIconsRequest) {
					return null;
				}
			},
		}),
	],
	output: {
		...defaultConfig.output,
		chunkFilename: '[name].js',
	},
	optimization: {
		...defaultConfig.optimization,
		splitChunks: {
			...defaultConfig.optimization.splitChunks,
			chunks: 'async',
			maxSize: 240000,
			cacheGroups: {
				...defaultConfig.optimization.splitChunks.cacheGroups,
				citationBibtex: {
					test: /[\\/]node_modules[\\/]@citation-js[\\/]plugin-bibtex[\\/]/,
					name: 'citation-plugin-bibtex',
					chunks: 'async',
					enforce: true,
				},
				citationDoi: {
					test: /[\\/]node_modules[\\/]@citation-js[\\/]plugin-doi[\\/]/,
					name: 'citation-plugin-doi',
					chunks: 'async',
					enforce: true,
				},
				citationCore: {
					test: /[\\/]node_modules[\\/]@citation-js[\\/](core|date|name)[\\/]/,
					name: 'citation-core',
					chunks: 'async',
					enforce: true,
				},
			},
		},
	},
};
