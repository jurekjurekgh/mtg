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

## Etap 3 — domknięcie migracji (w toku; korekta po audycie kodu)

Wcześniejsze oznaczenie tego etapu jako wykonanego było przedwczesne. Zielone bramy na `3fcf1b6` potwierdziły zgodność istniejących testów, ale nie zamknięcie architektury: `accepted()` nadal uruchamia osobny `startMadnessTriggerOrder`, a test A28 wymaga celu refleksu przed wyborem kolejności. To nie dowodzi wspólnej kolejności ogłoszeń z CR 603.3b–d. Pomiar przed korektą: `test:all` **10228/10228** (593,2 s), build **77/5691,2 kB**, dokumenty **25/25**; CI `a0f1616` **41904813668 success**, PR bez konfliktów. Nie jest to dowód ukończenia migracji.

### 3a. Madness i refleksy w jednej partii (wykonana)

- [x] Nowy RED na prawdziwych kartach i komendach: Talion's Messenger + Revolutionist, dwa legalne cele refleksu. Po odrzuceniu najpierw wspólny wybór kolejności, dopiero potem cel wybranej zdolności; obie kolejności, brak dubli, replay/fingerprint. Oracle: lokalne definicje `talions-messenger`, `revolutionist`; CR 603.3b–d/603.12 (ponownie pobrany CR, SHA-256 `8d860e45…b070ca`).
- [x] Przekazać identyfikatory z `madnessBatchTriggerIds` do wspólnego checkpointu razem z oczekującymi celami/trybami. Usunąć równoległe uruchamianie kolejności madness; zachować bufor, gdy rozstrzyganie jeszcze trwa. Nie emitować ponownie zdarzeń ani wpisów stosu.
- [x] Mutacja przywracająca blokadę kolejki przez decyzję celu oblewa oba nowe testy (`.arena/checkpoint/madness-mutation.log`); kontrole: A28 + nowy test **15/15**, `test:audit` **724/724**, fast **9962/9962**, build **77/5691,1 kB**; osobny commit i push. Usunięto równoległy `startMadnessTriggerOrder`; kolejka madness nie jest już blokowana przez oczekujący cel/tryb tej samej partii.

### 3b. Domknięcie pętli i nazw

- [ ] Sprawdzić na prawdziwych kartach powtórne SBA po ogłoszeniu wyzwalaczy (Saga/token/aura), bez pomijania decyzji gracza i bez przesuwania istniejących wpisów. Naprawić tylko potwierdzoną lukę RED→GREEN.
- [ ] Poprawić komentarz `placeTriggerBatchInApnapOrder`: APNAP zachowuje kolejność wewnątrz kontrolera; właściwy wybór oferuje checkpoint. Historyczne `pendingDeathTriggerBatch`/`deathBatch` pozostają nośnikiem do osobnej migracji nazw, chyba że bezpieczne przemianowanie jest częścią tego etapu.

### 3c. Dowody i dokumentacja końcowa

- [ ] Pełny `npm run test:all`, build i strażnicy dokumentacji na zamrożonym drzewie; osobny commit i push.
- [ ] Zaktualizować plan, historię, handoff i opis PR #179; fetch/compare przed każdym pushem, sprawdzić CI i mergeability. Bez force-push, scalania, nowych kart, pełnego B0 i eksperymentów `NIE_WDRAZAC`.

## Kryteria zakończenia

Każdy etap: RED→GREEN, mutacja, kontrole, pełne bramy, osobny commit i natychmiastowy push. Koniec dopiero po zamknięciu wszystkich etapów albo jawnej decyzji właściciela o zmianie zakresu.
