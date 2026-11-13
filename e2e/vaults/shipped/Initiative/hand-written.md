# Initiative hand-written conditions

ABOVE

```ds-initiative
heroes:
  - name: Alice Alpha
    max_stamina: 30
    conditions:
      - key: dazed
        color: teal
      - key: hexed
        icon: ""
enemy_groups:
  - name: Ogres
    creatures:
      - name: Ogre
        max_stamina: 60
        amount: 2
        instances:
          - id: 1
            current_stamina: 60
          - id: 2
            current_stamina: 60
malice:
  value: 3
```

BELOW
