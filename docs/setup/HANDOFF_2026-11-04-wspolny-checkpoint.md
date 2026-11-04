# HANDOFF 2026-11-04 — wspólny checkpoint wyzwalaczy

## Stan

- Gałąź `arena/5d931b5a-mtg`, PR #179 (draft). Kod HEAD: `5d0f343` („test: kontrole SBA checkpointu i komentarz APNAP”). Dokumentacja domyka etap 3c.
- Wdrożony zakres ADR 0032: partia checkpointu obejmuje wszystkie zwykłe wyzwalacze okna (nie tylko śmierć), cele pojedyncze/wielokrotne, `allowNone`, cele stałe, `specOverride`, modalne triggery i podział obrażeń. APNAP + jawny wybór kontrolera; cele/tryby/podziały ogłaszane pojedynczo w kolejności umieszczania na stosie.
- Ward z celów czeka w `pendingWardAnnouncements` na drugi przebieg. Kontynuacja po SBA tworzy nową partię wyłącznie z wpisów spoza stosu sprzed SBA. Płatności Ward/optional pozostają odroczone; mana dozwolona przy żądaniu zapłaty.
- Madness i refleksy odrzucenia należą do wspólnej partii: usunięto równoległy `startMadnessTriggerOrder`, a kolejka madness nie jest blokowana przez oczekujący cel/tryb tej samej partii. `madnessBatchTriggerIds` zasila wspólny checkpoint; cel refleksu jest ogłaszany dopiero po wyborze kolejności.
- Historyczne pole `pendingDeathTriggerBatch` i flaga `deathBatch` pozostają nośnikiem partii do osobnej migracji nazw. `placeTriggerBatchInApnapOrder` stabilizuje już tylko APNAP; wybór wewnątrz kontrolera oferuje checkpoint.

## Dowody

- Nowe testy: `test/checkpoint-etb-kolejnosc.test.js`, `test/checkpoint-modal-kolejnosc.test.js`, `test/checkpoint-madness-kolejnosc.test.js`, `test/checkpoint-sba-kontrole.test.js`. Mutacje: wąski filtr zdarzeń oblewa 3 testy ETB; ignorowanie modali oblewa test modalny; przywrócenie blokady kolejki madness oblewa 2 testy.
- Skorygowane oczekiwania: M382/D, A75, A77, B63, A28 (kolejność przed celem), helpery exploit/drain.
- Bramy końcowe: strażnicy dokumentów **25/25**, `test:audit` **724/724**, fast **9964/9964**, pełny `test:all` **10232/10232** (563,0 s), build **77 modułów / 5691,2 kB**; 0 fail / 0 skip.
- Golden-master bota zregenerowany świadomie w etapie 2: tylko `ravnica-wur|innistrad-wu@1001` (298→299 decyzji, scoreSum 3186.9495→3166.2283); pozostałe pięć śladów bitowo identycznych.

## Granice i następne kroki

- Nie scalano PR, nie robiono force-push, nie dodawano kart, nie uruchamiano pełnego B0 ani eksperymentów `NIE_WDRAZAC`.
- Budżet lektury startowej ma bardzo mały zapas po kondensacji ADR 0031/0032; nie podnosić progu. Kolejne ADR wymagają kondensacji.
- Po pushu: sprawdzić CI HEAD i `mergeable_state`, zaktualizować wiersz CI w treści PR #179. Ewentualne przemianowanie pól partii traktować jako osobną migrację replay/fingerprint.
