# PLAN 2026-10-13b — audyt PR #163 i dalsza pętla jakości

Zlecenie właściciela: „Kontynuujemy projekt.” Zgodnie z ADR 0020 i ADR 0021 sesja
najpierw otwiera PR z planem, wykonuje pełny audyt ostatniego scalonego PR **#163**
(`dab1488..9ba2fde`), naprawia każde znalezisko osobnym przyrostem, a po zamknięciu
audytu sprawdza niedokończone plany na `main` lub przechodzi do celowanej pętli
jakości.

Gałąź sesji: `arena/e114bf10-mtg`; jeden PR tej sesji do `main`.

## Stan wejściowy

- `main` / `HEAD`: `9ba2fde21b4c5bc03a1c6c6f2d76061a830d27b0` — squash PR #163;
  baza audytowanego diffu: `dab148854228a6b9dfabd90beb9715a83d9893f6` (PR #162).
- Zakres PR #163: **94 pliki, +8255/−504** (51 commitów wewnętrznych w 4 obszarach):
  1. audyt PR #162 i naprawy F-1–F-15 (Zombie Boa delayed trigger i kolor,
     Ambulatory Edifice refleks LKI i płatność bota, dedup hybrydowego celu Blitza,
     kumulacja restrykcji blokowania w `PlayerView`);
  2. uwagi z gry A–G (A: Withstand, B: Skilled Animator, C/C2: Mana + Delve
     w jednym Mana Wizardzie, D: garda przed Krotiqem, E: Angelic Benediction /
     `attacks_alone` w bocie, F: kolejność spodu po Impulse, G: ofiary pod czary
     wyłącznie 1/1);
  3. Batch 66 — kolekcja 351–368, 10 kart + `token_citizen` (M443): Sporecap Spider,
     Warden of Geometries, Cazur, Ruthless Stalker, Lorescale Coatl, Foul Orchard,
     Noble Vestige, Wild Celebrants, Naturalize, Rakish Revelers, Scythe Tiger;
  4. PMSSB-61 — wycena bota dla Batcha 66 w 6 falach oraz domknięcie audytu
     remisów (`resolve_sacrifice_choice` i relacyjny tie-break S11 w `cast_spell`).
- Baseline bieżącego `main`: `npm test` **8123/8123**, `npm run build` **74 moduły /
  5102,4 kB**.
- Najnowszy handoff `HANDOFF_2026-10-12c.md` opisuje stan po uwadze G (przed
  Batchem 66 i PMSSB-61); pełny stan końca PR #163 odtwarzamy z net-diffu
  `dab1488..9ba2fde`, planów Batcha 66 / PMSSB-61, raportu `PMSSB61_BATCH66_2026-10-13.md`
  oraz kodu.
- Bez pełnego B0: właściciel nie zlecił pełnej macierzy w tej sesji (ADR 0018/0025).

## Etapy i kryteria ukończenia

### A. Plan i PR sesji (ADR 0020 A)

- [ ] Zapisać ten plan w `docs/plans/PLAN_2026-10-13b-audyt-pr163-i-petla-jakosci.md`.
- [ ] Potwierdzić zielony `npm test` i `npm run build` (cicho do `.arena/`).
- [ ] Zacommitować plan, wypchnąć gałąź `arena/e114bf10-mtg` i otworzyć PR do `main`
      przed jakimkolwiek kodowaniem.

**Commit 1:** `docs(plan): roadmapa audytu PR #163 i pętli jakości`.

### B. Audyt pełnego diffu PR #163 (ADR 0020 B / ADR 0016)

- [ ] Przejrzeć **każdy z 94 zmienionych plików** `dab1488..9ba2fde` i ująć go
      w tabeli rejestru raportu `docs/audits/AUDYT_PR163_2026-10-13.md`:
  1. dokumentacja, plany, handoffy, raporty audytów i zgodność deklarowanych liczb;
  2. snapshoty 10 kart Batcha 66, `collection-art-ids.csv`, definicje w `card-data.js`,
     `mana-costs-data.js`, token `Citizen`, wygenerowane talie `decks/*.txt` i `README.md`;
  3. zmiany w engine (`abilities.js`, `effect-intent.js`, `effects.js`,
     `game-state.js`, `linked-exile-cast.js`, `mana-sources.js`, `objects.js`,
     `permanents.js`, `resources.js`, `spells.js`, `triggers.js`);
  4. zmiany w UI i sesji (`choice-request.js`, `main.js`, `mana-wizard.js`,
     `render.js`, `session.js`);
  5. zmiany w kontrolerze bota (`heuristic-bot.js`, `heuristic-params.js`) z uwag
     A, B, D, E, G, audytu PR #162 (F-1/F-2) oraz PMSSB-61 (fale A–F + tie-break);
  6. wszystkie nowe i zmodyfikowane pliki testowe i sondy (`test/*.test.js`,
     `tools/pmssb61-batch66-sonda.mjs`).
- [ ] Zweryfikować Oracle text i rulingi 10 kart Batcha 66 wobec snapshotów Scryfall
      oraz niezależnego źródła w repozytorium/GitHubie (ADR 0010, 0022, 0028, 0029, 0030).
