# PLAN 2026-08-14 — M96: audyt Żywym Testerem (rola gracza)

**Gałąź:** `arena/01a000df-mtg` (PR #52).
**Baza:** M95 (`7c4ed38`), `npm test` 1619/0, build 50 / 1641.4 kB.

**Zlecenie właściciela:** wcielić się w gracza, rozegrać partie różnymi taliami
i audytować **realne wydarzenia na stole** (nie kod engine). Osie wskazane
przez właściciela:

1. bezsensowne działania bota;
2. brak istotnych informacji w modalu „Ruch przeciwnika" i w logu (obrażenia,
   wyniki czarów/zdolności, wejścia stworów/tokenów/liczników, dobrania — *„wszystko
   poza szumem powinno tam być"*);
3. brak miejsca na ptaszkowanie (wyciszenie auto-pass) czarów i zdolności.

## Rozegrane partie (12 przebiegów, 9 talii)

azorius/black 101, spellslinger/tokens 202, innistrad/wiedzmin 303,
graveyard/mechanicy 404, red/green 505, ostrza/sojusznicy 606,
spellslinger/red 11/22/33, mechanicy/graveyard 909, wiedzmin/tokens 111,
sojusznicy/black 222.

## Znaleziska

### A. Oś 1 — bot mieli WŁASNĄ bibliotekę (Cellar Door) — 7× w jednej partii
Transkrypt: `Nieprzyjaciel aktywuje zdolność: Cellar Door → cel: Nieprzyjaciel`
(×7). Cellar Door: „{3}, {T}: **Target player** mills 1. If it's a creature
card, you create a 2/2 Zombie." Token dostaje kontroler **niezależnie** od celu,
więc celowanie w siebie jest ściśle gorsze (przybliża własny deck-out).
**Root cause:** scoring `activate_ability` **w ogóle nie wycenia** efektów
`mill_cards`/`mill_from_bottom` ani `damage`/`lose_life` z celem-graczem —
wszystkie cele dostają to samo `score = 2`. Ta sama klasa błędu co M91/C
(brak wyceny efektów usuwających) i M92 (brak danych = ślepota bota).
Uwaga: ścieżka `cast_spell` (linia 348) rozróżnia własny/wrogi mill — czyli
mamy **niespójność między dwoma ścieżkami** tej samej mechaniki.

### B. Oś 2 — bot poświęca stwora (exploit), gracz nie widzi KOGO
`exploit_choice_resolved` z polem `exploitedId` nie ma opisu → brak wpisu
w logu i w modalu. **Wariant „nie poświęca" MA opis** („Exploit: … nie
poświęca — zdolność odpada") — niespójność w obrębie jednego zdarzenia.

### C. Oś 2 — nadanie keywordu (haste) niewidoczne
`keyword_granted` bez opisu. Gracz widzi, że stwór bota nagle atakuje w turze
wejścia, i nie wie dlaczego (Awaken the Sleeper, Cogwork Assembler, saddled).

### D. Oś 2 — discover bez trafienia niewidoczny
`discover_resolved` z `found: false` nie ma opisu (wariant z trafieniem ma:
„… — discover (rzut za darmo)"). Gracz nie wie, że discover w ogóle się odbył.

### E. Oś 2 — proliferate: nie widać, na co poszedł licznik
`proliferate_target_resolved` bez opisu.

### F. Oś 2 — obrót karty (`object_flipped`) bez śladu w logu

### G. Oś 2 — surowe angielskie nazwy stref w modalu ruchu bota
Transkrypt: `Nieprzyjaciel: Segmented Krotiq — library → hand`,
`Ty: Bomat Bazaar Barge — battlefield → exile`.
`noteBotMove` buduje ten tekst ręcznie z `e.fromZone`/`e.toZone` (angielskie
identyfikatory stref), zamiast polskiego opisu. Cała reszta UI jest po polsku.

### H. Narzędzie (nie bug produkcyjny, ale blokował audyt)
Tester zatrzymywał się na `[STOP]` w oknie z akcją „Epic Experiment: zakończ
(reszta kart do grobu)" — brak wzorca w polityce gracza. Gracz-człowiek po
prostu kliknąłby przycisk. Naprawione: wzorzec `/zakończ|Zakończ/`.

## Zweryfikowane i POPRAWNE (nie zgłaszam)

- **Oś 3 (ptaszki):** cycling, wyposaż, rzuty czarów, permanenty, flashback,
  grupy wariantów — wszystkie mają ptaszek. Brak ptaszka przy „Zagraj ląd"
  i „Dobierz kartę" jest uzasadniony (akcje obowiązkowe/zawsze pożądane).
- **Oś 2:** obrażenia bojowe + zmiana życia SĄ w modalu („Kappa Tech-Wrecker
  zadaje 5 obrażeń (Ty)" + „Ty: życie 15 → 10"); tokeny, wejścia stworów,
  landy, dobrania z efektów, tryby czarów modalnych (M91/D) — obecne.
- **Oś 1:** ataki bota sensowne (brak chump-ataków — M90/E działa), bestow na
  własnego stwora poprawny, brak re-equip loopów (M83).
- Sklejony wskaźnik tury i brak P/T na kaflach w transkrypcie to **artefakty
  jsdom** (CSS `gap`, nakładka `skipLiveState`), nie błędy UI.

## Kolejność prac

1. Plan (ten plik) + fix narzędzia (H).
2. Opisy zdarzeń (B–F) — `describeGameEvent`, testy RED→GREEN.
3. Polskie nazwy stref w modalu ruchu bota (G).
4. Heurystyka bota — wycena celu dla mill/damage w `activate_ability` (A).
5. `npm test`, `npm run build`, benchmark (bot zmieniany!), ponowny przebieg
   Żywego Testera jako weryfikacja.
6. Dokumentacja + dopisanie do PR #52.

## Definition of Done

- Każde znalezisko A–G ma test RED→GREEN i naprawę u root cause.
- `npm test` ≥1619 + nowe, `npm run build` OK.
- Benchmark bez regresji (progi 0.78/0.57).
- Ponowny audyt testerem potwierdza naprawy na żywym stole.

## Podsumowanie wykonania

**17 partii na 11 taliach** (azorius, black, graveyard, green, innistrad,
mechanicy, ostrza, red, sojusznicy, spellslinger, tokens, wiedzmin).

### Naprawione (5 znalezisk + fix narzędzia)

| # | Oś | Co widział gracz | Naprawa |
|---|----|------------------|---------|
| 1 | 1 | `Cellar Door → cel: Nieprzyjaciel` ×7 — bot mielił WŁASNĄ bibliotekę | scoring `activate_ability` wycenia cel-gracza dla mill/damage/lose_life |
| 2 | 1 | `aktywuje: Shiv's Embrace` ×10 w Głównej 1 — firebreathing przed atakiem, efekt wygasa | `pump_enchanted_creature` wpada do wyceny pump + kara za pompowanie poza combatem |
| 3 | 2 | brak śladu nadania POŚPIECHU — stwór bota nagle atakuje | `keyword_granted` ma opis; znacznik `viaBackup` wycisza tylko dublet backupu |
| 4 | 2 | `proliferate_resolved` — surowy identyfikator zdarzenia w logu | gałąź zwraca `null` (treść niesie `proliferated`) |
| 5 | 2 | `Segmented Krotiq — library → hand` — angielskie strefy | `ZONE_LABELS`/`zoneLabel` w `session.js` (render.js importuje stamtąd → brak cyklu) |
| H | — | `[STOP]` na „Epic Experiment: zakończ" — audyt się zatrzymywał | wzorzec `/zakończ/` w polityce gracza |

### Weryfikacja na żywym stole (po naprawach)

Ponowny przebieg `mechanicy vs graveyard --seed 909`:
- mielenie własnej biblioteki: **7 → 0** (teraz 11× celuje w gracza),
- surowe nazwy stref: **kilka → 0** („biblioteka → ręka", „pole bitwy → ręka").

### Odrzucone jako fałszywe alarmy (metodyka: sprawdzić, czy treść niesie inne zdarzenie)

- poświęcenie przez exploit — opisuje je `exploited`;
- discover bez trafienia — `discover_started`;
- obrót karty — `turned_face_up` / `object_transformed`;
- „token Soldier (1/1)" vs kafel `Soldier · 0` — `0` to koszt many, nie moc;
- sklejony wskaźnik tury, brak P/T na kaflach — **artefakty jsdom** (CSS `gap`,
  nakładka `skipLiveState`), nie błędy UI;
- brak ptaszka przy „Zagraj ląd" i „Dobierz kartę" — akcje obowiązkowe.

### Oś 3 — wynik: bez zastrzeżeń

Test mechaniczny panelu akcji: ptaszek wyciszenia mają cycling, wyposaż, rzuty
czarów, permanenty, flashback i grupy wariantów. Brak przy akcjach
obowiązkowych jest poprawny.

### Weryfikacja końcowa

`npm test` **1634/0** (1619 → 1634, +15), `npm run build` 50 modułów /
**1646.0 kB**, `bot-benchmark` 7/0, benchmark 6 seedów: heuristic
**95.2% vs random**, **66.6% vs aggro** — bez regresji.

### Wnioski metodyczne (dopisane do dokumentacji testera)

- Zanim zgłosisz „brak informacji", sprawdź, czy sąsiednie zdarzenie jej nie
  niesie — inaczej dublujesz wpisy w logu (3 z 8 podejrzeń odpadły).
- Test mechaniczny „przelej `EVENT_TYPES` przez `describeGameEvent`" wykrywa
  luki szybciej niż czytanie transkryptów.
- `[STOP]` testera to zwykle luka narzędzia — naprawiaj tester (lekcja L12).
