// D8 Task 1: pins the sidebar-facing mock surface (ItemView lifecycle, WorkspaceLeaf,
// Plugin.registerView, workspace.getRightLeaf/getLeavesOfType/revealLeaf/detachLeavesOfType)
// so a later drift breaks loudly. Lives under test/dom/mocks/ alongside dom-setup.test.ts —
// jest.config.ts's `dom` project (jsdom + test/setup/dom-setup.ts) is what testMatch actually
// picks up; test/mocks/ itself is never scanned by jest.
import { App, Plugin, ItemView, WorkspaceLeaf, Component } from '../../mocks/obsidian-core';

const VIEW = 'dse-test-view';

class ProbeView extends ItemView {
	opened = 0;
	closed = 0;
	getViewType() {
		return VIEW;
	}
	getDisplayText() {
		return 'Probe';
	}
	protected async onOpen() {
		this.opened++;
		this.contentEl.textContent = 'up';
	}
	protected async onClose() {
		this.closed++;
	}
}

function setup() {
	const app = new App();
	const plugin = new Plugin(app);
	plugin.registerView(VIEW, (leaf: WorkspaceLeaf) => new ProbeView(leaf));
	return { app, plugin };
}

describe('obsidian-core mock: ItemView/WorkspaceLeaf/workspace view APIs (D8 Task 1)', () => {
	test('registerView + getRightLeaf + setViewState constructs and opens the view', async () => {
		const { app } = setup();
		const leaf = app.workspace.getRightLeaf(false);
		expect(leaf).not.toBeNull();
		await leaf!.setViewState({ type: VIEW, active: true });
		const view = leaf!.view as ProbeView;
		expect(view).toBeInstanceOf(ProbeView);
		expect(view.opened).toBe(1);
		expect(view.contentEl.textContent).toBe('up');
	});
	test('getLeavesOfType finds the open leaf; revealLeaf records it', async () => {
		const { app } = setup();
		const leaf = app.workspace.getRightLeaf(false);
		await leaf!.setViewState({ type: VIEW });
		await app.workspace.revealLeaf(leaf!);
		expect(app.workspace.getLeavesOfType(VIEW)).toEqual([leaf]);
	});
	test('detachLeavesOfType calls onClose and removes the leaf', async () => {
		const { app } = setup();
		const leaf = app.workspace.getRightLeaf(false);
		await leaf!.setViewState({ type: VIEW });
		const view = leaf!.view as ProbeView;
		app.workspace.detachLeavesOfType(VIEW);
		expect(view.closed).toBe(1);
		expect(app.workspace.getLeavesOfType(VIEW)).toEqual([]);
	});
	test('ItemView is a Component — addChild cascades unload', async () => {
		const { app } = setup();
		const leaf = app.workspace.getRightLeaf(false);
		await leaf!.setViewState({ type: VIEW });
		const view = leaf!.view as ItemView;
		let unloaded = false;
		const child = new (class extends Component {
			onunload() {
				unloaded = true;
			}
		})();
		view.addChild(child);
		app.workspace.detachLeavesOfType(VIEW);
		expect(unloaded).toBe(true);
	});
	test('plugin.unload detaches its registered views', async () => {
		const { app, plugin } = setup();
		const leaf = app.workspace.getRightLeaf(false);
		await leaf!.setViewState({ type: VIEW });
		const view = leaf!.view as ProbeView;
		plugin.unload();
		expect(view.closed).toBe(1);
	});
	test('getRightLeaf returns null when __rightLeafUnavailable is set', () => {
		const { app } = setup();
		app.workspace.__rightLeafUnavailable = true;
		const leaf = app.workspace.getRightLeaf(false);
		expect(leaf).toBeNull();
	});
	test('ItemView exposes contentEl property matching .view-content div', async () => {
		const { app } = setup();
		const leaf = app.workspace.getRightLeaf(false);
		await leaf!.setViewState({ type: VIEW });
		const view = leaf!.view as ProbeView;
		expect(view.contentEl).toBeDefined();
		expect(view.contentEl.classList.contains('view-content')).toBe(true);
		expect(view.contentEl).toBe(view.containerEl.querySelector('.view-content'));
	});
});