- [ ] Zweryfikować dosłowne cytaty CR dla zmian regułowych wobec aktualnego tekstu CR
      (ADR 0030), w szczególności: CR 113.6m, 113.7a, 121.1/121.2/121.5, 400.7, 601.3,
      603.5, 603.7, 608.2b/d/h, 611.2a, 615.1/615.6, 701.21a, 701.23/701.24, 702.18a,
      702.66a (Delve), 702.83a (Exalted), 702.124j (Partner with).
- [ ] Odtworzyć i zbadać produkcyjnymi ścieżkami (`playerView` + `execute` + stos/SBA)
      potencjalne punkty brzegowe nowych mechanik:
  - `linked-exile-cast.js` i `fromHand` / `exileSelfFromHand` / `until_source_cast_from_exile`
    (Rakish Revelers): FoW, odcisk `fingerprint`, `PlayerView`, kopiowanie/zmiana strefy,
    wieloetapowa płatność many z grantowanego landu, kontrowanie/odrzucenie rzutu;
  - `sacrifice_source_unless_sacrifice` (Scythe Tiger): interakcja z `pendingSpell` /
    kolejką innych decyzji `pending*`, `firstPendingDecisionPlayerId`, walidacja,
    brak landów vs 1+ landów, LKI/opuszczenie pola przed rozstrzygnięciem triggera;
  - `you_draw_card` (Lorescale Coatl) i `any_combat_damage_to_player` z `damageSourceId`
    (Cazur): grupowanie triggerów, zmiana kontroli, śmierć źródła obrażeń w walce;
  - `search_library_to_hand` z `playerFromTriggerTarget` (Cazur): wybór przeciwnika
    jako celu, FoW ujawnianej karty, brak karty w bibliotece, tasowanie;
  - Mana Wizard + Delve (uwaga C) i Impulse `pick-one-rest-bottom` (uwaga F):
    integracja z Żywym Testerem (`tools/table-tester/run-game.mjs`), sondami no-op i botem;
  - bramka `botMayPayCreatureSacrificeCost` (uwaga G) i `attacksAloneCombatProjection`
    (uwaga E) oraz fale PMSSB-61.
- [ ] Uruchomić `node --test test/bot-benchmark.test.js` i testy celowane (cicho do `.arena/`).
- [ ] Spisać raport `docs/audits/AUDYT_PR163_2026-10-13.md` z rejestrem 94 plików,
      dowodami i listą findingów.

### C. Naprawy findingów audytu

Dla każdego znalezionego błędu kodu, kontraktu, UX, testu lub dokumentacji:

1. test/reprodukcja RED na aktualnym stanie;
2. chirurgiczna naprawa u root cause (ADR 0002, ADR 0016);
3. GREEN + weryfikacja mutacyjna (L13);
4. `npm test` + `npm run build` (cicho do `.arena/`);
5. osobny commit i natychmiastowy `git push origin arena/e114bf10-mtg`.

- [ ] Wszystkie findingi kodu/reguł/kontraktów/UX naprawione.
- [ ] Wszystkie findingi testów/dokumentacji naprawione.

### D. Domyślna kontynuacja po audycie (ADR 0021)

- [ ] Sprawdzić, czy na `main` zostały niedokończone plany (`PLAN_2026-10-13-batch66*`
      i `PLAN_2026-10-13-pmssb61*` mają odhaczone wszystkie punkty realizacji;
      zweryfikować w audycie, czy żaden punkt nie został pominięty).
- [ ] Wykonać celowaną pętlę jakości na rodzinach dotkniętych w PR #163:
  - przebieg Żywym Testerem (`tools/table-tester`) na taliach z nowymi kartami
    Batcha 66 (`worek-mroczny`, `worek-dziki`, `alara`, `wiedzmin-bg`, `eldraine`,
    `zendikar`, `forgotten-realms`) + ręczna lektura transkryptów wzdłuż 3 osi;
  - polowanie na błędy CR / kontraktów widoku i decyzji wokół nowych mechanik;
  - naprawa każdego wykrytego problemu u root cause z testem regresyjnym.
- [ ] Nie dodawać nowych kart do katalogu (ADR 0029).

### E. Brama końcowa i dokumentacja

- [ ] `npm test` (cicho do `.arena/`).
- [ ] `npm run test:all` (cicho do `.arena/`, ADR 0019).
- [ ] `npm run build` (cicho do `.arena/`).
- [ ] `node --test test/bot-benchmark.test.js` (cicho do `.arena/`).
- [ ] `node tools/cr-numery.mjs --cr` oraz `node tools/event-contract-audit.mjs`.
- [ ] Zaktualizować ten plan, raport audytu, `docs/PROJECT_HISTORY.md`, nowy
      handoff `docs/setup/HANDOFF_2026-10-13.md` i opis PR.
- [ ] Potwierdzić czyste drzewo, wypchnięte commity i zielony GitHub CI.

## Ryzyka i pułapki

- Duży rozmiar PR #163 (94 pliki): przegląd musi być systematyczny (plik po pliku
  wg kategorii), a nie pobieżny.
- Wszystkie testy i narzędzia uruchamiamy z przekierowaniem `> .arena/*.log 2>&1`
  (ENVIRONMENT §5a).
- Żywy Tester czyta `dist/mtg-table.html` — po każdej zmianie w `src/` obowiązkowy
  `npm run build` (L76).
- Zakaz force pusha na każdej gałęzi; przed każdym pushem kontrola `HEAD` i zdalnej
  gałęzi (ADR 0020 D).
