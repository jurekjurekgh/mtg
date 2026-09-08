# Plan — znaleziska testera A–E (2026-09-09)

Gałąź `arena/01a08274-mtg` (sesja przypięta do gałęzi; PR #107 rozszerzony
o fixy — adnotacja w opisie). Kolejność: A, E (etykiety) → B, C (bot) →
D (silnik + fallout) → brama → docs. Każde: RED → fix → GREEN → mutacja →
commit + push. Bez nowych kart (ADR 0029), bez pełnego B0 (ADR 0018).

- [ ] **A: dwie identyczne oferty Flashback.** Root cause: etykieta
  `cast_flashback` nie dokleja celu (`render.js`), a Dream Twist celuje
  (gracz ×2) — dwie RÓŻNE komendy wyglądają tak samo. Ta sama luka w
  `cast_escape` (Sweet Oblivion celuje) i `cast_adventure` (Ettercap
  celuje); `cast_cleave` ma `→ cel:` (wzorzec). Fix: dokleić cel w trzech
  etykietach + testy etykiet (dwie oferty różnią się tekstem).
- [ ] **E: tytuł grupy kosztu wygnania.** `Wygnaj stwora z grobu (koszt) —
  Makeshift Mauler` czyta się jak efekt, nie rzut (uwaga C była o
  pokryciu klucza — zostaje). Fix: `Rzuć: NAME — wygnaj stwora ZONE
  (koszt)` (klucz i warunek bez zmian, L102/1) + aktualizacja pinu m347.
- [ ] **B: bot nie dobija -1/-1.** `resolve_trigger_target` wrogi = ślepy
  `30+wartość` (największy pierwszy; sonda: big 47 vs small 35). Fix:
  `triggerTargetDebuffOf(ability)` w `effect-intent.js` (jedno źródło,
  po typie efektu — ADR 0002) → adnotacja komendy → bot premiuje zabójstwo
  (704.5f: toughness+delta ≤ 0 lub lethal z obrażeniami; działa przez
  indestructible/regen, bo to nie destroy) u wroga / karze u siebie;
  fallback bez zabójstwa bez zmian (największy). Testy: Prowler dobija
  2/1 przy 6/5; bez X/1 bierze dużą; własnej nie zabija (decline).
- [ ] **C: bot dobiera w deck-out.** `drawDeckingPenalty` veto tylko przy
  remaining ≤ 0 — i to za słabe na czary: 50+18−58=+10 > pass (sonda:
  biblioteka 3 → cast +10!). Fix: remaining ≤ 0 → −(120+6a) (magnituda
  M162/B „samobójstwo”); NOWA strefa krytyczna 1–3 → −(60+6a) (przebija
  spellBase 50 + wartość dobrań; właściciel: 6→3 nierozsądne). Obie
  ścieżki (czar + zdolność) przez wspólny helper. Testy: Reunion przy
  6 i 3 nie grany (pass wygrywa); przy 20 grany; Denizen pin bez zmian.
  Poza zakresem (follow-up): koszt discard-2 bez wyceny.
- [ ] **D: brak okna po deklaracji atakujących (CR 508.2).** Silnik po
  `declare_attackers` skacze OD RAZU do bloków — obrońca nie ma okna
  „gdy Bot mnie zaatakuje” (sonda: declare_attackers → declare_blockers
  jedną komendą; gadżet: z triggerami ataku okno istnieje de facto przez
  wymóg pustego stosu). Dowiedzione na silniku; pozostałe okna (main1,
  beginning, damage) silnik oferuje — tam auto-pass zależał od many/muta.
  Fix (precedens M172/C): deklaracja ZOSTAJE w kroku, priorytet → aktywny
  (CR 508.2); oferta deklaracji tylko przy `!state.combat` (+ reject
  re-deklaracji); czyszczenie `state.combat` przy skipie obrażeń bez
  atakujących (inaczej następny combat bez oferty). Testy: RED — po
  deklaracji krok + priorytet aktywnego; pass,pass → bloki; Bell Ringer
  rzucalny w oknie (scenariusz właściciela); pusta deklaracja i M257
  auto-skip bez zmian. Fallout: pliki jadące declare→bloki bez passów
  (do ~99) — naprawa mechaniczna + pełny pakiet na końcu.
- [ ] **Brama:** `test:all`, `build`, quick (oczek. bez zmian), Żywy Tester
  (re-run seedów P4 + gra z atakiem: okno 508.2 na żywo), liczby README,
  handoff, HISTORIA, opis PR #107.

Ryzyka: D tyka każdą walkę — pełny pakiet OBOWIĄZKOWY po nim; C może
przewrócić testy bota z niezapełnioną biblioteką (naprawa: dopełnić
biblioteki w setupie, nie obchodzić guarda). Pułapki sesji: edity tego
samego pliku sekwencyjnie; `gh pr edit` psuje GraphQL-warning → REST API.
