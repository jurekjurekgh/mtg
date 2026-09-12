# PLAN 2026-09-11b — sesja arena/01a0925f: audyt PR #113 + dokończenie wyzwania 5 błędów (3–5/5)

> Prompt startowy: **„Kontynuujemy projekt.”** → tryb obowiązkowy ADR 0020 (PR przed
> kodowaniem → audyt poprzedniego PR → inkrementalne, samodzielnie zielone commity)
> + ADR 0021 (pętla domyślna: **niedokończony plan na `main`** = pkt 3, pętla
> jakości = pkt 4). Żadnego pytania o kolejkę.

## Lektura startowa (AGENTS.md §0, wykonana przed tym plikiem)

`AGENTS.md` (366 linii, w całości) → **wszystkie** ADR-y `docs/decisions/0001–0030`
(+ README rejestru; archiwum nie jest lekturą startową) → `docs/LESSONS.md`
(2333 linii, L1–L141 w całości, czyta­ne zakresami `sed -n` po sygnałach
`truncated` — L78) → `docs/setup/ENVIRONMENT.md` (189 linii) → PR #113 (`gh pr
view 113`, diff 54 plików / 4891 linii) → `docs/setup/HANDOFF_2026-09-11.md`.

## Punkt zaczepienia (zmierzony, nie przepisany — L7/L92)

- `main` = `a2a5f0d` (squash PR #113, scalony 2026-09-11T21:27:49Z, 29 commitów).
- `npm test` (szybki rdzeń) na starcie sesji: **5150/5150 pass, 0 fail** (~192 s).
- Katalog: 509 kart (handoff 2026-09-11); build: 61 modułów / ~3487 kB (do
  przemierzenia na końcu — L92).
- **Niedokończony plan na `main`:** `PLAN_2026-09-11-wyzwanie-5-bledow-zasad.md`
  (wyzwanie właściciela: 5 unikalnych błędów/uproszczeń vs CR). W PR #113
  weszły **1/5 (bloodthirst, `2bf9405`)** i **2/5 (changeling, `2bc5ee2`)**;
  kroki E4–E6 planu (znaleziska 3–5) NIE są zrobione.

### Triża kroków 3–5 starego planu (zmierzona w kodzie + źródła online, ADR 0030)

| # planu | Teza planu | Weryfikacja w tej sesji | Werdykt |
|---|---|---|---|
| 3 | „brak akcji stanowej parowania +1/+1 z −1/−1 (CR 704.5q)”, persist odpala mimo LKI z +1/+1 | parowanie ISTNIEJE: `runStateBasedActions` (`state-based.js`, blok „CR 122.3 (anihilacja liczników)”) kasuje `min(plus,minus)` par i emituje `counter_removed{annihilated:true}`; LKI (`formerCounters`) jest snapshotowane PRZED anihilacją, bo `destroyPermanents` biegnie wcześniej w tym samym przebiegu — dokładnie jak wymaga reguła LKI | **teza nieaktualna** (silnik poprawny). Zostaje pytanie o CHOKE POINT: blok przepisuje `object.counters` ręcznie (`state.objects.set`), omijając `removeCounter` z `counters.js` (klasa L107) — do zbadania w E2 |
| 4 | bloker blokujący dwóch atakujących zadaje pełną moc KAŻDEMU (CR 510.1a/d) | `resolveCombatDamage` (`combat.js` ~650–760): pętla po atakujących, a wewnątrz `for (const blockerId of blockers)` → `blockerDamage = combatDamageAmount(blocker, state)` = CAŁA moc blokera na każdego atakującego; brak jakiejkolwiek decyzji/podzielu po stronie blokera | **potwierdzone: realny błąd reguł** → krok W3 |
| 5 | `lethalOf()` bez deathtouch → trample+deathtouch odrzuca legalny przydział (CR 702.19b) | `lethalOf` (`combat.js:469`) pierwszą linią zwraca `1`, gdy źródło ma deathtouch; `validateDamageAssignment` i `defaultDamageAssignment` czytają tę samą funkcję. Zgodne z wcześniejszym wpisem „zweryfikowane jako POPRAWNE” w `PROJECT_HISTORY.md` (sesja 2026-08-24) | **teza nieaktualna** (silnik poprawny; L57 — nie „naprawiamy” poprawnego kodu) |

Przy okazji triażu sprawdzono **persist** (Puppeteer Clique): warunek
`noMinusCountersWhenDied` + powrót z licznikiem `-1/-1` wyglądają na odwrócone
wobec pamięci modelowej, ale Oracle ze Scryfalla pobrany **na żywo 2026-09-11**
(`api.scryfall.com/cards/named?fuzzy=Puppeteer Clique`, dodruk `ecc` 2026-01-23)
brzmi: *„Persist (When this creature dies, if it had no -1/-1 counters on it,
return it to the battlefield under its owner's control with a -1/-1 counter on
it.)”* — silnik i snapshot w repo są ZGODNE z Oracle. To dokładnie przypadek
ADR 0030 §2 (pamięć treningowa nie jest źródłem): bez pobrania tekstu sesja
„naprawiłaby” poprawny kod.

**Wniosek:** z pięciu kroków starego planu realny jest jeden (#4). Wyzwanie
właściciela wymaga PIĘCIU unikalnych błędów, więc dwa brakujące muszą wyjść
z audytu PR #113 i pętli jakości — stąd kroki W4/W5 poniżej (kandydaci będą
dopisani po pomiarze, nie wymyśleni z góry).

## Kroki

- [x] **E1 — plan + PR przed kodowaniem** (ADR 0020 A). Ten plik jako osobny
      commit, PR otwarty natychmiast po pushu (reguła nadrzędna A–D).
- [ ] **E2 — audyt PR #113** (ADR 0020 B / ADR 0016): każdy z 54 zmienionych
      plików — zgodność z CR i ADR 0002 (brak przypadków po nazwie karty),
      generyczność mechanik (Saga/`turnAbilityGrants`, `hasCreatureType`,
      `isTargetingBlockedByProtection`, `sacrificeFinishedSagas`, bloodthirst),
      testy RED→GREEN i weryfikacja mutacyjna (L13), kompletność widoku
      (ADR 0017 — `enchantPlayer`, `enchantedPlayerId`, `cursedPlayerId`),
      choke pointy (L107). Wynik: `docs/audits/AUDYT_PR113_2026-09-11.md`
      + sekcja w opisie PR. Znalezione błędy → F1…Fn, każdy osobnym commitem.
- [x] **W3 — wyzwanie 3/5: bloker dzieli obrażenia między atakujących**
      (CR 510.1a/510.1c/510.1d). Dowód online (tekst CR dosłownie) → test RED
      `test/wyzwanie-3-bloker-dwóch-atakujacych-510-1d.test.js` → naprawa
      u źródła (decyzja przydziału po stronie BLOKERÓW, generyczna, z wariantem
      domyślnym lethal-first dla botów) → mutacje → bramki.
      Ryzyko: nowa decyzja blokująca = checklista ~10 punktów integracji (L95)
      i brak zawieszeń w benchmarku (L48: oferta == walidacja).
      **WYKONANE `c5adc97`**: dowód online (mtg.wiki/page/Combat_damage_step,
      wydanie 2026-09-02 — 510.1 kolejność „atakujący, potem blokujący",
      510.1a moc, 510.1d dowolny podział kontrolera), test RED
      `test/wyzwanie-3-bloker-dwóch-atakujacych-510-1d.test.js` (W3/1–W3/7),
      naprawa u źródła: przebieg w dwóch fazach, `pendingDamageAssignment`
      z `role: 'blocker'` i `phase` w resume, `validateBlockerDamageAssignment`,
      default lethal-first dla botów (jedna oferta, `finish(0)` bez zmian),
      widok + wizard (`sourceId`/`targets`/`targetKey`). Kierunek „interleaved
      dealing z deduplikacją" z tego planu zastąpiony dwiema fazami (CR 510.1).
      Mutacje (L13) złapane: 7 wariantów. Bramki: `npm test` 5175/5175,
      `test:all` 5185/5185, build 61 modułów / 3512,6 kB, benchmark 84,2%
      (566/672) bez zmian i bez zawieszeń, golden master bez churn.
- [ ] **W4 — wyzwanie 4/5: przydział obrażeń liczony ze stanu NA POCZĄTEK kroku
      (CR 510.1/510.2)**. Kandydat **ZMIERZONY** 2026-09-12 tuż po W3 (sonda
      `tools/probe-w4-infect-przydzial.mjs`, scenariusz z podwójnym blokiem
      Cenn's Tactician): p2 atakuje Chained Throatseeker 5/5 (infect, wymaga
      zatrutego obrońcy) i Gurmag Drowner 2/4; p1 blokuje OBA jednym Segmented
      Krotiq 6/5 z licznikiem +1/+1 (7/6).
      - CR 510.1/510.2: przydziały ogłasza się PRZED zadaniem obrażeń, a
        obrażenia zadawane są RÓWNOCZEŚNIE → krotiq przydziela 7 (domyślnie
        lethal-first: 5 na Throatseekera = śmierć, 2 na Drownera), sam dostaje
        5 liczników −1/−1 i 2 obrażenia i ginie DOPIERO PO zadaniu swoich.
      - Silnik po W3 (zmierzone): faza atakujących daje 5 liczników i 2
        obrażenia, decyzja blokera jest zakolejkowana
        (`damage_assignment_required`), po czym SBA po komendzie niszczy
        krotiqa (`creature_destroyed` — kolejność zdarzeń w sondzie) → w fazie
        blokerów stwór jest już poza polem bitwy i nie zadaje NIC (0). Widok
        decyzji ma wtedy puste `entries`, a UI idzie w domyślny wariant
        (`src/table/main.js:700`).
      - Silnik PRZED W3: ten sam scenariusz dawał 2 i 2 (moc liczona już po
        licznikach infect + pełna moc każdemu atakującemu) — dwa błędy naraz,
        więc W3 nie jest regresją wobec zachowania poprawnego, tylko wobec
        innego błędnego.
      Do potwierdzenia online przed implementacją (ADR 0030): CR 510.1
      (ogłaszanie przydziałów), 510.2 (równoczesność zadawania), 702.3 (infect:
      liczniki −1/−1 zamiast obrażeń), 704.3/704.5g (SBA dopiero po zadaniu
      obrażeń w kroku).
      Kierunek naprawy: moc i lethal liczone RAZ na początku przebiegu i niesione
      w decyzji (snapshot w `pendingDamageAssignment`), zadawanie obrażeń po
      zebraniu WSZYSTKICH przydziałów oraz wstrzymanie SBA niszczącego stwory
      z oznaczonymi obrażeniami, dopóki wisi decyzja przydziału (SBA po
      `resolve_combat` biegnie w ścieżce `accepted`).
      Ryzyko: dotyka rdzenia walki i kolejności zdarzeń (golden master bota,
      transkrypty Żywego Testera) — najpierw test RED na tym scenariuszu, potem
      mutacje (L13), potem pełne bramki.
- [ ] **W5 — wyzwanie 5/5**: j.w.
- [ ] **E6 — pętla jakości** (ADR 0021 §4a): Żywy Tester na świeżym `dist/`
      (L76), min. 3 partie, transkrypty czyta­ne RĘCZNIE wzdłuż trzech osi
      (L27: zero z detektorów to pomiar narzędzia), każda klasa znaleziona
      ręcznie → nowy detektor. Bez pełnego B0 (ADR 0018).
- [ ] **E7 — domknięcie** (ENVIRONMENT §7): `npm run test:all`, `npm run build`,
      liczby w README wg pomiaru, wpis `docs/PROJECT_HISTORY.md`,
      `docs/setup/HANDOFF_2026-09-11b.md`, korekta starego planu (tezy 3 i 5
      nieaktualne), kumulatywny opis PR (REST PATCH — `gh pr edit` pada).

## Kolejka commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. `docs(plan)`: ten plan (E1) → PR.
2. `docs(audyt)`: audyt PR #113 + findings (E2).
3. `fix(...)`: F1…Fn z audytu (osobno na finding, L136).
4. `test+fix(engine)`: W3, potem W4, W5 (osobno).
5. `docs(close-out)`: E7.

## Ryzyka i pułapki

- **Reset workspace między turami** (zmierzone 3× w sesji PR #113): push
  natychmiast po każdym commicie; patche POZA repo nie przeżywają; co ma
  przetrwać — w drzewie roboczym repo (ENVIRONMENT §2, handoff 2026-09-11).
- **W3 zmienia przebieg walki** → golden-master wycen bota może się zmienić;
  przy ŚWIADOMEJ zmianie regeneracja + wpis, która partia i jak (L124).
- **Zmiana reguł wymaga źródeł online** (ADR 0030): CR z mtg.wiki /
  yawgatog + rulingi Scryfall, cytowane dosłownie w teście i w commicie.
  `curl` w sandboxie nie ma egressu — pobieram narzędziem `fetch_page`.
- **Nie „naprawiamy” kodu poprawnego** (L57, ADR 0022): tezy 3 i 5 starego
  planu są zamknięte jako „silnik poprawny” z dowodem w tym pliku i w audycie.
- Katalog NIE rośnie (ADR 0029): braki nośników załatwia karta syntetyczna
  w teście (L134).
