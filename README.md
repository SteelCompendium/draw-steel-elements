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

### Fields

| Property                      | Description                                              | Example                                   |
|-------------------------------| -------------------------------------------------------- | ----------------------------------------- |
| `name`, `type`                | The "Title" or "Description" of the Power Roll.          | `name: Might Resistance Roll`             |
| `tier 1`, `t1`, `11 or lower` | The tier-1 (11 or lower) result of the Power Roll        | `t1: 2 damage`                            |
| `tier 2`, `t2`, `12-16`       | The tier-2 (12-16) result of the Power Roll              | `t2: 3 damage`                            |
| `tier 3`, `t3`, `17+`         | The tier-3 (17+) result of the Power Roll                | `t3: 4 damage`                            |
| `crit`, `nat 19-20`           | The critical result of the Power Roll                    | `crit: 4 damage, Extra Action`            |
| `note`, `notes`               | Notes and reminders about the Power Roll                 | `note: Grant Edge if creature is bracing` |
| `indent`                      | Left-margin indentation for the block (for nested lists) | `indent: 2`                               |

## Future work

- Customize the Power Roll Element's output (ex: display `Tier 1:` instead of `11 or lower:`)
- Support Live Preview mode
- Add ability to roll Power Rolls from Power Roll Element
- Integrate with the dice plugin
- Something with statblocks...
- Something with encounter building...

### Known Issues

- No support for Live Preview
- This repo is in a very primitive state
- Integrate into the community plugins

## Development

See the [changelog](CHANGELOG.md) for changes 

### Build

- `npm i` to install deps
- `npm run dev` to build and watch

### Release

Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments
