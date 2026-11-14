# Initiative tracker with two minion squads per group

ABOVE

```ds-initiative
heroes:
  - name: "Alice Alpha"
    max_stamina: 30
enemy_groups:
  - name: "Wolves"
    is_squad: true
    creatures:
      - name: "Wolf"
        max_stamina: 4
        amount: 2
        squad_role: minion
      - name: "Dire Wolf"
        max_stamina: 8
        amount: 2
        squad_role: minion
  - name: "River"
    is_squad: true
    creatures:
      - name: "Flow of the River"
        max_stamina: 4
        amount: 2
        squad_role: minion
      - name: "Flow of the River"
        max_stamina: 4
        amount: 2
        squad_role: minion
malice:
  value: 3
```

BELOW
