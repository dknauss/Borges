/**
 * Global setup for the stories: the WordPress component styles and the
 * block's own editor styles, and the accessibility add-on's checks.
 */
import '@wordpress/components/build-style/style.css';
import '../src/editor.scss';

/**
 * The block's editor styles are scoped to its wrapper, as in the editor, so
 * every story renders inside one. The editor canvas uses the system font.
 *
 * @param {() => Element} Story The story.
 * @return {Element} The story inside the block wrapper.
 */
const inBlockWrapper = ( Story ) => (
	<div
		className="wp-block-bibliography-builder-bibliography"
		style={ {
			maxWidth: '740px',
			fontFamily:
				'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
		} }
	>
		<Story />
	</div>
);

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
	decorators: [ inBlockWrapper ],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
			},
		},
		a11y: {
			// Report axe violations as failures in the test runner and in
			// the Accessibility panel, rather than as warnings.
			test: 'error',
		},
	},
	tags: [ 'autodocs' ],
};

export default preview;
