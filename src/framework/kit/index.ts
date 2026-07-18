// Plan 08 Task 5 — the kit barrel: one ergonomic import surface for the whole D2
// widget kit. Consumers write `import { iconButton, stepper, … } from "@/framework/kit"`
// (tsconfig has no `@framework` alias — `@/*` -> `src/*` is the path; jest mirrors it).
//
// Explicit named re-exports (not `export *`) so this file IS the kit's public API
// list — adding a widget means adding it here deliberately. Types re-export via
// `export type` (isolatedModules). test/dom/kit/kit-index.test.ts pins completeness.

// -- Control primitives (D2 §2.1/2.2/2.5/2.10, Task 2) --
export { iconButton, buttonRow } from './iconButton';
export type {
	IconButtonOptions,
	IconButtonHandle,
	IconButtonVariant,
	ButtonRowHandle,
} from './iconButton';
export { stepper } from './stepper';
export type { StepperOptions, StepperHandle } from './stepper';
export { tooltip } from './tooltip';
export type { DseTooltipOptions } from './tooltip';
export { divider } from './divider';
export type { DividerOptions, DividerHandle } from './divider';

// -- Containers (D2 §2.3/2.4/2.6, Task 3) --
export { collapsible } from './collapsible';
export type { CollapsibleOptions, CollapsibleHandle } from './collapsible';
// SessionPersist lives in framework/session (Plan 09 Task 0 — neutral home beside
// SessionStore) but stays part of the kit's import surface: it is the accessor
// callers hand to collapsible/tabs.
export type { SessionPersist } from '../session';
export { tabs } from './tabs';
export type { TabSpec, TabsOptions, TabsHandle } from './tabs';
export { DseModal, openManagedModal } from './managedModal';

// -- Card grammar (D2 §2.7/2.8/2.9, Task 4) --
export { cardHead } from './cardHead';
export type { CardHeadOptions, CardHeadSlot, CardHeadHandle } from './cardHead';
export { powerRollPanel, tierBadge } from './powerRollPanel';
export type {
	PowerRollTier,
	PowerRollRow,
	RenderMdCallback,
	PowerRollPanelOptions,
	PowerRollPanelHandle,
} from './powerRollPanel';
export { crest } from './crest';
export type { CrestSize, CrestOptions, CrestHandle } from './crest';

// -- Rolling (D5 §3.5/§4, Plan 14) --
export { rollBar } from './rollBar';
export type { RollBarState, RollBarOptions, RollBarHandle } from './rollBar';
export { rollResultCard } from './rollResultCard';
export type { RollResultCardOptions, RollResultCardHandle } from './rollResultCard';

// -- Hero panel contract + panel render cores (D7 §2.1/§2.3, Task 1) --
export { HeroPanel } from './HeroPanel';
export type { PanelHost } from './HeroPanel';
export { renderStaminaBar, updateStaminaBar } from './StaminaBarPanel';
export type { StaminaBarValues, StaminaBarRenderOptions } from './StaminaBarPanel';
export { renderCharacteristicsGrid } from './CharacteristicsGrid';
export type { CharacteristicsValues, CharacteristicsGridOptions } from './CharacteristicsGrid';
export { buildConditionIcons } from './conditionIcons';
export type { ConditionIconEntry, ConditionIconInput, ConditionIconsOptions } from './conditionIcons';

// The F1-era helpers (mountCollapsibleHeading / mountComponentWrapper) are gone —
// retired by Plan 09 Task 10 once every element had moved onto the D2 widgets above.
