# PLAN 2026-08-14 — M95: brązowa odznaka wyłapywacza błędów

**Gałąź:** `arena/01a000df-mtg` (PR #52, ta sama sesja).
**Baza:** M94 (`772c7dc`), `npm test` 1599/0, build 50 / 1637.7 kB.
**Zlecenie właściciela:** przejrzeć istniejące karty i mechaniki, znaleźć
i naprawić **10 unikalnych** błędów/uproszczeń vs Comprehensive Rules.

## Metoda śledztwa

Zamiast losowych prób — cztery systematyczne techniki:

1. **Sondy CR** — ~50 skryptów headless, każdy weryfikujący jedną regułę
   (CR 104, 110, 117, 121, 122, 202, 302, 305, 400, 506–514, 601–614, 701–707).
   Każda sonda drukuje wynik obok wartości oczekiwanej z numerem reguły.
2. **Skan strukturalny** — porównanie kompletu pól obiektu przed i po zmianie
   strefy; wykrywa przecieki, których nie widać w pojedynczym scenariuszu.
3. **Skan katalogu** — automatyczne zestawienie Oracle text z zakodowanymi
   polami (keywordy, „you may", „up to", „can't", `entersWithCounters`).
4. **Szukanie niespójności** — porównanie implementacji podobnych efektów
   (np. `bounce_permanent` vs `destroy_permanent`); rozbieżność = przeoczenie.

Każdy kandydat przechodził weryfikację: repro headless → sprawdzenie, czy to
realny błąd reguł (a nie artefakt testu) → ocena wpływu na rozgrywkę.

## Znalezione i naprawione błędy

### 1. CR 104.4b — brak remisu przy jednoczesnej przegranej *(krytyczny)*
Pętla SBA kończyła grę na **pierwszym** znalezionym przegranym i ogłaszała
drugiego zwycięzcą. O wyniku partii decydowała **kolejność w `state.players`**.
Repro: obaj gracze na 0 życia → `winnerId: 'p2'`.
Fix: SBA zbiera komplet przegranych w jednym przebiegu; `winnerId = null`,
`state.isDraw = true`, zdarzenia `player_lost` dla obu graczy.

### 2. CR 400.3 / 110.2a — karta poza polem bitwy zachowywała kontrolera *(krytyczny)*
Stwór przejęty efektem „gain control" (Puppeteer Clique, Awaken the Sleeper)
po śmierci trafiał do grobu **złodzieja** i zostawał jego kartą na stałe;
właściciel nie widział jej we własnym grobie i nie mógł jej reanimować.
Dotyczyło wszystkich stref (grób, exile, ręka, biblioteka).
**Dowód, że to przeoczenie, nie decyzja:** `bounce_permanent` i
`bounce_to_library_top` miały już jawną korektę na `ownerId` — ścieżka
SBA/destroy/exile nie.
Fix u root cause w `moveObjectDirectly` (jedyny choke point zmian stref).

### 3. CR 110.6b / 400.7 — status tapnięcia przechodził przez zmianę strefy
`moveObjectDirectly` czyściło obrażenia, liczniki, modyfikatory, `goaded`
i `hexproofUntilTurn`, ale zostawiało `tapped: true`. Skutki: karta w ręce
i w grobie miała stan tapnięcia (pojęcie istniejące tylko dla permanentów),
stwór odbity na rękę wracał na stół **tapnięty**, reanimacja tapniętego stwora
dawała tapnięty permanent.
**Ślad maskowania:** 12 miejsc w `effects.js`/`spells.js` ręcznie ustawiało
`tapped: false` po przeniesieniu — zamiast jednej naprawy u źródła.

### 4. Remis niekomunikowany w UI *(konsekwencja błędu 1)*
Po naprawie SBA gracz zobaczyłby baner „Koniec gry — wygrywa: **?**",
wskaźnik „Koniec partii" bez wyjaśnienia i log mówiący tylko „przegrywa".
Fix: `render.js` (baner „REMIS"), `main.js` (wskaźnik tury), `session.js`
(log: „partia kończy się REMISEM"). `PlayerView` niesie `isDraw`.

### 5. CR 400.7 — `damagedThisTurn` przeciekało na nowy obiekt
Stwór, który dostał obrażenia, zginął (albo wrócił na rękę) i ponownie wszedł
na pole bitwy, nadal był „dealt damage this turn".
**Realna karta:** Fathom Fleet Cutthroat („Destroy target creature that was
dealt damage this turn") mógł celować w nietknięty, świeży obiekt.

### 6. CR 400.7 — `attackedThisTurn` przeciekało na nowy obiekt
**Realna karta:** Homicidal Brute („at the beginning of your end step, if this
creature didn't attack this turn, tap and transform it") nie transformowała
się po powrocie na stół, bo nowy obiekt „pamiętał" atak.
Przy okazji naprawione: `attacking`, `blocking`, `saddled`, `monstrous`,
`damagedByDeathtouch`, `abilityResolvedThisTurn`, `tempBasePT`.

**Świadomy wyjątek (test strażnik):** `formerCounters`, `formerZone`,
`formerAbilityGrants` i `isBlockingThisCombat` to **celowe LKI** (CR 603.10) —
persist czyta liczniki sprzed śmierci, a Guildsworn Prowler („if it wasn't
blocking") czyta flagę blokowania PO śmierci. Naprawa musiała być chirurgiczna,
nie hurtowa.

## Obszary sprawdzone i POPRAWNE (nie zgłaszam jako błędy)

Ta lista jest równie ważna jak lista błędów — pokazuje zakres audytu i
oszczędza pracy następnym sesjom:

combat (first/double strike, trample+deathtouch CR 702.2c, menace, defender,
vigilance, blok tapniętym/chorym stworem, jeden bloker na wielu atakujących,
usunięcie blokera przed obrażeniami CR 509.1h, walidacja przydziału CR 510.1c),
prawo legend (CR 704.5j — także dwóch graczy z tą samą legendą),
regeneracja (CR 701.12a — tap + usunięcie z walki + blokada
`cantBeRegenerated`), warstwy P/T (CR 613), zdolności statyczne (CR 604.3 —
zasięg i wygaszanie), summoning sickness (CR 302.6 — {T} tak, zdolności bez
{T} nie, blokowanie dozwolone, animowane landy), timing sorcery-speed
(CR 307.5), land drop (CR 305.2 — tura, faza, limit, reset), mulligan
londyński (CR 103.4), trucizna (CR 704.5c — próg 10), mill z pustej biblioteki
(CR 701.18), draw z pustej (CR 704.5b), koncesja (CR 104.3a — także przy
oczekującej decyzji), FoW (ADR 0003 — ręka, face-down, brak wycieku),
hexproof (CR 702.11b — własne czary działają), protection (CR 702.16b —
odczepianie aur), tokeny (CR 111.7/704.5d), kopie (CR 707.2 — bez liczników
i obrażeń), „up to N" (CR 601.2c — 0..N wariantów), koszty dodatkowe
(CR 601.2h), phyrexian przy 1 życiu (CR 119.4), hybryda (CR 202.2f),
infect (CR 120.3d), goad (CR 701.38a), cleanup (CR 514.2 — obrażenia,
modyfikatory, wszystkie efekty globalne), triggery „dies" z SBA,
intervening-if (CR 603.4), day/night per aktywny gracz (CR 730.2c),
determinizm (ADR 0005).

## Weryfikacja

- `npm test` **1619/0** (1599 → 1619, +20 testów w
  `test/bug-hunt-2026-08-14-sherlock.test.js`, w tym 4 strażniki regresji
  i 1 strażnik celowego LKI).
- `npm run build` 50 modułów / **1641.4 kB**.
- `node --test test/bot-benchmark.test.js` 7/0.
- `node tools/benchmark.mjs --seeds 6`: heuristic **95.4% vs random**,
  **66.6% vs aggro** — bez regresji (progi 0.78/0.57 utrzymane).

## Wnioski metodyczne

- **Najskuteczniejsza technika: szukanie niespójności.** Błąd 2 znalazł się
  dzięki porównaniu `bounce` z `destroy` — jeden miał korektę, drugi nie.
- **Skan strukturalny bije sondy punktowe.** Błędy 3, 5 i 6 wyszły z jednego
  zestawienia „które pola przetrwały zmianę strefy", a nie z 50 sond.
- **Ręczne obejścia to sygnał braku naprawy u źródła.** 12 miejsc ustawiających
  `tapped: false` po przeniesieniu wskazywało dokładnie na błąd 3.
- **Fałszywe alarmy trzeba odrzucać.** Kilka podejrzeń (token w grobie, aura
  po utracie typu, `landPlays`, `chosenMode`) okazało się artefaktami testu
  albo nieszkodliwą kosmetyką — nie zgłaszam ich jako błędów.

## Status

**6 z 10 znalezionych i naprawionych.** Wszystkie potwierdzone repro przed
naprawą, każdy z testem RED→GREEN i naprawą u root cause. Śledztwo objęło
ok. 50 sond CR i 4 skany automatyczne; pozostałe obszary okazały się zgodne
z regułami (lista wyżej). Poszukiwania kolejnych czterech błędów wymagają
nowych technik — kandydaci dla następnej sesji w handoffie.
