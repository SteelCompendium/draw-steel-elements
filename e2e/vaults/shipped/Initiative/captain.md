# Initiative tracker with a captained minion squad

ABOVE

```ds-initiative
heroes:
  - name: "Alice Alpha"
    max_stamina: 30
enemy_groups:
  - name: "Goblin Patrol"
    is_squad: true
    selectedInstanceKey: "1-1"
    creatures:
      - name: "Goblin"
        max_stamina: 4
        amount: 3
        squad_role: minion
      - name: "Goblin Captain"
        max_stamina: 40
        amount: 1
        squad_role: captain
      - name: "Warg Rider"
        max_stamina: 30
        amount: 1
        squad_role: attached
malice:
  value: 3
```

BELOW
