# PLAN M145 — audyt PR #62 + Batch 35 (Oracle ze Scryfalla)

- **Data:** 2026-08-18
- **Gałąź:** `arena/01a0165e-mtg`
- **Źródło zadania:** ADR 0021 (prompt „kontynuujemy” = pętla domyślna) + niedokończony plan Batch 35 na `main`

## Rozpoznanie

1. Sesja startuje z `main` = squash PR #62 (M143/M144).
2. ADR 0020: PR na starcie → audyt poprzedniego PR → inkrementalne commity.
3. ADR 0021 pkt 3: najnowszy niedokończony plan na `main` to `PLAN_2026-08-18-batch35-kart.md`.
4. **Kluczowe odkrycie (ADR 0010 §2a):** tabela w tamtym planie została wpisana z pamięci. Porównanie ze Scryfall (`set=`) pokazuje, że 6 z 10 kart ma zły koszt, typ, P/T albo zupełnie inną mechanikę.

## Prawdziwe Oracle (pobrane 2026-08-18)

| Karta | Set | Koszt | Typ | Oracle (skrót) | vs stary plan |
|---|---|---|---|---|---|
| Titan's Strength | ORI | {R} | Instant | +3/+1, Scry 1 | zgodne |
| Wolfkin Bond | M20 | {4}{G} | Aura | ETB token Wolf 2/2, +2/+2 | zgodne |
| Trade Route Envoy | TDM | **{3}{G}** | **Creature — Dog Soldier 4/3** | ETB: dobierz, jeśli kontrolujesz stwora z licznikiem; wpp +1/+1 na siebie | plan: {1}{W} Human Scout 1/1, wybór koloru — **zmyślone** |
| Twiddle | 8ED | {U} | **Instant** | You may tap or untap target artifact, creature, or land | plan: Sorcery |
| Steelfin Whale | MH2 | **{5}{U}** | **Creature — Whale 3/4** | Affinity for artifacts; whenever an artifact you control enters, untap this | plan: {6}{U} Artifact Creature 3/5 + obniżka inst/sorc — **złe** |
| Blazing Torch | ISD | {1} | Equipment | Equipped can't be blocked by Vampires/Zombies; equipped has {T}, Sac Torch: 2 dmg any target; Equip {1} | plan: niepełne |
| Simian Simulacrum | BRO | **{3}** | **Artifact Creature — Ape 2/1** | ETB: 2× +1/+1 na twojego stwora; Unearth {2}{G}{G} | plan: {4} 3/2 haste, dies draw — **zmyślone** |
| Mark of the Vampire | M14 | **{3}{B}** | Aura | +2/+2 i lifelink | plan: {3}{B}{B} |
| Basilisk Gate | CLB | — | Land — Gate | {T}: {C}; {2}, {T}: +X/+X, X = liczba Gate'ów; tylko sorcery | plan: ETB tapped + any-color przy 2+ Gate — **zmyślone** |
| Mindstab | TSP | **{5}{B}** | Sorcery | Target player discards 3. Suspend 4—{B} | plan: {4}{B}{B} |

Wszystkie 10 kart są w `tools/collection-art-ids.csv`.

## Etapy (kryteria ukończenia)

### E0 — PR sesji + audyt PR #62
- [ ] Gałąź na GitHubie, PR otwarty
- [ ] `docs/audits/AUDYT_PR62_2026-08-18.md`
- [ ] `npm test` + `npm run build` zielone

### E1 — pliki Scryfall (ADR 0010 §2a) PRZED definicjami
- [ ] `docs/cards/scryfall-<id>.json` dla 10 kart (UUID z adresu obrazka)
- [ ] Strażnik `card-sources-guard` przejdzie po dopisaniu definicji

### E2 — karty bez nowej mechaniki (reuse)
Titan's Strength, Wolfkin Bond (token_wolf jest), Mark of the Vampire, Simian Simulacrum (unearth_return jest).
- [ ] definicje + MANA_COSTS + talie singleton
- [ ] testy legalne/nielegalne
- [ ] `npm test` + build

### E3 — nowe mechaniki generyczne (ADR 0002, nie po nazwie karty)
1. **affinity** — `costReduction.condition.perControlledType` (Steelfin Whale)
2. **artifact you control enters → untap source** — nowy event triggera (Steelfin)
3. **draw-if-creature-with-counter else self-counter** — ETB Trade Route Envoy
4. **tap or untap target** — tryby / warianty czaru (Twiddle)
5. **can't be blocked by subtypes** — deskryptor equipment (Blazing Torch)
6. **granted activated ability on equipped** — Torch: {T} nosiciela, Sac sprzętu
7. **pump X = count of subtype you control** — Basilisk Gate
8. **suspend** — Mindstab (CR 702.62): exile z time counters, upkeep −1, last → free-cast

- [ ] każda mechanika z testem RED→GREEN
- [ ] zero porównań `cardId`/`cardName` w `src/engine` (strażnik ADR 0002)

### E4 — pozostałe karty + talie + dokumentacja
- [ ] 10/10 `supported`, `limitations: []` (albo świadomy powód ze strażnika)
- [ ] talie + strażnik proporcji lądów (M132)
- [ ] `PROJECT_STATE.md` + ENGINE_MILESTONES
- [ ] `npm test` + `npm run build` + szybki benchmark (ADR 0018, bez `--full`)

## Planowane commity

1. ten plan
2. audyt PR #62
3. pliki Scryfall
4. E2 (4 karty reuse)
5. mechanika affinity + Steelfin
6. Trade Route Envoy + Twiddle
7. Blazing Torch + Basilisk Gate
8. suspend + Mindstab
9. talie, docs, stan projektu

## Ryzyka

- **Suspend** to najcięższa nowa mechanika (strefa exile z licznikami czasu, free-cast, „you may”). Jeśli czas sesji nie starczy, Mindstab zostaje na końcu z jawnym statusem w planie — nie oznaczamy karty `supported` bez pełnego Oracle.
- Plan Batch 35 z `main` **nie jest źródłem prawdy** o mechanikach — tylko o liście nazw. Implementujemy Scryfall.
- `edit_file` psuje polskie znaki — docs przez `python3` + UTF-8.
- Sandbox resetuje workspace — push po każdym zielonym commicie.

## Podsumowanie wykonania

_(uzupełnić na końcu zadania)_
