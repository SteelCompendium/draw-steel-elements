# Initiative: amount edited by hand

ABOVE

```ds-initiative
heroes:
  - name: Alice Alpha
    max_stamina: 30
enemy_groups:
  - name: Ogres
    creatures:
      - name: Ogre
        max_stamina: 60
        amount: 3
        instances:
          - id: 1
            current_stamina: 60
          - id: 2
            current_stamina: 25
            conditions:
              - grabbed
          - id: 3
            current_stamina: 60
malice:
  value: 3
```

BELOW
