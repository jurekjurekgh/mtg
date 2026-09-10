# PLAN 2026-09-10c — zgłoszenia właściciela A–F z testów przy stole (PR #113, arena/01a08d0e)

Właściciel zgłosił sześć znalezisk z gry. Ta sama sesja/gałąź/PR (ADR 0013/0020,
precedens PR #111: znaleziska właściciela A–D w tej samej sesji co pętla jakości).
Każde znalezisko: najpierw test RED, potem fix u źródła, potem weryfikacja
mutacyjna (L13), każdy zielony krok osobnym commitem (ADR 0020 C/D).

Uwaga: zrzuty ekranu ze zgłoszenia nie dotarły (puste placeholdery) — triaż
oparty na opisach tekstowych i na kodzie.

## Triaż (zmierzony w kodzie, nie zgadywany)

| # | Zgłoszenie | Przyczyna źródłowa (zmierzona) | Podstawa reguł | Typ fixu |
|---|---|---|---|---|
| **E1** | Zdolność Furious Forebear odpala się przy jego WŁASNEJ śmierci | `src/engine/triggers.js:2050-2059` — skan obiektów w grobie po zdarzeniu śmierci nie wyklucza karty, która właśnie umarła (ani współpoległych z tej samej partii SBA) | Oracle: „…**while this card is in your graveyard**…"; ruling WotC 2025-04-04: „If Furious Forebear dies at the same time as one or more creatures you control, its ability won't trigger" | silnik (reguły) |
| **B1** | „Rediscover the Way zyskuje: podwójne uderzenie" — Saga dostaje double strike zamiast stwora | `src/engine/effects.js:1034-1054` — efekt dokleja grant do SAGI i emituje `keyword_granted` z `objectId` sagi; grant ginie razem z poświęconą Sagą | Oracle III: „Whenever you cast a noncreature spell this turn, **target creature you control** gains double strike"; ruling WotC 2025-04-04: „…may trigger multiple times during the turn, **even though Rediscover the Way will likely no longer be on the battlefield**" | silnik (opóźniony trigger do `state.delayedTriggers`) |
| **B2** | Poświęcenie Sagi przed rozstrzygnięciem jej triggera | `src/engine/triggers.js:761-780` — poświęcenie jest w środku `fireSagaChapter`, więc zdarzenie `permanent_sacrificed` ląduje w logu PRZED `ability_resolved` | mtg.wiki/WotC (Saga): „the Saga's controller sacrifices it **as soon as its chapter ability has left the stack**, most likely by resolving or being countered. This state-based action doesn't use the stack" (CR 704.5s) | silnik (poświęcenie jako SBA po zejściu zdolności ze stosu) |
| **E2** | Pytanie o płatność bota („zapłacić {1}{W}?") trafia do logu „Rozgrywka" | `src/table/session.js` — `describeEvent` dla okna wyboru płatności nie jest filtrowany z głównego logu (bramka `MAIN_LOG_NOISE`/`noteBotMove`) | decyzja UI właściciela: decyzje bota należą do sekcji „Ruch bota" | warstwa pokazu |
| **E3** | `{1}{W}` w logu tekstem, nie ikonkami | `src/table/mana-icons.js:45` (`manaSymbolsHtml`) istnieje, ale ten wpis logu jest budowany surowym szablonem | spójność UI | warstwa pokazu |
| **A** | Auto-płatność tapuje Forest, choć nietapnięty Scorned Villager też daje {G} — brak kreatora many | `src/table/mana-wizard.js:466-471` — klucz deduplikacji wariantów to `kolory#ilość#kosztAktywacji`, BEZ rodzaju źródła; Forest i Scorned Villager (oba `{G}`, 1) to ten sam „kształt" → 1 wariant → `shouldOpenManaWizard` = false | decyzja właściciela + MtG: tapnięcie stwora ma koszt alternatywny (nie atakuje/nie blokuje), więc wybór jest realny | warstwa pokazu (oferta) |
| **F** | Curse of the Pierced Heart na przeciwniku bez badge'a „klątwa: Nieprzyjaciel" | badge'e kafla nie obejmują aur `enchantPlayer` (aura wisi na graczu, nie na permanencie) | spójność UI (badge'e istnieją dla aur na stworach) | warstwa pokazu |
| **C** | Bot używa Exploit (Gurmag Drowner) przy 5 kartach w bibliotece i poświęca stwora z lataniem | wycena exploitu w `src/controllers/heuristic-bot.js` nie zna ani liczby kart w bibliotece, ani wartości poświęcanego stwora | Oracle: „look at the top four cards… put one into your hand and the rest into your graveyard" — mill 3 przy małej bibliotece = ryzyko przegranej | bot (wycena) |
| **D** | Bot atakuje 3/1 (Furious Forebear) w nietapnięte 4/4 i 4/5 przy 3 własnego życia | scoring ataku nie liczy pewnej straty atakującego bez obrażeń dla przeciwnika (trade-down) | zdrowy rozsądek rozgrywki (brak zmiany reguł) | bot (scoring) |

## Kolejność pracy (niezależne kroki, każdy z bramką)

1. **E1** — wykluczenie własnej śmierci (i współpoległych SBA) ze skanu triggerów
   w grobie; test: samotna śmierć i jednoczesna śmierć → brak triggera, śmierć
   INNEGO stwora przy Forebearze w grobie → trigger jest (anty-over-fix).
2. **B1 + B2** — rozdział III jako opóźniony trigger w `state.delayedTriggers`
   (przeżywa poświęcenie, cel = stwór pod kontrolą, może odpalić wiele razy
   w turze) + poświęcenie Sagi jako SBA po zejściu zdolności ze stosu.
3. **E2 + E3** — decyzje płatności bota poza głównym logiem + symbole many.
4. **A** — rodzaj źródła w kluczu wariantów płatności (ląd vs zdolność).
5. **F** — badge klątwy na graczu.
6. **C** — wycena exploitu (biblioteka + wartość poświęcanego stwora).
7. **D** — scoring beznadziejnego ataku.
8. Domknięcie: `npm test`, `npm run build`, `npm run test:all`, Żywy Tester na
   świeżych seedach, handoff/historia/README, opis PR kumulatywnie.

## Ryzyka i pułapki

- E1: wykluczenie musi objąć też JEDNOCZESNE zgony (ruling WotC) — samo
  `source.id === died.id` nie wystarczy; współpolegli są w `simultaneousFellows`
  (obiekty PO zmianie strefy, czyli z nowymi id — tak samo jak `died`).
- B1: opóźniony trigger musi być w rejestrze stanowym (`state.delayedTriggers`,
  jak np. effects.js:1441), nie w `abilityGrants` obiektu, który za chwilę
  znika z pola bitwy (CR 400.7 — nowy obiekt w nowej strefie).
- B2: przeprowadzka poświęcenia do SBA zmienia KOLEJNOŚĆ zdarzeń — pełny rdzeń
  + testy sag (Shiva/Cold Snap/Jill) przed commitem.
- A: zmiana progu kreatora potrafi dodać kliknięcia przy wielu źródłach tego
  samego rodzaju — klucz ma rozróżniać ląd/zdolność, NIE poszczególne obiekty.
- C/D: zmiana wyceny bota → próbka regresji `node tools/benchmark.mjs` (quick)
  i Żywy Tester; NIGDY pełne B0 bez komendy właściciela (ADR 0018).

## Podsumowanie wykonania

(uzupełniane kolejnymi commitami)
