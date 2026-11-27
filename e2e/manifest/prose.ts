// SC-391: the internal prose card (`ds-prose`, src/elements/display/prose.ts) that `ds-scc` draws for skills, skill groups, saints, gods,
// chapters, projects, movement, negotiation and monster-group lore. Its one control is the compact chapter card's "Open chapter" link, an
// `a.internal-link` carrying the synced note's path, which Obsidian's own link handling opens (`prose.open-chapter` x click, driven by
// specs/compendium/prose-card.e2e.ts). The framework chrome panel inside the card belongs to manifest/chrome.ts.
import { c, surface } from './surface';

export default surface('prose', {
	controls: {
		'prose.open-chapter': c(['click'], ['SC-391']),
	},
});
