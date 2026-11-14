// The plugin settings tab (src/views/SettingsTab.ts, settingsDeclarative.ts, the descriptor list in src/prefs/catalog.ts): the index of
// section pages, every page's controls, each page's reset row, the nested "Advanced" pages, the index's "Reset all preferences" row, the
// Statblock display Preset, the six font pickers (dropdown + free-text field + "List installed fonts") and the Compendium Sync / Check
// buttons (SC-440).
// NOT listed here, because they are not this tab's:
//   - the live preview each reflected page draws (a real statblock / featureblock / feature mounted through the pipeline): its own controls
//     (the chrome collapse button, a collapsible band's header) belong to those elements' surfaces; the census skips the preview stage;
//   - the windows a Sync, an "Update available" or a destination-folder change can open (SC-441, compendium sync and migration modals): the
//     pairs below stop where such a window would open;
//   - Obsidian's own chrome around the tab (the back button, the search field, the file / folder suggester popups).
// Ids are stamped after Obsidian renders a row: a native control row, an action row and a page link cannot carry an attribute from their
// definition, so settingsDeclarative.ts stamps them through a `visible` predicate (src/views/settingsControlIds.ts). A descriptor's id comes
// from its KEY (`sbFeatureStyle` -> `settings.sb-feature-style`): adding a pref needs no id edit, only a row here.
// SHIPPED vs GATE ON: the shipped build (experimental OFF) has no Print preview toggle and no Authoring page (SC-406); their ids are declared
// here too and driven by the gate-ON scenarios (`G` rows), the one place a spec turns the gate on.
// Kinds: Obsidian renders the controls natively, so the real inputs are the ones a user has on them: a click on a toggle / page link / reset row /
// button, the keys on a focused control (Space on a toggle, ArrowDown on a dropdown to pick the next option, ArrowRight / Home / End on a slider),
// and typing then clicking away in a text field. A dropdown's native popup list cannot be driven by the browser protocol, hence the keys.
// A dependent row ("Sticky mini-header: include secondary stats") is `is-disabled` while its parent is off: `click-disabled`.
// `rows` cite the SC-440 scenario groups: N pages and navigation, R resets, T toggles, D dropdowns and the preset, F font pickers, Z sliders,
// X text and file fields, C compendium Sync / Check, G experimental gate on (`SET-<group><nn>`).
// LIVE RE-RENDER representatives (an already-open note's element changes on screen without a reload), one per setting:
//   reduce-motion, portraits, print-preview (gate on): the root attributes `data-dse-reduce-motion` / `-portraits` / `-print` on the stamina bar
//   (Stamina/basic.md) and, for portraits, the tracker (Initiative/tracker.md); the six fonts and five scales: the inline custom properties
//   `--dse-font-<slot>`, `--dse-text-scale`, `--dse-card-scale`, `--dse-fs-small-scale` / `-large-` / `-control-` on the stamina bar root;
//   every Statblock display row: the statblock root's `data-dse-*` attribute (Settings/statblock.md); Featureblock display: Settings/featureblock.md;
//   Keyword display / Distance + target: Feature/feature.md; Rolling: the Roll controls of Feature/feature.md (the roll preferences subscribe);
//   Collapsible by default / Start collapsed / Edit Recoveries with a popover / Show edit button on rendered blocks (gate on): the chrome Collapse
//   button, the collapsed one-liner, the recovery popover and the Edit pencil of Stamina/basic.md / Stamina/recoveries.md.
import { c, surface } from './surface';

