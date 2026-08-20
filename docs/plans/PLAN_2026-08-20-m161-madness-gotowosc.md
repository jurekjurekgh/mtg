# PLAN M161 — gotowość madness na czary (sesja 2026-08-20, PR #68)

## Kontekst

Zasada właściciela (2026-08-20, decyzja po audycie PR #66): **nie zostawiamy
nieobsłużonych sytuacji zależnych od przyszłych kart — przygotowujemy kod
mechaniki na ich nadejście; ścieżka martwa dziś (bo nie występuje karta, która
ją obsługuje) musi być zasygnalizowana, żeby w przyszłości o niej nie
zapomnieć.** Zlecenie dotyczy dwóch obserwacji z audytu PR #66 (podjętych w
raporcie `docs/audits/AUDYT_PR67_2026-08-20.md` jako O1/O2):

- **O1** — `resolve_madness_cast` woła bezwarunkowo `castPermanent`.
  Pierwsza karta instant/sorcery z madness (w katalogu jest dziś wyłącznie
  permanent — Revolutionist) dostanie reject „nie jest zagrywalnym
  permanentem". Potrzebny routing po `kind` do ścieżki czarów.
- **O2** — bramka kolorów dla rzutu za koszt madness sprawdza pipy KARTY
  (`hasColorManaForObject` → `coloredPipsOf(cardId)`) zamiast kolorów kosztu
  madness (`madness.colors`); lustrzany błąd w `canPayMadnessCost`. Dla
  Revolutionista wynik identyczny ({5}{R} vs {3}{R} — jeden pip R). Ta sama
  klasa latentna: `warpCast` w `castPermanent` (Weftblade {5}{W} vs {2}{W}).

Zgodność z ADR: **ADR 0001 nie zostaje złamany** — nie dodajemy żadnej karty
do katalogu (karty tylko z listy właściciela); uzupełniamy GENERYCZNOŚĆ
istniejącej mechaniki (ADR 0002) i sygnalizujemy martwą ścieżkę testami
+ strażnikiem katalogu. Nowe ADR niepotrzebne — decyzja mieści się w
ADR 0001 („mechaniki projektowane jako elementy wielokrotnego użytku").
Reguła trwała idzie do `docs/LESSONS.md`.

## Etapy

- [x] **0. Lektura obowiązkowa** (AGENTS.md §0; ADR-y 0001–0022; LESSONS;
  ENVIRONMENT; PROJECT_STATE; handoff M159) + baseline `npm test`
  2496/2496 (fast), build 51 modułów / 2130.5 kB.
- [x] **1. PR na starcie** (ADR 0020 A): gałąź wypchnięta, PR #68 otwarty
  po pierwszym commicie (audyt).
- [x] **2. Audyt PR #67** (ADR 0020 B / 0016): raport
  `docs/audits/AUDYT_PR67_2026-08-20.md` — commit 9c763cd. Znalezisko D1
  (brak sekcji M160 w PROJECT_STATE — backfill w etapie 4); obserwacje
  O1/O2 = temat zadania.
- [ ] **3. Implementacja gotowości madness (RED→GREEN,
  `test/m161-madness-spell-path.test.js`)** — jeden samodzielnie zielony
  commit:
  - **3a. Routing po kind:** w `resolve_madness_cast` gałąź
    `kind === 'spell'` → nowa funkcja `castMadnessSpell` (spells.js):
    walidacja celów/trybów (wzorzec suspend/rebound; variableTargets /
    xCost / fireball / additionalCost poza zakresem — jawny throw, nie
    ciche obejście), płatność kosztu madness z redukcjami generycznymi
    (lustro castPermanent), spendMana z pipami `madness.colors`, stos,
    `spell_cast` z `madness: true` i `manaSpent`. Timing ignorowany
    (CR 702.34e — jak F1).
  - **3b. Oferta per cele dla czarów:** playerView — dla `kind === 'spell'`
    oferta `cast:true` enumerowana przez `epicCastOffers` (jak suspend/epic);
    `commandOptionKey` rozróżnia warianty już dziś (`targets`/`modeIndex`).
    Bez legalnych celów → tylko rezygnacja (CR 601.2c).
  - **3c. Bramka kolorów kosztu alternatywnego (O2):** w `castPermanent`
    przy `madnessCast`/`warpCast` pre-bramka kolorów sprawdza pipy
    AKTYWNEGO kosztu (`madness.colors`/`warp.colors`), nie pipy karty;
    `canPayMadnessCost` traci zbędną bramkę pipów karty (zostaje
    `madness.colors` — spójnie z walidacją).
  - **3d. Sygnał „nie zapomnij":** testy na obiektach syntetycznych
    (instant/sorcery z madness — także o kolorach INNYCH niż koszt karty,
    O2) + **strażnik katalogu**: żaden `supported` instant/sorcery nie ma
    dziś madness — pierwszy taki wpis w katalogu czerwieni test z komentarzem
    „ścieżka istnieje, dopisz testy kartowe".
  - Kryteria: RED przed implementacją (potwierdzone na sztywno), potem
    `npm test` + `npm run build` zielone.
- [ ] **4. Domknięcie dokumentacji:** backfill M160 do PROJECT_STATE (D1),
  sekcja M161, reguła trwała w `docs/LESSONS.md` (L50), handoff sesji,
  opis PR #68 kumulatywnie. Osobny commit (dokumentacja po ostatnim
  funkcjonalnym — ADR 0020 C).
- [ ] **5. Zamknięcie sesji:** blok przekazania w czacie (ADR 0013 §2).

## Planowane commity

1. `9c763cd` — audyt PR #67 (raport).
2. Ten plan (przed kodowaniem).
3. 3a–3d w jednym zielonym commicie (testy + implementacja; RED zweryfikowany
   lokalnie przed implementacją).
4. Dokumentacja (PROJECT_STATE backfill M160 + M161, LESSONS L50, handoff).

## Ryzyka / pułapki

- **Oferta ≠ walidacja (L48):** każda oferowana komenda
  `resolve_madness_cast { cast:true, targets }` musi przechodzić przez
  execute — strażnik w stylu F2c w testach.
- **Nie rozszerzamy zachowania dla dzisiejszego katalogu:** Revolutionist
  (permanent) ma przejść ścieżką castPermanent bez zmian; warianty kolorów
  O2 testowane wyłącznie na obiektach syntetycznych.
- **Chirurgicznie (ADR 0016):** nie przepisujemy castPermanent/castSpell;
  nowa funkcja czarowa madness korzysta z istniejących helperów
  (validateTargets, spendMana, redukcje) na wzór handlerów suspend/rebound.
- **Nie dodajemy kart do katalogu** (ADR 0001/0022) — sygnał to test
  strażnikowy, nie spekulatywna karta.
- GH_TOKEN może wygasnąć — push po każdym commicie.
