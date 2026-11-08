# HANDOFF 2026-11-06 — audyt scalonego PR #180 (werdykt pozytywny) + pętla jakości (PR #181)

## Stan

- Gałąź `arena/b2771170-mtg`, PR #181 (otwarty, niewysyłany do scalenia).
  Audytowany: **PR #180** — scalony 2026-11-06T18:30:47Z, 17 plików, +591/−65;
  baza sesji `d2e0d61` (= HEAD `main` po merge'u).
- Kolejność zgodna z ADR 0020 (audyt poprzedniego scalonego PR przed nową pracą).
  Zakres = przegląd diffu #180 + celowana pętla jakości Żywym Testerem; bez
  nowych kart (ADR 0029), bez pełnego B0 (ADR 0018), bez scalania.
- Plan `docs/plans/PLAN_2026-11-06-audyt-pr180.md` — **Etapy 1–5 domknięte**.
  Raport: `docs/audits/AUDYT_PR180_2026-11-06.md` (§1–8), mapa 17/17 wierszy.

## Werdykt audytu #180: POZYTYWNY

- **A-1 poprawne** (skan „whenever you attack" raz na deklarację, CR 508.3d):
  niezależne mutacje audytu każdą z osobna łapią jako RED, przywrócenie treści
  #180 przywraca GREEN — naprawa jest u root cause i pilnowana pinami.
- **A-2 = tylko komentarze** (dowód maszynowy: diff produkcji bez zmian
  zachowania).
- 2D–2G pozytywne (dokumenty spójne z drzewem, bramy #180 zgodne z raportem,
  regresja bota na próbce 10/10, commit hygiene OK).
- Obserwacje z handoffu #180 rozstrzygnięte: Powerstone — fałszywy alarm,
  poprawka wyłącznie w notach katalogowych (`dc37ecf`); odcisk stanu
  (pendingDamageDivision) bez mocy dyskryminacyjnej — świadome;
  `commandForXSelection` — świadoma architektura „konstruuj + waliduj".
- Mirror CR (`nwgarne/mtg-data`) ma wydanie „effective as of November 6, 2026"
  (pin repo: 2026-09-25). Cytaty audytu (508.3d, 601.2i, 602.2a/b, 603.3, 117.5)
  pobrane z nowszego wydania i zacytowane dosłownie w raporcie. **Bump pinu
  pozostał decyzją właściciela (ADR 0030) — niewykonany.**

## Naprawy wykonane w sesji (osobne zielone commity)

1. `dc37ecf` — noty Powerstone: spójność opisu tokenu z Oracle (dokumentacja
   katalogowa, bez zmian kodu silnika).
2. `8b3cbc0` — HELP `tools/table-tester/run-game.mjs` ogłaszał nieistniejącą
   domyślną talię bota (stale po przemianowaniu talii batcha 72). Fix: HELP
   interpoluje domyślne z `parseArgs([])` — jedno źródło prawdy; pin M203/8
   czyta WYJŚCIE `--help` (behawioralny, odporny na przyszłe rozjazdy).
3. `22230e5` — **kolejność stosu w kreatorze many przy komendach
   natychmiastowych (F-CYK)**: trigger z tapnięcia źródła w trakcie płatności
   (Chronic Flooding) rozstrzygał się PO opłacanej komendzie (cycling dociągał
   kartę PRZED mieleniem) — wbrew CR 602.2a+b, 603.3 + 117.5. Root cause:
   `finishWizardPayment` drenował stos tylko, gdy komenda była NIELEGALNA przy
   niepustym stosie (czyli dla sorcery-speed). Fix: drenaż wpisów NAŁOŻONYCH
   W TRAKCIE płatności (`stackAtOpen` łapany przy otwarciu kreatora — oba
   `openManaWizard`/`openNestedManaWizard` w `main.js`) przed commitem,
   niezależnie od prędkości komendy; wpisy istniejące PRZED otwarciem (odpowiedź
   na cudzy czar) zostają POD komendą, jak w CR. Piny:
   `test/audyt-pr180-cf-cycling-kolejnosc-stosu.test.js` (RED→GREEN + kontrola
   bez aury); 6 pinów PR #171 F-1 nietkniętych; sandbox testu PR #177 deklaruje
   `session` (dopasowanie pinu do refaktoru w tym samym commicie, L160).
   Weryfikacja na artefakcie: re-run tej samej partii (seed 4242) — drenaż
   PRZED „Aktywujesz cycling", „Dobierasz: Mountain" (mielenie wzięło wierzch
   zgodnie z rekonstrukcją biblioteki), Tarmogoyf 6/7 i wynik partii bez zmian.

## Pętla jakości 4B (partia: dominaria-brg | ravnica-wur, seed 4242)

- Wygrywa Gracz w 14. turach (krok 75/76 z limitu 300), bot na −5 ż., rc=0,
  detektory 0 zgłoszeń, 0 × [STOP], ruchy bota niewycenione: 0.
- Bot (greedy): sensowne akcje — spot-check Piercing Rays (exile tapniętego
  stwora), Withstand (tarcza wyczerpana dokładnie + dociągnięcie), Summary
  Judgment (Addendum 5 obr. we własnej głównej). Mulligan londyński poprawny.
- Tarmogoyf tokenu Disy 6/7 — dowód rekonstrukcyjny: deterministyczne
  odtworzenie biblioteki (`shuffle(parseDeckText(...).cardIds, seed+0)`,
  HUMAN pierwszy w Mapie) zgadza się z transkryptem na 34/34 pozycjach zużycia;
  6. typ kart (Enchantment) przyszedł z ukrytego w transkrypcie mielenia E.

## Bramy (drzewo końcowe sesji)

- `npm test`: **10 068 pass / 0 fail / 0 skip** (baza `d2e0d61`: 10 065).
- `npm run test:all`: **10 336 pass / 0 fail / 0 skip**.
- `npm run build`: **78 modułów / 5 761,4 kB**.
- Strażnik budżetu lektury zielony (~99,996k/100k) — lektury obowiązkowe
  nietknięte; nowa wiedza sesji mieszka w raporcie audytu, pinach i
  komentarzach kodu (LESSONS bez nowego wpisu — brak miejsca w budżecie,
  brak nowej klasy błędu: oba znaleziska to instancje znanych reguł L41/L160
  oraz wzorca F-1).
- Szybki benchmark NIE był uruchamiany (brak zmian bota/wyceny; ADR 0018).

## Granice i co NIE jest dowiedzione

- Audyt = przegląd diffu #180 z mutacjami i kotwicami CR + JEDNA pełna partia
  Żywego Testera (i jej re-run). Nie dowodzi poprawności całego katalogu kart
  ani wszystkich interakcji kreatora many z triggerami — pin F-CYK pokrywa
  ścieżkę tap_for_mana→trigger→cycling; pozostałe kombinacje (np. koszty
  aktywacyjne innych rodzajów, mana abilities z kosztami zdolności) opierają
  się na tej samej gałęzi `finishWizardPayment`.
- „Mielisz …" z triggerów rozstrzyganych W TRAKCIE płatności kreatora nie
  trafia do strumienia modala „Rozgrywka" (a ogon panelu LOG tnie starsze
  wpisy) — warstwa ogłoszeń, nie reguły; stan gry zweryfikowany rekonstrukcją.
  Pozostaje otwarte jako kosmetyka (patrz niżej).

## Otwarte pozycje dla kolejnej sesji

1. **Bump pinu CR do wydania 2026-11-06** — decyzja właściciela (ADR 0030);
   teksty już porównane, 508.3d bajtowo zgodne.
2. **Kosmetyka prezentacji**: ogłaszanie w modalu „Rozgrywka" zdarzeń
   rozstrzyganych podczas płatności kreatora (linie „Mielisz …") — opcjonalna
   poprawka warstwy ogłoszeń, gdyby właściciel chciał pełną czytelność w UI.
3. Po scaleniu #181: zgodnie z ADR 0020 — audyt #181, potem praca produktowa
   wg kolejki właściciela (kolejny batch kolekcji / zgłoszenia z partii).
