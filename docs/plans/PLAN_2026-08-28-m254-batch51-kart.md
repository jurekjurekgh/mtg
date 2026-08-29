# PLAN 2026-08-28 — Batch 51: 8 kart z listy właściciela (sesja arena/01a049c7)

**Sesja:** `arena/01a049c7-mtg`. **Baza:** `main` @ `6d04551` (squash PR #86), HEAD
`7282095` (porządki w artefaktach audytu).
**Prompt właściciela:** lista 8 kart (numer ilustracji + set, nazwa, set, plan):

| # | Karta | Set | Plan | Mechanika |
|---|---|---|---|---|
| 572GTC | Skinbrand Goblin | GTC | Ravnica | **Bloodrush** {R}, discard → atakujący +2/+1 (nowa) |
| 573FRF | Typhoid Rats | FRF | Tarkir | deathtouch (keyword) |
| 574M15 | Invasive Species | M15 | Warhammer Fantasy | ETB: oddaj INNY swój permanent na rękę |
| 575DTK | Dromoka Warrior | DTK | Tarkir | wanilia 3/1 |
| 576ORI | Akroan Sergeant | ORI | Theros | first strike + **Renown 1** (nowa) |
| 577DST | Thunderstaff | DST | Warhammer Fantasy | statyczna prewencja 1 obrażeń + {2},{T}: atakujące +1/+0 |
| 578THS | Savage Surge | THS | Warhammer Fantasy | instant: +2/+2 i odkręcenie celu |
| 579ECL | Kulrath Mystic | ECL | Lorwyn | trigger na czar MV ≥ 4 → +2/+0 i vigilance |

**Zasady:** ADR 0020 (PR na starcie, audyt poprzedniego PR, inkrementalne commity
po jednym zielonym kroku, bez force push), ADR 0010 §2a (Scryfall PRZED kodowaniem),
ADR 0014 (pojedynczy moduł definicji), ADR 0002 (zero warunków na nazwę karty),
ADR 0019 (pokrycie strukturalne katalogu automatem), ADR 0022 (`supported` = 100%
Oracle albo `unsupported`), ADR 0023 (talia per plan, generator = źródło prawdy).

## Pomiar startowy

- `npm test` (szybki rdzeń): **3625/3625 pass**, ~130 s.
- `npm run build`: 55 modułów / **2835.1 kB**.
- Katalog: 428 kart z `artId`; słownik kolekcji 571 pozycji.

## Etap 1 — dane (ADR 0010 §2a)

- [x] `docs/cards/scryfall-<id>.json` × 8 (koszt, typy, P/T, Oracle, `image_uris`,
      `pobrano: 2026-08-28`) — pobrane z API Scryfall per druk (`?exact=…&set=…`).
- [x] `tools/collection-art-ids.csv`: +8 pozycji 572–579 (kolumny: Ilustracja,
      Nazwa, Plan — trzy, żeby strażnik M197/K2 nie czytał nazwy karty jako planu).
- [x] `test/art-ids-tool.test.js`: liczba pozycji słownika 571 → **579**.

## Etap 2 — nowe mechaniki generyczne (ADR 0002: bez warunków na nazwę)

- [ ] **Bloodrush** (CR 207.2c — ability word, nie keyword; zdolność aktywowana
      karty w RĘCE, koszt mana + odrzucenie, cel = atakujący stwór):
      `createAbility({ type: activated, bloodrush, cost, targets, effect })`
      wzorowane na reinforce (M166/B) — oferta z ręki, walidacja `zone === 'hand'`,
      odrzucenie jako KOSZT, efekt przez stos; nowy typ celu `attacking_creature`
      w ofercie **i** walidacji (pułapka M82).
- [ ] **Renown N** (CR 702.112): deskryptor karty `renown: N` (jak `bloodthirst`),
      pełny łańcuch registry → deck → addObject → createGameObject (klasa L21);
      w `dealCombatDamageToPlayer`: brak `renowned` → N liczników +1/+1 + flaga
      `renowned` na obiekcie (CR 702.112b: znacznik ginie po opuszczeniu pola).
- [ ] **Filtr celu triggeru** `permanent` + `controlledBy: 'controller'` +
      `notSelf` (Invasive Species — „another permanent YOU control”).
- [ ] **Warunek triggeru** `spellManaValueAtLeast` dla `when_you_cast_spell`
      (Kulrath Mystic — „spell with mana value 4 or greater”).
- [ ] **Efekt** `buff_attacking_creatures` (Thunderstaff) — zbiór stworów
      ustalany przy rozstrzygnięciu (CR 611.2c, wzorzec `buff_creatures_you_control`).
- [ ] **Prewencja statyczna** `preventCombatDamageToController: { amount, whileUntapped }`
      w `dealCombatDamageToPlayer` (Thunderstaff — per źródło obrażeń, nie per tura).

## Etap 3 — definicje kart (`src/cards/card-data.js`)

- [ ] 8 × `defineCard()` w sekcji `REAL_CARDS`: pełne mechaniki,
      `support: { status: 'supported', limitations: [] }` (ADR 0022), `artId` i
      `plan` zgodne ze słownikiem (strażnik M197/K3), `oracleText` dosłowny.
- [ ] `src/cards/mana-costs-data.js`: wpis dla każdej karty nielądowej
      (strażnik walidacji kolorów, M66).
- [ ] `node tools/generate-plan-decks.mjs` (ADR 0023 §4 — generator, nie ręczna
      edycja); aktualizacja zszytych liczności w `test/art-ids-tool.test.js`
      (428 kart z artId → 436).

## Etap 4 — testy `test/batch51-kart.test.js`

- [ ] Każda karta: scenariusz legalny + **scenariusz nielegalny** (maszynowy błąd
      walidacji) + sanity danych (Oracle/UUID/artId/status).
- [ ] Interakcje: bloodrush wyłącznie z ręki i wyłącznie w atakującego; renown
      raz na obiekt (drugi raz bez efektu); Thunderstaff prewencja wyłącznie
      gdy nietapnięty; Kulrath Mystic nie reaguje na czar MV 3.
- [ ] Weryfikacja mutacyjna (L61) każdej nowej mechaniki.

## Etap 5 — dokumentacja i PR

- [ ] `docs/PROJECT_HISTORY.md` (sekcja sesji: Batch 51 + nowe mechaniki),
      opis PR #87 (liczby: testy, moduły/kB, katalog).
- [ ] `npm test` i `npm run build` po każdym commitcie (ADR 0020 C).

## Kryteria wyjścia

- [ ] 8 kart `supported` w katalogu, wszystkie w dokładnie jednej talii (ADR 0023).
- [ ] `npm test` zielone, `npm run build` OK — liczby w opisie PR.
- [ ] Zero `support.limitations` w nowych kartach (ADR 0022).
