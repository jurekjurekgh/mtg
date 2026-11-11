# Zgłoszenie właściciela KV — Kishla Village: kreator many nie pytał o źródło z dodatkowym użyciem {T}

- **Data:** 2026-11-09
- **PR:** #184, gałąź `arena/76d4141f-mtg`
- **Plan:** `docs/plans/PLAN_2026-11-09-kishla-kreator-many.md`
- **Commity:** `ee6ee3d` (plan), `3903740` (fix + piny KV), dokumentacja finalna
- **Zakres:** wyłącznie warstwa stołu (`src/table/mana-wizard.js`). Silnik,
  protokół, kontrolery i katalog kart **bez zmian**. Bez nowych kart
  (ADR 0029), bez pełnego B0 (ADR 0018), bez scalania.

## 1. Problem

Właściciel: „Auto-tapowanie do rzucenia czarów «nie widzi» tej karty. Mam
1 swamp, 4 foresty i Kishla Village. Rzucam czar za 4B. Powinienem dostać
mana wizard z wyborem co chcę tapnąć na te 4 colorless. Nie dostaję.
Auto-płatność tapuje swamp i 4 foresty.”

Nośnik: **Kishla Village** (`kishla-village`, TDM, Land) — `{T}: Add {G}`
oraz `{3}{G}, {T}: Surveil 2`.

## 2. Diagnoza — „nie widzi” nie znaczy „nie ma na liście”

Sonda `.arena/probe-kishla.mjs` na **prawdziwej sesji stołu**
(`createSession`, `main1`, 1 Swamp + 4 Foresty + Kishla, `zombie-boa`
za {4}{B}), router `manaWizardFor` wycięty z `src/table/main.js`:

| Miara | Przed fixem | Po fixie |
|---|---|---|
| `getSourceForObject(kishla)` | `{colors:['G'],amount:1}` | bez zmian |
| `manaAbilityColors(kishla)` | `['G']` | bez zmian |
| `playerView…manaSource` | `{colors:['G'],amount:1}` | bez zmian |
| `manaSourcesForPlayer(null)` | 6 wierszy, Kishla obecna | 6 wierszy + `altTap` na Kishli |
| `paymentDescriptorOf` | `totalNeeded:5`, `requirements:[['B']]` | bez zmian |
| `producibleMana` / `canPayColoredCost` | `6` / `true` | bez zmian |
| **`countPaymentVariants`** | **1** | **2** |
| **`shouldOpenManaWizard`** | **false** | **true** |
| **`manaWizardFor(cmd)`** | **null (auto-pay)** | **deskryptor (kreator)** |
| Scena kontrolna: 5 Forestów, bez Kishli | 1 / false / null | **1 / false / null** (bez zmian) |

**Przyczyna źródłowa.** `countPaymentVariants` buduje klucz kształtu
płatności wyłącznie z profilu many:

```
`${kind}:${kolory}#${amount}#${kosztAktywacji}`
```

Kishla i Forest mają identyczny profil `land:G#1#-`, więc podzbiory
„Swamp + 4 Foresty” oraz „Swamp + 3 Foresty + Kishla” dostawały **ten sam
klucz** → jeden wariant → bramka M202/O uznawała, że wyboru nie ma → stół
wykonywał komendę bezpośrednio, a silnik tapował pierwsze źródła z kolei.

To klasa zgłoszenia **A (2026-09-10)** o poziom głębiej. A dodało do klucza
RODZAJ źródła, bo tapnięcie stwora ma koszt alternatywny (nie atakuje/nie
blokuje). Tu koszt alternatywny ponosi **ląd**: tapnięcie Kishli zabiera
surveil 2 w tej turze, tapnięcie Forestu nie zabiera nic.

## 3. Podstawa w CR (wydanie 2026-11-06, dosłownie)

Plik: mirror `nwgarne/mtg-data` (`rules/cr-raw.txt`), SHA-256
`d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`.

- **CR 601.2g**: „If the total cost includes a mana payment, the player
  then has a chance to activate mana abilities (see rule 605, “Mana
  Abilities”). Mana abilities must be activated before costs are paid.”
  → wybór źródeł należy do gracza, automat nie może go zawłaszczać.
- **CR 602.1a**: „The activation cost is everything before the colon (:).
  An ability’s activation cost must be paid by the player who is
  activating it.” → `{T}` jest kosztem obu zdolności Kishli; użycia
  konkurują o ten sam zasób.
- **CR 605.1a**: „An activated ability is a mana ability if it meets all
  of the following criteria: it doesn’t require a target (see rule
  115.6), it could add mana to a player’s mana pool when it resolves,
  it’s not a loyalty ability (see rule 606, “Loyalty Abilities”), and its
  cost and effect don’t move any card to or from a library. Do not take
  into account replacement effects that may apply, other than
  self-replacement effects, when evaluating these criteria.” → surveil 2
  nie jest zdolnością many, więc jest **konkurencyjnym użyciem** tapnięcia.

Numery były już w tabeli cytowań (`test/helpers/cr-numery-tabela.js`) —
regeneracja nie była potrzebna.

## 4. Naprawa (generyczna, ADR 0002)

`src/table/mana-wizard.js`:

