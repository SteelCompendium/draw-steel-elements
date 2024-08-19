# Draw Steel Elements Plugin for Obsidian

Some helper elements for the MCDM Draw Steel TTRPG

## Power Roll Codeblock

![powerroll.png](powerroll.png)

	```power-roll
	type: Slice and dice
	t1: 3 damage
	t2: 4 damage
	t3: 5 damage; push 2
	crit: 5 damage; push 2; Extra Action
	notes: You have an Edge on this attack if its raining
	```

## Future work

- Add ability to roll Power Rolls from Power Roll Element
- Integrate with the dice plugin
- Something with statblocks...
- Something with encounter building...

### Known Issues

- This repo is in a very primitive state
- BRAT plugin not setup yet
- Integrate into the community plugins

## Development

See the [changelog](CHANGELOG.md) for changes 

### Build

- `npm i` to install deps
- `npm run dev` to build and watch

### Release

Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments
