# Plan 2026-11-09 — Kishla Village: kreator many musi widzieć ląd z dodatkowym użyciem {T}

## Zgłoszenie właściciela (KV)

> „Auto-tapowanie do rzucenia czarów «nie widzi» tej karty. Mam 1 swamp,
> 4 foresty i Kishla Village. Rzucam czar za 4B. Powinienem dostać mana
> wizard z wyborem co chcę tapnąć na te 4 colorless. Nie dostaję.
> Auto-płatność tapuje swamp i 4 foresty.”

Nośnik: **Kishla Village** (`kishla-village`, TDM, Land; `{T}: Add {G}`
oraz `{3}{G}, {T}: Surveil 2`). Identifikator zgłoszenia: **KV** (litery
A–V są już zajęte przez wcześniejsze zgłoszenia — `test/zgloszenie-s-*`
to Clone Shell, `R` to zgłoszenie z 2026-10-26).

Zakres: **wyłącznie warstwa stołu** (`src/table/mana-wizard.js`), czyli
bramka „czy istnieje realny wybór płatności”. Silnik, protokół, kontrolery
i katalog kart **bez zmian** — Kishla jest już pełnoprawnym źródłem {G}
i auto-tap silnika płaci legalnie. Bez nowych kart katalogu (ADR 0029),
bez pełnego B0 (ADR 0018), bez scalania.

## Rozpoznanie przed kodem (sonda `.arena/probe-kishla.mjs`)

Scena headless na prawdziwej sesji stołu (`createSession`, `main1`,
6 lądów: 1 Swamp, 4 Forest, Kishla Village; czar `zombie-boa` za {4}{B}):

| Miara | Wartość (przed fixem) |
|---|---|
| `getSourceForObject(kishla)` | `{colors:['G'], amount:1}` — **poprawnie** |
| `manaAbilityColors(kishla)` | `['G']` — poprawnie (kosztowa zdolność surveil pominięta, M193/A) |
| `manaSourcesForPlayer(null)` | 6 wierszy, w tym `kishla` `kind:'land'` `colors:['G']` |
| `paymentDescriptorOf` | `totalNeeded:5`, `requirements:[['B']]`, `costStr:'{4}{B}'` |
| `producibleMana` / `canPayColoredCost` | `6` / `true` |
| **`countPaymentVariants`** | **1** ← przyczyna |
| `shouldOpenManaWizard` | **false** |
| `manaWizardFor(cmd)` | **null** → auto-płatność |

**Przyczyna źródłowa (zmierzona, nie zgadywana).** `countPaymentVariants`
(`src/table/mana-wizard.js:705`) buduje klucz wariantu wyłącznie z profilu
many:

```
`${s.kind ?? 'land'}:${[...s.colors].sort().join('')}#${s.amount ?? 1}#${koszt}`
```

Kishla Village i Forest mają **identyczny** profil (`land:G#1#-`), więc
podzbiór „Swamp + 4 Foresty” i „Swamp + 3 Foresty + Kishla” dostają ten
sam klucz → jeden kształt → `shouldOpenManaWizard` zwraca false → stół
wykonuje komendę bezpośrednio i silnik tapuje pierwsze źródła z kolei.

To jest **ta sama klasa błędu co zgłoszenie A (2026-09-10)**, tylko o poziom
głębiej: A rozróżnił `kind` (ląd vs stwór-zdolność), bo tapnięcie stwora ma
koszt alternatywny. Tutaj koszt alternatywny ponosi **ląd z dodatkową
zdolnością aktywowaną**: tapnięcie Kishli zabiera możliwość surveil 2 w tej
turze, a tapnięcie Forestu nie zabiera nic. Dwa Foresty są zamienne
(świadek A/2, M202/O — anty-over-fix), Forest i Kishla **nie są**.

### Reguła projektowa (generyczna, ADR 0002)

Klucz kształtu płatności musi nieść **sygnaturę kosztu alternatywnego**
źródła, czytaną z deskryptorów obiektu — nie z nazwy/ID karty:

- źródło, którego obiekt ma **inną** zdolność aktywowaną tapującą ten
  permanent (poza samą zdolnością many „za samo {T}”), ma inny koszt
  alternatywny niż źródło bez takiej zdolności;
- dwa obiekty o **tym samym** zestawie takich zdolności zostają jednym
  kształtem (dwie Kishle = jedna decyzja, jak dwa Foresty);
- sygnatura jest **kanoniczna i deterministyczna** (ADR 0005: sortowana,
  bez zależności od kolejności zdolności w danych).

Uzasadnienie w CR (wydanie 2026-11-06, SHA-256
`d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`,
mirror `nwgarne/mtg-data`, plik `.arena/cr-current.txt`):

- **CR 601.2g** (dosłownie): „If the total cost includes a mana payment,
  the player then has a chance to activate mana abilities (see rule 605,
  “Mana Abilities”). Mana abilities must be activated before costs are
  paid.” — wybór źródeł należy do gracza, nie do automatu.
- **CR 602.1a** (dosłownie): „The activation cost is everything before the
  colon (:). An ability’s activation cost must be paid by the player who
  is activating it.” — `{T}` jest kosztem; tapnięcie na manę wyklucza
  zapłacenie `{T}` w koszcie surveil.
