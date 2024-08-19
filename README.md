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

The generated html is simple, but should be highly customizable with css:

```html
<div class="pr-container">
    <div class="pr-type-line"><span class="pr-type-value">Slice and dice</span></div>
    <div class="pr-tier-line pr-tier-1-line">
        <span class="pr-tier-key pr-tier-1-key">11 or lower:</span>
        <span class="pr-tier-value pr-tier-1-value">3 damage</span>
    </div>
    <div class="pr-tier-line pr-tier-2-line">
		<span class="pr-tier-key pr-tier-2-key">12-16:</span> 
		<span class="pr-tier-value pr-tier-2-value">4 damage</span>
	</div>
    <div class="pr-tier-line pr-tier-3-line">
		<span class="pr-tier-key pr-tier-3-key">17+:</span> 
		<span class="pr-tier-value pr-tier-3-value">5 damage; push 2</span>
	</div>
    <div class="pr-tier-line pr-crit-line">
		<span class="pr-tier-key pr-crit-key">Nat 19-20:</span> 
		<span class="pr-tier-value pr-crit-value">5 damage; push 2; Extra Action</span>
	</div>
    <div class="pr-note-line"><span class="pr-note">You have an Edge on this attack if its raining</span></div>
</div>
```

## Future work

- Customize the Power Roll Element's output (ex: display `Tier 1:` instead of `11 or lower:`)
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
