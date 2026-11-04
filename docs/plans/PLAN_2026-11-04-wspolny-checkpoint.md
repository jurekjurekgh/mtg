# PLAN 2026-11-04 — wspólny checkpoint wyzwalaczy

## Cel

Wdrożyć pełny wspólny checkpoint wszystkich typów zdarzeń zgodnie z ADR 0032: zdarzenia/LKI w chwili zdarzenia, kolejność APNAP i wybór kontrolera, cele/tryby/podziały przy ogłoszeniu, Ward jako drugi przebieg, pętla SBA→triggery→SBA przed priorytetem. Nie dodajemy kart, nie uruchamiamy pełnego B0, nie wdrażamy `NIE_WDRAZAC`, nie scalamy PR.

## Źródła i reprodukcja startowa

- Przypięty CR: `.arena/checkpoint/cr-raw.txt`, SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`; CR 117.5, 603.3b–d, 603.12, 704.3–704.4.
- Oracle lokalne: `docs/cards/scryfall-impact-tremors.json` („Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.”), `docs/cards/scryfall-loporrit-scout.json` („Whenever another creature you control enters, this creature gets +1/+1 until end of turn.”), `docs/cards/scryfall-highland-game.json` (nośnik wejścia).
- RED: `.arena/checkpoint/etb-order-red.test.js` — po wejściu Highland Game silnik nie oferuje `resolve_trigger_order` dla Impact Tremors/Loporrit Scout; oczekiwane dwie oferty i możliwość odwrócenia kolejności. Log: `.arena/checkpoint/etb-order-red.log`.

## Etap 1 — zwykłe wyzwalacze wszystkich typów (w toku)

- [ ] Przenieść reprodukcję ETB do `test/` jako czerwony test na realnych kartach i komendach.
- [ ] Uogólnić partię poza listę śmierć/odejście/obrażenia: każdy zwykły trigger okna, bez względu na typ celu, `count`, `allowNone`, `fixedTargetIds`, `specOverride`.
- [ ] Zachować odroczenie płatności i Ward jako drugi przebieg; nie dublować wpisów stosu.
- [ ] Dodać wybór kolejności wewnątrz kontrolera dla ETB/innych zdarzeń; skorygować M382/D, który pinował kolejność wykrycia zamiast wyboru (CR 603.3b).
- [ ] Mutacja usuwa poprawkę; kontrole A84–A113, płatności, Ward, madness, Saga, LKI, fingerprint/replay; pełny fast + build; osobny commit i push.

## Etap 2 — modalność, podziały i pętla SBA

- [ ] Włączyć modalne triggery i podział obrażeń do tej samej partii; decyzje w kolejności ogłoszenia, bez priorytetu pomiędzy.
- [ ] Dodać powtórne SBA po ogłoszeniu partii/Ward i nową partię, jeśli powstały nowe wyzwalacze; zachować bramki rozstrzygania/płatności.
- [ ] Zintegrować madness/devour/Saga bez podwójnych wpisów i bez ukrywania istniejących wpisów.
- [ ] Mutacje i kontrole; pełny fast + build; osobny commit i push.

## Etap 3 — domknięcie i dokumentacja

- [ ] Mechaniczne przemianowanie historycznego pola partii, jeśli nie zagraża replayowi; w przeciwnym razie udokumentować nazwę historyczną i zakres.
- [ ] Pełny `npm run test:all`, build, strażnicy dokumentacji; aktualizacja planu, historii, handoffu i treści PR #179.
- [ ] Fetch/compare przed każdym pushem; CI i mergeability; bez force-push i bez scalania.

## Kryteria zakończenia

Każdy etap: RED→GREEN, mutacja, kontrole, pełne bramy, osobny commit i natychmiastowy push. Koniec dopiero po zamknięciu wszystkich etapów albo jawnej decyzji właściciela o zmianie zakresu.
