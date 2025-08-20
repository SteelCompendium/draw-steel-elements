# Draw Steel Elements Plugin for Obsidian

Some helper elements for the MCDM Draw Steel TTRPG

**IMPORTANT: This plugin does NOT (yet) work in "Live Preview" mode.**

Please use this [form to report bugs](https://docs.google.com/forms/d/e/1FAIpQLSc6m-pZ0NLt2EArE-Tcxr-XbAPMyhu40ANHJKtyRvvwBd2LSw/viewform?usp=sharing&ouid=105036387964900154878) if you find them!

You can see [Element Documentation Here](https://steelcompendium.github.io/draw-steel-elements/power-roll/) or see below.

![sample](./docs/Media/sample.png)

## Elements

### Power Roll Element

The [Power Roll Element](./docs/ability) is used to quickly format Tests, Abilities, Resistance Rolls, and other Power Rolls.

![power roll.png](./docs/Media/ability-simple.png)

### Initiative Tracker Element

The [Initiative Tracker Element](./docs/initiative-tracker.md) is used to manage and run encounters.

![Initiative Tracker.png](./docs/Media/initiative-tracker.png)

### Negotiation Tracker Element

The [Negotiation Tracker Element](./docs/negotiation-tracker.md) is used to manage and run negotiations.

![Initiative Tracker.png](./docs/Media/negotiation.png)

### Statblock Element

The [Statblock Element](./docs/statblock.md) is used to display statblocks.

![Statblock.png](./docs/Media/statblock.png)

### Horizontal Rule Element

The [Horizontal Rule Element](./docs/horizontal-rule.md) is used as an alternative `<hr>` mimicking the Draw Steel design 

## Future work

- Optionally add hidden header for a Power Roll Element for linking
- Support Live Preview mode
- Add ability to roll Power Rolls from Power Roll Element
- Integrate with the dice plugin
- Something with statblocks...
- Something with encounter building...
- Negotiation tracker
- Party tracker (XP, Victories)
- Text parser for generating power-roll admonitions from raw copied text

### Known Issues

- No support for Live Preview
- This repo is in a very primitive state

## Development

See the [changelog](CHANGELOG.md) for changes 

### Build

- `npm i` to install deps
- `npm run dev` to build and watch

<!-- ~/Documents/demo/DS Elements demo has symlink to this repo -->

### Release

- Make sure the `manifest.json` has the right release version
  - This should be semver without the `v` prefix
- Update `CHANGELOG.md`
- Create release in github
  - Tag should match `manifest.json`
  - Tag and release name should match
  - Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments
