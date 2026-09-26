# PLAN PMSSB-7: domknięcie hold (jałowość + samouszkodzenia)

Data: 2026-09-26. Sesja: wybór agenta z forwardów PMSSB-6 (BACKLOG pusty —
zweryfikowano `grep BACKLOG docs/PMSSB.md`).

## 0. Cel i zakres (krok-0)

**Teza:** rodzina PMSSB-6 (discard/rip + hold) jest domknięta na wrogiej
stronie wroga (foe-side), ale zostały DWA forwardy:
1. `divest`-self = **+3 (ODPALA samouszkodzenie!)** — dziura hold w
   `selfHarmPenalty` (47 < baza 50). Jedyny taki przypadek w macierzy
   self-harm (mindstab −1, bat −40/−9, skull −157, nightsnare/dreams
   brak oferty, shock-face −58, scour-self −65 — wszystko trzyma).
2. Token-leg `-25` (bot ~6038) — **podejrzenie martwego kodu**:
   `allEffectsInertNow` (~5444, −70) łapie wcześniej `create_token`
   z count 0 (flurry/howl = −70 ZMIERZONE). Ścieżka (b) (count>0 ale
   token bezwartościowy) nie ma nosicieli (skan 0/0-tokenów czysty).

**Zakres:** sweep domknięcia hold = wszystkie przypadki
`effectIsInertNow` × ich puste scenariusze (kontekst cast; ability
tylko emrgencyjnie) + macierz self-harm (3 brakujące sondy:
lose_life-self, poison-self, bounce-own-perm) + decyzja o martwym −25.
Poza zakresem: nowe mechanizmy wyceny, kontekst ability (osobna pętla),
karty spoza katalogu.

**Precedens penality:** `allEffectsInertNow` → −70 (M190/B, K06).
NIE cytować „M120" (błędna etykieta z notatek PMSSB-6 — chodziło
o rodzinę odmowy M190/B).

## 1. Hipotezy (krok-1)

- **H1 (divest-self):** podbicie mapy `HOSTILE_PLAYER_EFFECTS`
  (45 → 53, tylko wpisy rip: 4 typy) przewraca +3 na ujemne,
  reszta trzyma mocniej, golden bez zmian (bot nigdy +3 nie wybierał —
  zdominowane przez wariant wrogi 50+). 5 miejsc wołania
  (`selfHarmPenalty`: cast 5698, ability 6765, modal 4787, retarget
  5020, wrapper 3804) — wszystkie w kierunku „trzymaj mocniej" (SAFE).
  Alternatywa (mechanizm): brak bazy-50 dla czysto-samouzkodzeniowych
  rzutów — odrzucona w krok-0 jako za szeroka (detektor „brak zysków"
  nie istnieje; do forwardów jako pomysł mechanizmowy).
- **H2 (martwy −25):** linia token-(`tokenValue===0`) jest nieosiągalna:
  (a) count-0 łapie −70 wcześniej (flurry/howl −70 ZMIERZONE);
  (b) count>0-bezwartościowy nie ma nosicieli. Decyzja: USUNĄĆ linię
  + przypiąć −70 dla howl-noland (flurry ma już pina: bug-hunt-2026-08-16
  audyt-stołu w.234 — referencja, nie duplikat).
- **H3 (sweep):** pozostałe ~14 przypadków inert trzyma (−70/ujemne);
  każda dziura znaleziona w sweepie = finding albo forward (audyt
  rozstrzyga: scope-gate jak w PMSSB-6).

## 2. Macierz sond (krok-2, `tools/pmssb7-hold-sonda.mjs`)

