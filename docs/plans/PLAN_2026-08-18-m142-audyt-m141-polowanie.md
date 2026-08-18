# PLAN M142 — audyt M141 i polowanie na błędy interakcji

**Data:** 2026-08-18  
**Gałąź:** `arena/01a0158b-mtg`  
**Zlecenie:** audyt poprzedniego PR #59 (M141), następnie polowanie na kolejne błędy.

## 1. Stan wejściowy i obowiązkowy audyt PR #59

- `main` / HEAD: `a53ec21` (squash PR #59).
- Working tree na starcie: czysty.
- Baseline: `npm test` **2244/2244**, `npm run build` **51 modułów / 1912,8 kB**.
- PR #59 zmieniał kopiowanie obiektów, station po animacji, ochronę Benevolent
  Blessing, ofertę celów chronionych oraz fallback AggroBota.
- Audyt obejmuje kod produkcyjny, zgodność z Oracle/CR, testy M141 oraz brak
  specjalnych przypadków po nazwie/ID (ADR 0002).

### Wstępne znaleziska audytu (do potwierdzenia testami RED)

1. **Benevolent Blessing — zły podmiot „you”.** Wyjątek Oracle mówi o Aurach
   i Equipmentach kontrolowanych przez kontrolera Blessing. Kod M141 porównuje
   załączniki z kontrolerem *zaczarowanego stwora*. Przy Blessing na cudzym
   stworze zachowanie jest odwrócone.
2. **Token-kopia Spacecraft traci drukowane P/T.** M141 przenosi `station`, ale
   `createBattlefieldToken` zeruje P/T każdemu tokenowi, którego bieżący `kind`
   nie jest `creature`. Po osiągnięciu progu kopia staje się stworem z `null/null`.
3. **Token-kopia traci mana value.** `create_copy_token` przekazuje `manaCost`,
   lecz fabryka tokenu go nie przyjmuje i zawsze zapisuje `0` (CR 707.2/202.3).
4. **Epic Experiment omija poprawkę protection z M141.** `epicCastOffers` woła
   `legalTargetCandidates` bez obiektu źródła; walidacja free-castu także nie
   przekazuje źródła. Oferta może zawierać cel z ochroną, którego zwykły rzut
   nie oferuje.
5. **Willbender omija protection przy zmianie celu.** Obie ścieżki
   `pendingRedirectChoice` wyliczają cele bez przekazania czaru ze stosu;
   chroniony permanent może zostać nowym, nielegalnym celem (CR 115.7d,
   702.16b).
6. **Fałszywie zielony test M141/D.** Test „Jwari zachowuje station” nie
   wykonuje `resolve_enter_as_copy`; ręcznie konstruuje oczekiwany obiekt z
   polami `station`/`saga`, więc przechodzi także po usunięciu produkcyjnego
   fixu. Zostanie zastąpiony testem end-to-end przez `execute`.

## 2. Etapy i kryteria ukończenia

### E0 — plan (osobny commit przed kodowaniem)

- [x] Rozpoznanie repo, PR #59, baseline test/build.
- [x] Plan z wynikami wstępnego audytu, ryzykami i kolejnością commitów.
- [ ] Commit i push planu; otwarcie jednego PR sesji.

### E1 — audyt M141: testy RED i naprawy root cause

- [ ] Test kontrolera wyjątku Benevolent na cudzym stworze.
- [ ] Test token-kopii station po progu: `kind`, `types`, P/T i mana value.
- [ ] Test Epic free-cast: oferta = walidacja dla ochrony od koloru/jakości.
- [ ] Test Willbendera: chroniony cel nie jest oferowany ani akceptowany.
- [ ] Test Jwari end-to-end przez realne `pendingEnterAsCopy` + `execute`.
- [ ] Minimalne, generyczne poprawki po deskryptorach; zero nazw kart w core.
- [ ] `npm test` i `npm run build` zielone; commit i push.

### E2 — polowanie systemowe poza trafieniami audytu

- [ ] Zinwentaryzować wszystkie wywołania `legalTargetCandidates` i
  `validateTargets`; dla każdej ścieżki wskazać prawidłowe źródło.
- [ ] Zinwentaryzować wszystkie ręczne listy kopiowanych pól; sprawdzić
  deskryptory i wartości kopiowalne przeciw istniejącym kartom.
- [ ] Uruchomić co najmniej szybką próbkę benchmarku / celowany fuzzer ofert,
  żeby sprawdzić kontrakt oferta→akceptacja.
- [ ] Każde nowe trafienie: repro → RED → root cause → GREEN → anty-over-fix.

### E3 — pełna brama i dokumentacja

- [ ] `npm run test:all` zielone.
- [ ] `npm run build` zielony.
- [ ] Szybki benchmark (`node tools/benchmark.mjs`, bez `--full`) bez crashy i
  bez regresji progów; pełne B0 tylko na jawną komendę właściciela (ADR 0018).
- [ ] `docs/PROJECT_STATE.md`: wynik audytu, naprawy, pomiary.
- [ ] `docs/LESSONS.md`: tylko nowe, powtarzalne wnioski.
- [ ] Handoff sesji i aktualny opis PR.

## 3. Planowane commity

1. `M142: plan audytu M141 i polowania na błędy` — ten dokument.
2. `M142: naprawa błędów audytu PR #59` — testy RED→GREEN + kod.
3. `M142: dalsze znaleziska audytu systemowego` — jeśli wystąpią, osobny
   samodzielnie zielony commit.
4. `M142: dokumentacja wyników i handoff` — stan, pomiary, wnioski.

## 4. Ryzyka i pułapki

- **L48:** oferta i walidacja muszą używać tego samego filtra oraz tego samego
  źródła; samo przekazanie kolorów nie pokrywa ochrony przed jakością.
- **L47:** ręczna lista pól kopiowalnych starzeje się przy każdej nowej
  mechanice. Nie dokładamy kolejnej kopii listy bez strażnika.
- **L5/L34:** test musi wykonać produkcyjną ścieżkę i czerwienieć po usunięciu
  fixu; ręczne zbudowanie oczekiwanego obiektu nie jest testem zachowania.
- **Benevolent:** „you” oznacza kontrolera źródła efektu, nie właściciela ani
  kontrolera gospodarza. Kontrola może się różnić po kradzieży.
- **Token station:** bieżący typ niestwora nie oznacza braku drukowanych P/T;
  Spacecraft ma P/T widoczne dopiero po spełnieniu progu.
- **Benchmark:** pełna macierz B0 jest zabroniona bez jawnej komendy; profil
  szybki wystarcza do bramy PR.