1. **`alternativeTapCostSignature(object)`** (eksportowany) — czyta
   `activatableAbilities` z widoku (ta sama lista, po której indeksuje
   silnik, L48) z fallbackiem na `abilities` pełnego obiektu i zwraca
   **kanoniczną, sortowaną** sygnaturę zdolności aktywowanych, które
   (a) mają `{T}` w koszcie i (b) **nie** są zdolnościami many
   (`isManaAbility`). Klucz deskryptora sortuje pola i pomija `null`/
   `undefined`, więc pełny stan i widok dają ten sam wynik (L41).
2. Wiersze źródeł niosą `altTap`: lądy (`untappedLandSourcesOf`), wiersz
   grantu aury, wiersze nie-lądowe i grupy `tapCostChoices`
   (`manaSourcesOf`). Pole dodawane **tylko gdy niepuste** — wiersz
   zwykłego lądu zostaje bitowo taki sam (świadek L/2 `deepEqual`).
3. `variantKey` w `countPaymentVariants` dokleja `#${altTap}`.

**Anty-over-fix (zachowane bez zmian):** kind w kluczu (A), koszt
aktywacji jako osobny człon (M311/M405/B), deduplikacja źródeł zamiennych
(A/2, M202/O). Dwa Foresty → jeden kształt; dwie Kishle → jeden kształt;
Forest + Kishla → dwa kształty. Własna zdolność `{T}: Add …` nie podnosi
sygnatury (inaczej kreator otwierałby się zawsze).

## 5. Dowody

- **Piny** `test/zgloszenie-kv-kishla-kreator-many.test.js` (KV/1–KV/15):
  RED **9 fail / 4 pass** (`.arena/kv-red.log`) → GREEN **15/15**
  (`.arena/kv-green.log`). Anty-over-fix KV/7 (pięć zamiennych Forestów)
  i KV/8 (cztery identyczne Kishle) zielone **od startu**.
- **Mutacje** (`.arena/mutate-kv.py`, logi `.arena/mut-mkv*.log`) —
  wszystkie **RED**:

| Mutacja | Co psuje | Świadkowie |
|---|---|---|
| mKV1 | klucz wariantu bez sygnatury (stan przed fixem) | KV/2, KV/3, KV/4, KV/5 |
| mKV2 | sygnatura stała (`'alt'`) dla wszystkich | KV/14, KV/15 |
| mKV3 | brak warunku `{T}` w koszcie | KV/11 |
| mKV4 | zdolność many liczona jako alternatywa | KV/10, KV/11 |
| mKV5 | brak kanonicznego sortowania | KV/15 |
| mKV6 | sygnatura po `cardId` zamiast po deskryptorach | KV/6, KV/13, KV/11, KV/14, KV/15 |
| mKV7 | wiersz lądu gubi `altTap` w `manaSourcesOf` | KV/2, KV/3, KV/4, KV/5, KV/6 |

  Po każdej mutacji źródło przywrócone **bitowo**
  (`sha256 31cccda4044c3626443d09a62a9221aa55eb08f6e4ab8d7c34fb65332bb212ba`).
- **Sąsiedkie piny kreatora**: 12 plików, **127/127**
  (`.arena/kv-neighbours.log`) — A, M202/O, M311, Mana Cylix, hybrid,
  Dismal Backwater, Nature's Embrace, A19/A20/A86, batch66.
- **Bramki**: `npm test` **10196/10196, fail 0, 0 skipped** (~205 s,
  `.arena/kv-fast-2.log`); `npm run build` **78 modułów / 5818,6 kB**
  (`.arena/kv-build-2.log`); `npm run test:all` — wynik w §6.
- **Strażnik generyczności**: KV/12 sprawdza, że kod `mana-wizard.js`
  (bez komentarzy) nie zawiera nazwy karty; `engine-card-agnostic-guard`
  zielony w pełnej bramce.

## 6. Bramy końcowe

- `npm test`: **10196/10196**, fail 0, skipped 0.
- `npm run build`: **78 modułów / 5818,6 kB**.
- `npm run test:all`: **10465/10465**, fail 0, skipped 0 (~632 s,
  `.arena/kv-test-all.log`).
- Strażnicy dokumentacji/CR/generyczności: **94/94** (`.arena/kv-docs-guards.log`);
  `node tools/cr-numery.mjs --cr .arena/cr-current.txt` — OK, bez
  regeneracji tabeli (576 numerów).
- Golden-master bota: bez regeneracji, fixture nietknięty (fix nie dotyka
  kontrolerów).

## 7. Świadome granice

- Sygnatura opisuje **koszt alternatywny tapnięcia**, nie pełną wycenę
  strategiczną. Ląd z `{T}: Surveil 2` i ląd z `{T}: draw` to różne
  kształty; dwa lądy z identyczną alternatywą — jeden kształt.
- Zdolności bez `{T}` w koszcie (np. `{1}: …`) i triggery nie wchodzą do
  sygnatury — tapnięcie ich nie zabiera.
- Konwertery many z kosztem (`{1},{T}: Add {B}`) mają już osobny wiersz
  źródła z `activationCost` (M405/B); nie są dublowane w sygnaturze.
- Naprawa nie zmienia legalności żadnej komendy — decyduje wyłącznie
  o tym, czy UI pyta gracza, czy płaci automatycznie.
