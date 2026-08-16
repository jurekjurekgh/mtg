# M102 — audyt rozgrywki z perspektywy gracza (Żywy Tester)

Cel: wcielić się w gracza, rozegrać partie różnymi taliami i zebrać 10
unikalnych usterek widocznych NA STOLE (nie w testach silnika). Każda usterka:
objaw → root cause → test RED→GREEN → naprawa u root cause.

Dodatkowe zlecenie właściciela (2026-08-16):
1. czy gracz może rzucać czary/zdolności w KAŻDEJ legalnej turze/oknie,
2. czy silnik nie przeskakuje nielegalnie faz gracza,
3. czy wszystko, co powinno, pojawia się w panelu Rozgrywka.

## Znaleziska

| # | Objaw | CR | Status |
|---|---|---|---|
| U1 | Priorytet i aktywacje zdolności w kroku ODKRĘCANIA; partia startuje w „Untap" | 502.4 | **naprawione** |
| U2 | Wybór landa do poświęcenia: 4× identyczna opcja „Springbloom Druid (poświęcenie landa)" | 601.2 UX | w toku |
| U3 | Szukanie w bibliotece: 17-31× identyczne „Szukanie: Forest" | UX | w toku |

## U1 — brak priorytetu w untap (CR 502.4)

Objaw (transkrypt `/tmp/g1.txt`, krok 54): wskaźnik „T. 15 Ty … Untap",
a panel akcji wystawia „Aktywuj: Moonscarred Werewolf (koszt T) — dodaj manę"
i „Channel: Greater Tanuki". Kliknięcie realnie tapuje stwora o manę
W KROKU ODKRĘCANIA. Profil greedy Żywego Testera: 5 takich aktywacji/partię.

CR 502.4: „No player receives priority during the untap step, so no spells can
be cast or resolve and no abilities can be activated or resolve."

Root cause: pełna runda passów woła `nextTurnStep`, które przy zawinięciu tury
zatrzymuje automat na `TURN_STEPS[0]` = untap i ustawia `priorityPlayerId`.
Krok dobierania miał już akcję turową (M101/A), untap nie miał odpowiednika.
Druga ścieżka: po mulliganach partia również startowała w untapie.

Naprawa:
- `untapStepTurnBasedAction(state)` w `src/engine/game-state.js` — po akcjach
  turowych untapu (beginTurn) przewija do upkeepu (CR 503.1); wołane w
  `pass_priority` (zawinięcie tury) i po keepie obu graczy (start partii);
- twarda bramka w `legalActivatedAbilities` (`abilities.js`): w `step==='untap'`
  zero ofert — obrona w głąb, gdyby jakaś ścieżka ustawiła stan na untapie.

Test: `test/brak-priorytetu-w-untap.test.js` (3 przypadki, RED→GREEN).

Skutki uboczne (naprawione, nie obejścia): 4 testy kodowały stary stan —
`mainPhase`/`board()` ustawiały fazę zostawiając `step:'untap'` (użyto
`jumpToStep`), a `full-turn`/`mulligan` asertowały start w untapie.

## Weryfikacja zlecenia właściciela (skrypty w `/tmp/audyt/`)

- `okna.mjs` — mapa okien priorytetu: po naprawie aktywny i nieaktywny gracz
  dostają priorytet w KAŻDYM kroku poza untapem (zgodnie z CR 502.4).
- `instant.mjs` — oferta rzutu instanta w każdym oknie: TAK we wszystkich
  oknach obu tur; jedyny wyjątek to cleanup własnej tury przy ręce >7,
  gdzie blokuje wybór odrzucenia (CR 514.1) — zachowanie poprawne.
- `eventy.mjs` — panel Rozgrywka: 164 typy zdarzeń silnika, 0 bez opisu
  (żaden surowy identyfikator nie wycieka do gracza).