export default surface('settings', {
	controls: {

		// -- N. The index: one navigable row per section page (Authoring only with the gate on), and each page's nested "Advanced" page (a row on the page that opens the secondary settings one level down).
		'settings.page.appearance': c(['click'], ['N01']),
		'settings.page.typography': c(['click'], ['N02']),
		'settings.page.statblock-display': c(['click'], ['N03']),
		'settings.page.featureblock-display': c(['click'], ['N04']),
		'settings.page.feature-display': c(['click'], ['N05']),
		'settings.page.element-defaults': c(['click'], ['N06']),
		'settings.page.rolling': c(['click'], ['N07']),
		'settings.page.compendium': c(['click'], ['N08']),
		'settings.page.links': c(['click'], ['N09']),
		'settings.page.initiative-tracker': c(['click'], ['N10']),
		'settings.page.authoring': c(['click'], ['G01']),
		'settings.advanced.typography': c(['click'], ['N11']),
		'settings.advanced.statblock-display': c(['click'], ['N12']),
		'settings.advanced.element-defaults': c(['click'], ['N13']),

		// -- R. Resets: each page's "Reset <section>" row restores every setting of the section, the Advanced ones included; the index's "Reset all preferences" restores every preference. (Compendium, Links and Initiative tracker are data.json fields, not preferences: no reset.)
		'settings.reset.appearance': c(['click'], ['R01']),
		'settings.reset.typography': c(['click'], ['R02']),
		'settings.reset.statblock-display': c(['click'], ['R03']),
		'settings.reset.featureblock-display': c(['click'], ['R04']),
		'settings.reset.feature-display': c(['click'], ['R05']),
		'settings.reset.element-defaults': c(['click'], ['R06']),
		'settings.reset.rolling': c(['click'], ['R07']),
		'settings.reset.authoring': c(['click'], ['G04']),
		'settings.reset-all': c(['click'], ['R08']),

		// -- T. Toggles (a native checkbox: click it, or Space with it focused). Print preview and Show edit button on rendered blocks exist only with the gate on.
		'settings.reduce-motion': c(['click', 'press:Space'], ['T01']),
		'settings.portraits': c(['click', 'press:Space'], ['T02']),
		'settings.sb-sticky': c(['click', 'press:Space'], ['T03']),
		'settings.sb-sticky-meta': c(['click', 'click-disabled', 'press:Space'], ['T04', 'T05']),
		'settings.collapsible-default': c(['click', 'press:Space'], ['T06']),
		'settings.collapse-default': c(['click', 'press:Space'], ['T07']),
		'settings.stamina-recovery-popover': c(['click', 'press:Space'], ['T08']),
		'settings.rolling-enabled': c(['click', 'press:Space'], ['T09']),
		'settings.roll-click-to-roll': c(['click', 'press:Space'], ['T10']),
		'settings.links.scc-web-fallback': c(['click', 'press:Space'], ['T11']),
		'settings.print-preview': c(['click', 'press:Space'], ['G02']),
		'settings.authoring-controls': c(['click', 'press:Space'], ['G03']),

		// -- D. Dropdowns (ArrowDown on the focused select picks the next option and fires the change). The Preset is derived from the nine statblock options, not stored. Locale offers a single option today.
		'settings.sb-preset': c(['press:ArrowDown'], ['D01']),
		'settings.sb-feature-style': c(['press:ArrowDown'], ['D02']),
		'settings.sb-density': c(['press:ArrowDown'], ['D03']),
		'settings.sb-columns': c(['press:ArrowDown'], ['D04']),
		'settings.sb-stats': c(['press:ArrowDown'], ['D05']),
		'settings.sb-char-line': c(['press:ArrowDown'], ['D06']),
		'settings.sb-char-box': c(['press:ArrowDown'], ['D07']),
		'settings.sb-villain': c(['press:ArrowDown'], ['D08']),
		'settings.fb-feature-style': c(['press:ArrowDown'], ['D09']),
		'settings.fb-stats': c(['press:ArrowDown'], ['D10']),
		'settings.kw-usage': c(['press:ArrowDown'], ['D11']),
		'settings.dist-target': c(['press:ArrowDown'], ['D12']),
		'settings.roller-engine': c(['press:ArrowDown'], ['D13']),
		'settings.compendium.locale': c(['press:ArrowDown'], ['D14']),

		// -- F. The six font pickers: the curated dropdown (ArrowDown picks the next font, End jumps to "Custom...", which reveals the free-text field), the free-text field (type, then click away) and the "List installed fonts" button (click).
		'settings.font-title': c(['press:ArrowDown', 'press:End'], ['F01']),
		'settings.font-title.custom': c(['type', 'blur'], ['F01']),
		'settings.font-title.list': c(['click'], ['F01']),
		'settings.font-body': c(['press:ArrowDown', 'press:End'], ['F02']),
		'settings.font-body.custom': c(['type', 'blur'], ['F02']),
		'settings.font-body.list': c(['click'], ['F02']),
		'settings.font-controls': c(['press:ArrowDown', 'press:End'], ['F03']),
		'settings.font-controls.custom': c(['type', 'blur'], ['F03']),
		'settings.font-controls.list': c(['click'], ['F03']),
		'settings.font-card-body': c(['press:ArrowDown', 'press:End'], ['F04']),
		'settings.font-card-body.custom': c(['type', 'blur'], ['F04']),
		'settings.font-card-body.list': c(['click'], ['F04']),
		'settings.font-label': c(['press:ArrowDown', 'press:End'], ['F05']),
		'settings.font-label.custom': c(['type', 'blur'], ['F05']),
		'settings.font-label.list': c(['click'], ['F05']),
		'settings.font-mono': c(['press:ArrowDown', 'press:End'], ['F06']),
		'settings.font-mono.custom': c(['type', 'blur'], ['F06']),
		'settings.font-mono.list': c(['click'], ['F06']),

		// -- Z. The five size sliders (a native range input: ArrowRight is one step up, Home the minimum, End the maximum).
		'settings.text-scale': c(['press:ArrowRight', 'press:Home', 'press:End'], ['Z01']),
		'settings.card-scale': c(['press:ArrowRight', 'press:Home', 'press:End'], ['Z02']),
		'settings.small-text-scale': c(['press:ArrowRight', 'press:Home', 'press:End'], ['Z03']),
		'settings.large-text-scale': c(['press:ArrowRight', 'press:Home', 'press:End'], ['Z04']),
		'settings.control-text-scale': c(['press:ArrowRight', 'press:Home', 'press:End'], ['Z05']),

		// -- X. The Compendium and Initiative tracker fields. Destination folder and Release are text fields (each keystroke is a write); Default creature image path is a file combobox (click or Enter opens Obsidian's file picker, the X clears it).
		'settings.compendium.destination': c(['type', 'blur'], ['X01']),
		'settings.compendium.release': c(['type', 'blur'], ['X02']),
		'settings.initiative.default-image': c(['click', 'press:Enter'], ['X03']),
		'settings.initiative.default-image.clear': c(['click'], ['X04']),

		// -- C. Sync and Check for updates. Both disable while either runs; the one in flight swaps its label (Syncing... / Checking...). A click on a disabled one does nothing. The scenarios stub the release lookup (no network) and stop short of any window Sync would open (SC-441).
		'settings.compendium.sync': c(['click', 'click-disabled'], ['C01', 'C02']),
		'settings.compendium.check': c(['click', 'click-disabled'], ['C03', 'C04']),
	},
});
