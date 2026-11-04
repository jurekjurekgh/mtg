# PLAN 2026-11-04 — wspólny checkpoint wyzwalaczy

## Cel

Wdrożyć pełny wspólny checkpoint wszystkich typów zdarzeń zgodnie z ADR 0032: zdarzenia/LKI w chwili zdarzenia, kolejność APNAP i wybór kontrolera, cele/tryby/podziały przy ogłoszeniu, Ward jako drugi przebieg, pętla SBA→triggery→SBA przed priorytetem. Nie dodajemy kart, nie uruchamiamy pełnego B0, nie wdrażamy `NIE_WDRAZAC`, nie scalamy PR.

## Źródła i reprodukcja startowa

- Przypięty CR: `.arena/checkpoint/cr-raw.txt`, SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`; CR 117.5, 603.3b–d, 603.12, 704.3–704.4.
- Oracle lokalne: `docs/cards/scryfall-impact-tremors.json` („Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.”), `docs/cards/scryfall-loporrit-scout.json` („Whenever another creature you control enters, this creature gets +1/+1 until end of turn.”), `docs/cards/scryfall-highland-game.json` (nośnik wejścia).
- RED: `.arena/checkpoint/etb-order-red.test.js` — po wejściu Highland Game silnik nie oferuje `resolve_trigger_order` dla Impact Tremors/Loporrit Scout; oczekiwane dwie oferty i możliwość odwrócenia kolejności. Log: `.arena/checkpoint/etb-order-red.log`.

## Etap 1 — zwykłe wyzwalacze wszystkich typów (wykonany)

- [x] Przenieść reprodukcję ETB do `test/` jako czerwony test na realnych kartach i komendach.
- [x] Uogólnić partię poza listę śmierć/odejście/obrażenia: każdy zwykły trigger okna, bez względu na typ celu, `count`, `allowNone`, `fixedTargetIds`, `specOverride`.
- [x] Zachować odroczenie płatności i Ward jako drugi przebieg; nie dublować wpisów stosu.
- [x] Dodać wybór kolejności wewnątrz kontrolera dla ETB/innych zdarzeń; skorygować M382/D, który pinował kolejność wykrycia zamiast wyboru (CR 603.3b).
- [x] Mutacja usuwa poprawkę (3/7 fail w `.arena/checkpoint/etb-mutation.log`); kontrole: `test:audit` 724/724, fast **9959/9959**, build; osobny commit i push. Poprawiono M382/D i A75 (Ward czeka, nie wyklucza partii) oraz helpery drenujące nowe oferty kolejności.

## Etap 2 — modalność, podziały i pętla SBA (wykonany)

- [x] Włączyć modalne triggery i podział obrażeń do tej samej partii; decyzje w kolejności ogłoszenia, bez priorytetu pomiędzy.
- [x] Dodać powtórne SBA po ogłoszeniu partii/Ward i nową partię, jeśli powstały nowe wyzwalacze; zachować bramki rozstrzygania/płatności.
- [x] Zachować madness/devour/Saga bez podwójnych wpisów: istniejące domknięcie madness (`madnessBatchTriggerIds`) i kolejność A28 pozostały, exploit/Saga przechodzą kontrole; checkpoint nie dubluje wpisów. bez podwójnych wpisów i bez ukrywania istniejących wpisów.
- [x] Mutacja modalna oblewa nowy test (`.arena/checkpoint/modal-mutation.log`); kontrole: `test:audit` 724/724, fast **9960/9960**, build; osobny commit i push. Świadoma regeneracja golden-mastera bota (tylko ravnica-wur|innistrad-wu@1001: 298→299 decyzji).

## Etap 3 — domknięcie i dokumentacja (wykonany)

- [x] Bez ryzykownego przemianowania w tym przyroście: historyczne pole `pendingDeathTriggerBatch` / flaga `deathBatch` pozostają nośnikiem partii, a zakres „wszystkie zwykłe wyzwalacze” jest udokumentowany w ADR 0032, komentarzach i tym planie. Ewentualne przemianowanie wymaga osobnej migracji replay/fingerprint.
- [x] Pełny `npm run test:all` **10228/10228** (593,2 s), build **77 modułów / 5691,2 kB**, strażnicy dokumentów **25/25**; aktualizacja planu, historii, handoffu i treści PR #179.
- [x] Fetch/compare przed każdym pushem; bez force-push i bez scalania. CI i mergeability weryfikowane po pushu w PR #179 (wiersz CI w treści PR).

## Kryteria zakończenia

Każdy etap: RED→GREEN, mutacja, kontrole, pełne bramy, osobny commit i natychmiastowy push. Koniec dopiero po zamknięciu wszystkich etapów albo jawnej decyzji właściciela o zmianie zakresu.
