# Initiative conditions

ABOVE

```ds-initiative
heroes:
  - name: Alice Alpha
    max_stamina: 30
    conditions:
      - bleeding
      - key: dazed
        duration: eot
        color: "#c0392b"
        effect: glow
      - key: hexed
      - key: slowed
        effect: save ends
enemy_groups:
  - name: Ogres
    creatures:
      - name: Ogre
        max_stamina: 60
        amount: 2
        instances:
          - id: 1
            current_stamina: 60
            conditions:
              - grabbed
              - key: prone
                duration: save-ends
          - id: 2
            current_stamina: 60
malice:
  value: 3
```

BELOW
