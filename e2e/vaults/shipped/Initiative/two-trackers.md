# Two trackers

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
        amount: 1
malice:
  value: 1
```

BETWEEN

```ds-initiative
heroes:
  - name: Bob Beta
    max_stamina: 25
    conditions:
      - grabbed
      - key: hexed
        duration: eoe
enemy_groups:
  - name: Goblins
    creatures:
      - name: Goblin
        max_stamina: 10
        amount: 1
malice:
  value: 2
```

BELOW
