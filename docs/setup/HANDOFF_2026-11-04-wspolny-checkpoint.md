# HANDOFF 2026-11-04 — wspólny checkpoint wyzwalaczy

## Stan

- Gałąź `arena/5d931b5a-mtg`, PR #179 (draft). Kod HEAD przed tym dokumentem: `3fcf1b6` („feat: checkpoint modalny i kontynuacja SBA”). Dokumentacja domyka etap 3.
- Wdrożony zakres ADR 0032: partia checkpointu obejmuje wszystkie zwykłe wyzwalacze okna (nie tylko śmierć), cele pojedyncze/wielokrotne, `allowNone`, cele stałe, `specOverride`, modalne triggery i podział obrażeń. APNAP + jawny wybór kontrolera; cele/tryby/podziały ogłaszane pojedynczo w kolejności umieszczania na stosie.
- Ward z celów czeka w `pendingWardAnnouncements` na drugi przebieg. Kontynuacja po SBA tworzy nową partię wyłącznie z wpisów spoza stosu sprzed SBA. Płatności Ward/optional pozostają odroczone; mana dozwolona przy żądaniu zapłaty.
- Madness zachowuje istniejące domknięcie `madnessQueue`/`madnessBatchTriggerIds` i wspólny wybór kolejności A28; exploit/devour/Saga przechodzą kontrole bez podwójnych wpisów. Historyczne pole `pendingDeathTriggerBatch` i flaga `deathBatch` pozostają nośnikiem partii do osobnej migracji nazw.

## Dowody

- Nowe testy: `test/checkpoint-etb-kolejnosc.test.js` (Impact Tremors/Loporrit Scout, Weftblade Enhancer, Inferno Titan), `test/checkpoint-modal-kolejnosc.test.js` (Etched Host Doombringer). Mutacje: wąski filtr zdarzeń oblewa 3 testy; ignorowanie modali oblewa test modalny.
- Skorygowane oczekiwania: M382/D (wybór kontrolera zamiast kolejności wykrycia), A75 (Ward czeka, nie wyklucza partii), A77 (koszt odrzucenia uruchamia checkpoint), B63 (dwa modalne ETB), helpery exploit/drain.
- Bramy końcowe: strażnicy dokumentów **25/25**, `test:audit` **724/724**, fast **9960/9960**, pełny `test:all` **10228/10228** (593,2 s), build **77 modułów / 5691,2 kB**; 0 fail / 0 skip.
- Golden-master bota zregenerowany świadomie: tylko `ravnica-wur|innistrad-wu@1001` (298→299 decyzji, scoreSum 3186.9495→3166.2283); pozostałe pięć śladów bitowo identycznych.

## Granice i następne kroki

- Nie scalano PR, nie robiono force-push, nie dodawano kart, nie uruchamiano pełnego B0 ani eksperymentów `NIE_WDRAZAC`.
- Budżet lektury startowej ma bardzo mały zapas po kondensacji ADR 0031/0032; nie podnosić progu. Kolejne ADR wymagają kondensacji.
- Po pushu: sprawdzić CI HEAD i `mergeable_state`, zaktualizować wiersz CI w treści PR #179. Ewentualne przemianowanie pól partii traktować jako osobną migrację replay/fingerprint.
