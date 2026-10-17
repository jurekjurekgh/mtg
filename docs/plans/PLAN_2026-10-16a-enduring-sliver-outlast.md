# Plan 2026-10-16a — Enduring Sliver: Outlast w głównej 2, nie w głównej 1

Zgłoszenie testera (uwaga N, 2026-10-16): bot co turę robi Outlast Enduring
Sliver w głównej fazie 1, mimo że stwór jest już 9/9 i mógłby atakować. Outlast
wymaga {T}, więc tapuje stwora i zabiera mu atak. Właściciel: zdolność ma być
użyta dopiero w głównej 2, gdy kreatura jest odtapowana i bot ma wolną manę.

## Rozpoznanie

- Definicja: `src/cards/card-data.js` (`enduring-sliver`, ≈9741): koszt
  `{mana: 2, tap: true}`, `timing: 'sorcery'`. Zgodne z CR 702.107a.
- Wycena: `src/controllers/heuristic-bot.js`, gałąź `case 'activate_ability'`
  (≈11511+). Przed poprawką: główna 1 = `activate_ability` z wyceną 60,
  `pass_priority` = 0. Główna 2 = 56. Atak w tej fazie nie jest opcją (atak
  pojawia się dopiero w `declare_attackers`), więc wycena Outlasta w głównej 1
  nie miała żadnego konkurenta poza pasem.
- Istniejące reguły tapowania (`tapTimingBonus`, `tapTargetValue`) dotyczą
  tapowania CUDZYCH permanentów. Własny stwór tapowany przez własny koszt
  nie miał kary za utratę ataku (`taps` tylko w `wastefulStep`/mana).
- Silnik (sonda): stwór z chorobą przywołania nie ma legalnej aktywacji z {T}
  (`legalCommands` puste, `execute` odrzuca). `addObject` ignoruje
  `summoningSickness` (ostrzeżenie L21), ustawiać przez `state.objects.set`.

## Zakres

1. `test/uwaga-n-enduring-sliver-outlast-2026-10-16.test.js` — RED (N/1), kontrola N/2–N/4.
2. `heuristic-bot.js`: w `activate_ability` przed regułą „wasteful step” kara
   `-40`, gdy: `taps` (koszt {T} na źródle), efekt to WYŁĄCZNIE `add_counter`
   na sobie (bez celów), `ability.timing === 'sorcery'`, tura moja, faza
   `precombat_main`, `canAttackNow(source)` (nietapnięty, bez choroby
   przywołania). Okno zostaje w głównej 2. Klasa po efekcie (ADR 0002).

Próba pierwsza (odrzucona): warunek „każda zdolność z {T} sorcery na źródle”
wywrócił 18 testów wyceny (Harvester, Duo, Xu-Ifit, explore, Skullcairn, H/5…):
te zdolności też mają {T} i timing sorcery, a ich wycena jest inna. Zawężenie
do klasy outlast (tylko `add_counter` na sobie) usunęło wszystkie regresje.
Sama „cena ciała” (`tapBodyCost`, cap `manaTapBodyMax` = 8) też nie wystarcza:
outlast waży 60, a pas 0, więc kara 8 nie odwraca decyzji.
3. Brak zmian w silniku i w definicji karty.

## Dlaczego okno w głównej 2 zawsze działa

Stwór, który nie atakował, zostaje nietapnięty do końca walki, więc w głównej 2
Outlast jest nadal legalny. Stwór, który atakował, jest tapnięty (bez vigilance)
i outlast byłby już niemożliwy. Reguła nic więc nie odbiera: tylko przenosi
aktywację tam, gdzie nie kosztuje ataku. Wyjątki (stwór, który nie może
atakować) zostają nietknięte, bo `canAttackNow` wtedy zwraca false.

## Weryfikacja

- Sonda (tymczasowa, usunięta): główna 1 → `pass_priority` (0) zamiast
  `activate_ability` (60); główna 2 → `activate_ability` (56); deklaracja
  ataków → `declare_attackers` z `attackerIds: ['sl']`.
- `node --test` na pliki z outlast/sliver: 142/142 rc=0.
- `npm test` rc=0 (wynik w logu poniżej).

## Mini-roadmapa

- [x] Rozpoznanie (wycena w `activate_ability`, brak kary za {T} na źródle).
- [x] RED N/1 (główna 1 wybiera Outlast); kontrole N/2–N/4 zielone od początku.
- [x] GREEN: kara `-40` za {T} sorcery w głównej 1, gdy stwór może atakować.
- [x] Testy powiązane (outlast/sliver) 142/142; 18 regresji z wersji pierwszej naprawionych zawężeniem.
- [x] `npm test` 8283/8283 rc=0; `bot-benchmark.test.js` 10/10.
- [x] `npm run benchmark`: heurystyka 608/672 (90,5%) vs baza 609/672 (90,6%). Jedyna
      zmieniona para: dominaria-wu vs forgotten-realms, 16/16 → 15/16 (talia z Enduring Sliver).
      Pomiar 16 seedów = jedna partia; decyzja właściciela z gry.
- [x] build rc=0.
- [x] Commit, push bez force, opis PR #166 (wiersz N). — domknięte scaleniem PR #166 (squash `24ff1a5`); odhaczone w sesji 2026-10-17.
- [ ] Odpowiedź właścicielowi. — (pozostaje otwarte: wymaga potwierdzenia właściciela; agent nie odhacza go sam).
