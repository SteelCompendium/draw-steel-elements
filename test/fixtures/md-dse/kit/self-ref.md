---
name: Self Ref
item_name: Self Ref
item_id: self-ref
file_basename: self-ref
file_dpath: kit
scc: mcdm.heroes.v1/kit/self-ref
source: mcdm.heroes.v1
type: kit
melee_damage_bonus: "+0/+0/+0"
---

This kit's own body whole-block-references itself — a synthetic case (real compendium
bodies never do this; they carry pre-resolved inline `[text](scc.v1:...)` links, not
whole-block refs) built specifically to exercise D6 Task 9's depth guard (spec §9 risk).

```ds-kit
scc.v1:mcdm.heroes.v1/kit/self-ref
```
