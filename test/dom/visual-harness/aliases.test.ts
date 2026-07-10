// test/dom/visual-harness/aliases.test.ts — F5 (Plan 12): aliases.json is the plain-node
// mirror of each element's primary alias (def.aliases[0]) for notes-gen.mjs, which cannot
// import TS. This equality pin means alias/element drift breaks CI, not the camera.
import * as fs from 'fs';
import * as path from 'path';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';

test('aliases.json mirrors registry primary aliases exactly', () => {
	const registry = createElementRegistry();
	registerFrameworkElementDefinitions(registry);
	const expected: Record<string, string> = {};
	for (const def of registry.all()) expected[def.id] = def.aliases[0];
	const actual = JSON.parse(
		fs.readFileSync(path.join(__dirname, '../../../visual-harness/aliases.json'), 'utf8'),
	);
	expect(actual).toEqual(expected);
});
