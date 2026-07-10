type: featureblock
featureblock_type: Malice Features
name: Angulotl Malice
flavor: At the start of any angulotl's turn, you can spend Malice to activate
  one of the following features.
features:
  - type: feature
    feature_type: trait
    name: Leapfrog
    icon: ⭐️
    cost: 3 Malice
    effects:
      - effect: Until the end of the round, when an angulotl moves through an inactive
          angulotl's space, the inactive angulotl can use a free triggered
          action to jump 3 squares.
  - type: feature
    feature_type: trait
    name: Resonating Croak
    icon: ❇️
    cost: 5 Malice
    effects:
      - effect: Each angulotl in the encounter puffs out their throat and starts loudly
          droning. Any non-angulotl adjacent to an angulotl makes an **Intuition
          test.**
        tier1: 5 sonic damage; slowed (EoT)
        tier2: 4 sonic damage
        tier3: No effect.
  - type: feature
    feature_type: trait
    name: Rainfall
    icon: 🌀
    cost: 7 Malice
    effects:
      - effect: An angulotl calls clouds to cover the encounter map and unleash rain
          until the end of the round. Any creature or object that is exposed to
          the sky is wet until the end of the encounter.
