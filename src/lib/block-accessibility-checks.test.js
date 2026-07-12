import * as legacyIntegration from './block-accessibility-checks';

test('BAC v3 window-global path removed', () => {
	expect(legacyIntegration.registerBACChecks).toBeUndefined();
});
