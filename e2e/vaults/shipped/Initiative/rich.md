# Initiative tracker, every variant

ABOVE

```ds-initiative
name: Warren Ambush
round: 2
heroes:
  - name: "Alice Alpha"
    max_stamina: 30
    conditions:
      - grabbed
  - name: "Bruno Beta"
    max_stamina: 40
    has_taken_turn: true
enemy_groups:
  - name: "Ogres"
    creatures:
      - name: "Ogre"
        max_stamina: 60
        amount: 3
        instances:
          - id: 1
            current_stamina: 60
            conditions:
              - dazed
          - id: 2
            current_stamina: 60
          - id: 3
            current_stamina: 60
  - name: "Troll Boss"
    creatures:
      - name: "Troll"
        max_stamina: 100
        amount: 1
malice:
  value: 4
  round_gain: 2
  log:
    - round: 1
      amount: 3
      label: "Opening Malice"
```

BELOW