Inert × pusty scenariusz (oczekiwane: −70 lub ujemne):
S01 flurry-main-bez-ataku (−70), S02 howl-bez-ziemi-subtypu (−70),
S03 buff-mine-bez-stworów, S04 protection-bez-stworów,
S05 damage-keyword-bez-celu, S06 scry-przy-pustej-bibliotece,
S07 reanimate-bez-stworów-wroga-w-grobie, S08 apply_to_each-bez-celów
(min:0), S09 mill-amount-0 (jeśli nosiciel istnieje), S10 X=0
(Fireball-X0 — legalność? jeśli nielegalne: SKIP z dokumentacją),
S11 add_counter-0 (nosiciel?), S12 put-multicolored-bez-celu,
S13 buff-lands-bez-land-creature, S14 buff-foe-bez-stworów-wroga.
Self-harm (oczekiwane: ujemne): S15 lose_life-self, S16 poison-self
(nosiciel?), S17 bounce-own-permanent, S18 divest-self (+3 PRZED,
ujemne PO — sonda regresyjna).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A (kandydat): F-H1 (mapa 45→53) + F-H2 (usuń martwy −25)
  + piny S01/S02/S18 + piny sweepu (tylko znalezione dziury +
  howl). Zero gałek (kalibracja mapy z uzasadnieniem 10×-rule).
- Ryzyka: (a) golden-churn przez flip divest-self (oczekiwany BRAK —
  weryfikacja testem; jeśli churn: wyjaśnienie per-flip);
  (b) scope-creep ability (gate: tylko emergentne);
  (c) nosiciele S09/S11/S16 nie istnieją → SKIP z dokumentacją
  (nie blokuje fali).

## Aneks A — ślady krok-0 (dowody wyboru celu)

- BACKLOG pusty (grep, 2026-09-26).
- Macierz self-harm (sondy ad-hoc, bot seed 9): divest-self +3 (DZIURA);
  mindstab-self −1; bat-self −40; skull-self −157; shock→p1 −58;
  scour→p1 −65; nightsnare/dreams-self brak oferty (opponent-only).
- Token-0: flurry-main −70.0, howl-noland −70.0 (decyduje −70, nie −25).
- Skan 0/0-tokenów w katalogu: czysto (zero nosicieli ścieżki (b)).
- `selfHarmPenalty`: 5 wołań (3804/4787/5020/5698/6765); mapa
  `HOSTILE_PLAYER_EFFECTS` ~3446 (mill 25, rip 45×4, life 35,
  damage 40, poison 45). Wpływ podbicia rip: tylko wyniki self-rip
  (kontrola klątw 3826 czyta obecność, nie wartość).
- Flurry-pin istnieje (bug-hunt-2026-08-16-audyt-stolu.test.js:234);
  howl-pin behawioralnego BRAK (tylko art/audit-wzmianki).

## Aneks A2 — wyniki sondy (krok-2/3, audyt WŁASNY)

S01 flurry −70 ✓, S02 howl −70 ✓, S03 temple −70/−133 ✓, S04 spare −70 ✓,
S05 volley brak oferty (silnik: brak celów) ✓, S08 wrap −70 ✓,
S10 fireball-X0 trzyma (−10 single / −70 split; split dowodzi że
przypadek X-0 w `effectIsInertNow` jest ŻYWY) ✓,
S14 blindness −70 ✓, S17b force-away-own −114 ✓,
S18 divest+2friends **+3.0 → p1** (DZIURA potwierdzona; samotny
divest = −70 przez F-A2 — kształt dziury wymaga kart w ręce).
SKIP-y zgodnie z planem (brak nosicieli / NET mieszany / ability-only).

Audyt: H1 GO (mapa 45→53; predykcja divest-self −5, mindstab-self −7),
H2 GO (usunięcie martwego −25; zero zmian behawioralnych),
H3 GO (sweep czysty, brak nowych dziur).
Scope-gate: forwardy (martwe przypadki inert bez nosicieli:
buff_land/add_counter-0/mill-0; mechanizm-single-X0-−10;
pomysł „no-base-for-pure-harm") — POZA Wave-A.

## Aneks B — forwardy z tej pętli (WYPEŁNIĆ w closeout)

(none yet)