- **CR 605.1a** (dosłownie): „An activated ability is a mana ability if it
  meets all of the following criteria: it doesn’t require a target (see
  rule 115.6), it could add mana to a player’s mana pool when it resolves,
  it’s not a loyalty ability (see rule 606, “Loyalty Abilities”), and its
  cost and effect don’t move any card to or from a library. Do not take
  into account replacement effects that may apply, other than
  self-replacement effects, when evaluating these criteria.” — surveil 2
  nie jest zdolnością many, więc jest **konkurencyjnym użyciem** tego
  samego `{T}`.

## Mini-roadmapa (kolejność commitów)

1. **Plan** (ten plik) — osobny commit + push **przed** edycją źródeł.
   Kryterium: plik w repo na gałęzi sesji, PR #184 zaktualizowany.
2. **Piny RED** — `test/zgloszenie-kv-kishla-kreator-many.test.js`
   (KV/1–KV/12): scena właściciela na prawdziwej sesji + router
   `manaWizardFor` z `main.js` + jednostkowe piny sygnatury i anty-over-fix.
   Kryterium: log `.arena/kv-red.log` z failami dokładnie w pinach
   opisujących brakujący wybór; piny anty-over-fix zielone od startu.
3. **Fix** — `src/table/mana-wizard.js`:
   - nowy helper `alternativeTapCostSignature(object)` (eksportowany,
     czytany z `activatableAbilities`/`abilities` obiektu widoku),
   - `untappedLandSourcesOf`/`manaSourcesOf` przenoszą sygnaturę na wiersz
     źródła (`altTap`), `manaSourcesOf` także dla wierszy nie-lądowych,
   - `variantKey` w `countPaymentVariants` dokleja sygnaturę.
   Kryterium: KV/1–KV/12 GREEN, pełne `npm test` fail 0, `npm run build` OK,
   osobny commit + natychmiastowy push.
4. **Dowody mutacyjne** — mKV1…mKV6 (usunięcie sygnatury z klucza,
   sygnatura stała, pominięcie warunku `tap`, liczenie zdolności many jako
   alternatywy, brak kanonicznej kolejności, sygnatura po `cardId`).
   Kryterium: każda mutacja RED w co najmniej jednym pinie; źródło
   przywrócone bitowo (`sha256sum -c`).
5. **Bramy** — `npm test` (szybki rdzeń) + `npm run build` na przyroście,
   następnie `npm run test:all`; strażnicy docs/CR + `cr-numery`.
   Kryterium: fail 0, logi w `.arena/kv-*.log` (wzorzec ENVIRONMENT §5a).
6. **Dokumentacja** — sekcja „Wykonanie” w tym planie, raport
   `docs/audits/ZGLOSZENIE_KV_KISHLA_KREATOR_MANY_2026-11-09.md`, wpis
   w `docs/PROJECT_HISTORY.md`, §10 w `docs/setup/HANDOFF_2026-11-08.md`,
   opis PR #184 (REST PATCH). Kryterium: strażniki dokumentacji zielone.

## Ryzyka i pułapki

- **Over-fix**: sygnatura NIE może rozróżniać dwóch identycznych lądów
  (A/2, M202/O) ani dwóch takich samych Kishli. Świadkowie anty-over-fix
  są w pinach KV/7–KV/9 i w istniejących testach A/M202.
- **Koszt zdolności many nie jest alternatywą** — zdolność `{T}: Add
  {G}` tego samego obiektu nie może podnieść sygnatury (inaczej każdy
  ląd dostaje inny klucz i kreator otwiera się zawsze).
- **Widok a pełny stan** (L14/L41): `activatableAbilities` JEST w widoku
  pola bitwy (`game-state.js:7748`), więc helper nie potrzebuje mostka
  `abilityInfo`; dla obiektów bez tego pola (stare testy, stuby) sygnatura
  musi być pusta — brak zmiany zachowania.
- **Grant aury** (`manaGrant`, zgłoszenie L): wiersz grantu zastępuje własną
  zdolność; sygnatura nie może go zduplikować (pin L/2 porównuje wiersz
  `deepEqual` — nowe pole tylko gdy niepuste).
- **Wydajność**: `countPaymentVariants` jest DFS z cap 2; sygnatura liczona
  RAZ na wiersz źródła (przy budowie listy), nie wewnątrz DFS.
- Kolizje liter zgłoszeń: **KV** wolne (sprawdzone grepem w `docs/` i `test/`).

## Kryteria ukończenia

- [ ] Plan wypchnięty przed kodem źródeł.
- [ ] Piny KV RED → GREEN, anty-over-fix zielone od startu.
- [ ] Fix generyczny (bez nazwy/ID karty w kodzie), osobny commit + push.
- [ ] Mutacje mKV1–mKV6 RED, źródło przywrócone bitowo.
- [ ] `npm test` fail 0 + `npm run build` OK na przyroście.
- [ ] `npm run test:all` fail 0.
- [ ] Docs: plan „Wykonanie”, raport, historia, handoff, PR #184 PATCH.
