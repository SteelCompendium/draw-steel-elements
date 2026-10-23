// The framework element chrome (src/framework/chrome/mountChrome.ts + the pipeline's Pin item): the
// Collapse button in the hover panel, the Expand button on the collapsed one-liner, and the experimental
// "Pin to sidebar" item. Pilot scope is deliberately narrow: just what SC-505 drives on the stamina bar
// (keyboard Collapse / Expand / Pin and a mouse Collapse / Expand), the way the counter manifest is.
import { c, surface } from './surface';

export default surface('chrome', {
	controls: {
		'chrome.collapse': c(['press:Enter', 'click'], ['SC-505']),
		'chrome.expand': c(['press:Enter', 'click'], ['SC-505']),
		'chrome.pin': c(['press:Enter'], ['SC-505']),
	},
});
