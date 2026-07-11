// Plan 14 Task 5 (D5 §5.4) — the ds-roll ElementDefinition. shape "interactive":
// results are session/ephemeral (OD-4 session-pin; note-pin — serialize + shape
// "persisted" — is the documented follow-up). Schema hard-fails per F1 §5. No
// refs (autoResolveRefs false): a roll block carries no @path/scc strings.
import type { ElementDefinition } from '@/framework/registry';
import rollSchemaYaml from './schema.yaml';
import { parseRollModel } from './model';
import type { RollModel } from './model';
import { RollView } from './view';

export const rollElement: ElementDefinition<RollModel> = {
	id: 'roll',
	name: 'Roll',
	aliases: ['ds-roll', 'ds-r', 'ds-power-roll'],
	shape: 'interactive',
	schema: rollSchemaYaml,
	parse: (data) => parseRollModel(data),
	autoResolveRefs: false,
	createView: (cx) => new RollView(cx),
};
