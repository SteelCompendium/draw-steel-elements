import { createElementRegistry } from '../../../src/framework/registry';
import type { ElementDefinition, ElementRegistry } from '../../../src/framework/registry';
import type { ElementView } from '../../../src/framework/view';

// F1 §3.1: ElementRegistry is a PURE in-memory registry — storage only, decoupled from
// Obsidian's registerMarkdownCodeBlockProcessor wiring (that's Task 9/10). Fake defs below
// never construct a real ElementView; createView is a stub cast to satisfy the type, never
// invoked by the registry itself (register/get/all never call createView).
function fakeView(): ElementView<unknown> {
	return {} as unknown as ElementView<unknown>;
}

function fakeDef(overrides: Partial<ElementDefinition> = {}): ElementDefinition {
	return {
		id: 'stamina-bar',
		name: 'Stamina bar',
		aliases: ['ds-stam'],
		shape: 'static',
		parse: (data) => data,
		createView: () => fakeView(),
		...overrides,
	};
}

describe('T-8 (Plan 02): ElementRegistry + ElementDefinition/ElementShape (F1 §3.1)', () => {
	let registry: ElementRegistry;

	beforeEach(() => {
		registry = createElementRegistry();
	});

	test('get() and all() are empty before anything is registered', () => {
		expect(registry.get('stamina-bar')).toBeUndefined();
		expect(registry.all()).toEqual([]);
	});

	test('register() then get(id) returns the same definition', () => {
		const def = fakeDef();
		registry.register(def);

		expect(registry.get('stamina-bar')).toBe(def);
	});

	test('register() then get(alias) returns the same definition (canonical alias)', () => {
		const def = fakeDef({ aliases: ['ds-stam', 'ds-stamina'] });
		registry.register(def);

		expect(registry.get('ds-stam')).toBe(def);
	});

	test('register() then get(alias) returns the same definition (non-canonical alias)', () => {
		const def = fakeDef({ aliases: ['ds-stam', 'ds-stamina'] });
		registry.register(def);

		expect(registry.get('ds-stamina')).toBe(def);
	});

	test('get() returns undefined for an unknown id/alias', () => {
		registry.register(fakeDef());

		expect(registry.get('nonexistent')).toBeUndefined();
	});

	test('all() lists every registered definition', () => {
		const staminaBar = fakeDef({ id: 'stamina-bar', aliases: ['ds-stam'] });
		const counter = fakeDef({ id: 'counter', aliases: ['ds-counter'] });

		registry.register(staminaBar);
		registry.register(counter);

		expect(registry.all()).toEqual([staminaBar, counter]);
	});

	test('all() returns a snapshot that later registrations do not mutate', () => {
		registry.register(fakeDef({ id: 'stamina-bar', aliases: ['ds-stam'] }));
		const snapshot = registry.all();

		registry.register(fakeDef({ id: 'counter', aliases: ['ds-counter'] }));

		expect(snapshot.length).toBe(1);
		expect(registry.all().length).toBe(2);
	});

	test('register() rejects a duplicate id', () => {
		registry.register(fakeDef({ id: 'stamina-bar', aliases: ['ds-stam'] }));

		expect(() => registry.register(fakeDef({ id: 'stamina-bar', aliases: ['ds-stam-2'] }))).toThrow(
			/duplicate.*id/i,
		);
	});

	test('register() rejects a duplicate alias across different definitions', () => {
		registry.register(fakeDef({ id: 'stamina-bar', aliases: ['ds-stam'] }));

		expect(() => registry.register(fakeDef({ id: 'counter', aliases: ['ds-stam'] }))).toThrow(/alias/i);
	});

	test('register() rejects a duplicate alias even when it collides with a non-canonical alias', () => {
		registry.register(fakeDef({ id: 'stamina-bar', aliases: ['ds-stam', 'ds-stamina'] }));

		expect(() => registry.register(fakeDef({ id: 'counter', aliases: ['ds-counter', 'ds-stamina'] }))).toThrow(
			/alias/i,
		);
	});

	test('a rejected duplicate-alias registration is not partially applied', () => {
		registry.register(fakeDef({ id: 'stamina-bar', aliases: ['ds-stam', 'ds-stamina'] }));

		expect(() =>
			registry.register(fakeDef({ id: 'counter', aliases: ['ds-counter', 'ds-stamina'] })),
		).toThrow();

		// The failed def must not have been stored under its OWN non-conflicting alias either.
		expect(registry.get('ds-counter')).toBeUndefined();
		expect(registry.get('counter')).toBeUndefined();
		expect(registry.all().length).toBe(1);
	});

	test('register() rejects shape:"persisted" without serialize', () => {
		const def = fakeDef({ id: 'notes', aliases: ['ds-notes'], shape: 'persisted', serialize: undefined });

		expect(() => registry.register(def)).toThrow(/persisted/i);
	});

	test('register() accepts shape:"persisted" when serialize is provided', () => {
		const def = fakeDef({
			id: 'notes',
			aliases: ['ds-notes'],
			shape: 'persisted',
			serialize: (model) => String(model),
		});

		expect(() => registry.register(def)).not.toThrow();
		expect(registry.get('notes')).toBe(def);
	});

	test('register() accepts "interactive" and "static" shapes without serialize', () => {
		expect(() => registry.register(fakeDef({ id: 'interactive-one', aliases: ['ds-i1'], shape: 'interactive' }))).not.toThrow();
		expect(() => registry.register(fakeDef({ id: 'static-one', aliases: ['ds-s1'], shape: 'static' }))).not.toThrow();
	});
});
