# Initiative tracker with a minion squad whose Goblin #3 carries a custom condition and a duplicate

ABOVE

```ds-initiative
heroes:
  - name: "Alice Alpha"
    max_stamina: 30
enemy_groups:
  - name: "Goblin Squad"
    is_squad: true
    minion_stamina_pool: 10
    selectedInstanceKey: "0-3"
    creatures:
      - name: "Goblin"
        max_stamina: 4
        amount: 5
        squad_role: minion
        instances:
          - id: 1
            isDead: true
          - id: 2
            isDead: true
          - id: 3
            conditions:
              - on-fire
              - grabbed
              - grabbed
              - dazed
          - id: 4
          - id: 5
malice:
  value: 3
```

BELOW
