# Plan sesji 2026-09-05b (arena/01a0712d, ciąg dalszy PR #98): C-R1–C-R7

## Kontekst

- Zlecenie właściciela (czat): „Kontynuuj zgodnie z handoffem, w tym C-R1–C-R7
  (m.in. brak premii ETB w cast_permanent)".
- Źródło rekomendacji: `docs/audits/AUDYT_BATCH53_2026-09-05.md` § „Rekomendacje
  systemowe". To ZMIANY WYCEN bota (heuristic-bot) — świadome, nie refaktor:
  golden-master regenerowany na końcu na GOTOWYM drzewie (L124), benchmark
  szybki jako brama progów (ADR 0018 — pełne B0 tylko na komendę).
- Ta sama sesja/gałąź/PR #98 (1 sesja = 1 PR); każdy C-R osobny zielony commit.

## Etapy (kolejność commitów)

### E1. C-R1 — premia ETB w `cast_permanent` (główna luka)
- Generyczna tabela wartości efektów triggerów `enter_battlefield`
  (skan katalogu: create_token ×14, draw_cards ×5, add_counter ×5, gain_life,
  destroy_permanent, tap_permanent, damage, bounce, anthem, scry, discover,
  search, exile-removal, lock_untap, …) — po deskryptorach (ADR 0002),
  warunkowo (wasKicked/wasOffspring tylko w wariancie; ifCast przy rzucie
  z ręki). Wykluczenia przeciw podwójnemu liczeniu: reanimate (istniejąca
  premia), attach (gałąź equipment), damage_to_controller/lose_life (kary).
- WymagaTarget → wartość tylko gdy przeciwnik ma pasujący cel (przybliżenie
  z widoku, spójne z resztą bota).
- Test RED→GREEN: Acidic Slime / Phyrexian Rager > równe ciało bez ETB;
  mutacja: wyzerowanie tabeli → RED.

### E2. C-R7 — wycena wariantów kicker/offspring (remis → pierwsza oferta)
- `cmd.kicked`: −waga kosztu kickera + wartość ETB bramkowanego wasKicked
  (Kor Sanctifiers: destroy 18 > koszt {W}).
- `cmd.offspring`: −waga kosztu offspring + wartość tokenu
  (create_offspring_token w tabeli z E1, bramkowane wasOffspring).
- Test: bot dopłaca za sensowny kicker/offspring, nie dopłaca gdy bez celu.

### E3. C-R2 — cele triggerów spoza stołu (grób/exile) przestają remisować
- `objectInOpenZones` (battlefield ∪ graveyard ∪ exile — strefy jawne
  w widoku); wartość karty-grzebu po P/T (stwór) lub koszcie (reszta);
  w gałęziach jedno- i wielocelowych `resolve_trigger_target`.
- Test: Ironclad/Mystic-sanctuary-like wybór najlepszego, nie pierwszego.

### E4. C-R3 — wybór ofiary (Glorifier)
- (b) artefakty/nie-stwory wyceniane po manaCost (wzorzec craft_exile),
  cenny artefakt > token 1/1.
- (a) rezygnacja z bezcelowej ofiary: engine anotuje oferty
  `resolve_sacrifice_choice` flagą `reflexReady` (czy refleks ma na kim
  działać — filtr kandydatów jak dla celów triggerów, L48); bot przy
  `!reflexReady` wybiera skip (oferta `skip` już istnieje).
- Testy: pusty stół → skip; artefakt 5-mana poświęcany po tokenie.

### E5. C-R4 — sim ataku: pump „when this becomes blocked"
- Skan `trigger.event === 'becomes_blocked'` → pump doliczany do P/T
  atakującego w wymianie z blokerem (Ichorclaw 1/1→3/3 vs 2/2).
- Test RED→GREEN + mutacja.

### E6. C-R5 — infect jako warunek wygranej w wyścigu
- Trucizna przeciwnika jest w widoku (players.poison); atakujący z infect
  liczy się do prognozy wygranej względem 10 − poison, nie życia.
- Test: bot atakuje na 9 trucizny (wrogie życie wysokie) — dopłata wyścigu.

### E7. C-R6 — plot nigdy nie wygrywa: sonda → decyzja [WYKONANE: PROBE → bez zmiany, patrz AUDYT_BATCH53 §Rekomendacje]
- Najpierw PROBE (L68): czy przy za małej manie na rzut bot w ogóle plotuje
  (55 > pass)? Jeśli tak — luka jest tylko „flat vs rzeczywista wartość";
  poprawić wycenę plotu względem ciała (darmowy rzut później = wartość
  karty, nie stała 55). Jeśli probe wykaże, że bot plotuje poprawnie —
  odnotować w audycie i zakończyć (bez zmiany na siłę).

### E8. Domknięcie
- Benchmark szybki (`node tools/benchmark.mjs`) — progi z
  `test/bot-benchmark.test.js` muszą przeżyć (10/10); ewentualna
  rekalibracja tylko wg reguły ADR 0024.
- Golden-master `--write` na GOTOWYM drzewie (L124).
- `test:all` + build; README liczby; PROJECT_HISTORY; handoff (aktualizacja
  2026-09-05b); opis PR kumulatywnie.

## Ryzyka / pułapki

- Zmiany wycen zmieniają zachowanie bota → golden-master i progi; każda
  zmiana mierzona, żadna „na czuja" (L3: kara/premia musi przebić bazę).
- Podwójne liczenie z istniejącymi gałęziami (reanimate/equipment/aura) —
  tabela ma jawną listę wykluczeń.
- FaW/ADR 0002: tabela po TYPACH efektów, nie po nazwach kart; warunki
  triggerów czytane z deskryptora.
- Czas: benchmark ~2–4 min na przebieg — odpalać po E2, E4 i na końcu,
  nie po każdej linijce.

## Podsumowanie wykonania (uzupełnić na końcu)

- (uzupełnić)
