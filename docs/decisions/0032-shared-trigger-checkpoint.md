# ADR 0032: Wspólny checkpoint ogłoszeń wyzwalaczy

- **Status:** Zaakceptowana
- **Data:** 2026-11-04
- **Decydenci:** właściciel, agent audytowy

## Kontekst

ADR 0031 wprowadził tożsamość zdarzenia i partię wyzwalaczy, ale jawnie nie był pełnym checkpointem. Obecna partia (`pendingDeathTriggerBatch`) obejmuje głównie śmierć/odejście/obrażenia bojowe i wąskie cele; nie pyta o kolejność własnych wyzwalaczy wejścia na pole bitwy ani innych zwykłych zdarzeń. CR 603.3b wymaga wyboru kolejności wewnątrz gracza, a CR 117.5/704.3 — pętli akcji stanowych i wyzwalaczy przed priorytetem.

## Decyzja

1. Checkpoint jest wewnętrzną fazą `accepted()` po zamknięciu instrukcji/płatności, a przed nadaniem priorytetu. Nie dodajemy nowej publicznej komendy; używamy `resolve_trigger_order`, `resolve_trigger_target`, `resolve_modal_choice`, `resolve_damage_division`.
2. Zdarzenia i ostatnia znana informacja powstają w chwili zdarzenia. Cele, tryby, podziały obrażeń i kolejność ogłaszamy dopiero w checkpoincie; nie wolno ukrywać ani dublować wpisów już utworzonych na stosie.
3. Jedna partia checkpointu obejmuje wszystkie zwykłe wyzwalacze okna, niezależnie od typu zdarzenia i specyfikacji celu. Grupy idą APNAP; wewnątrz gracza kontroler wybiera kolejność. Refleksy CR 603.12 należą do pierwszej partii.
4. Ward z ogłoszenia celów tworzy drugi przebieg ogłoszenia nad zwykłą partią. Po każdym przebiegu akcji stanowych i ogłoszeń sprawdzamy SBA ponownie; pętla kończy się dopiero, gdy nie ma nowych SBA ani wyzwalaczy.
5. Płatności pozostają odroczone: zdarzenia/znaczniki od razu, stos/cele po zamknięciu; mana dozwolona przy żądaniu zapłaty (CR 605.3a/608.2g). Madness, devour, Saga i grupowa tożsamość A110–A113 zachowują swoje znaczniki i nie tworzą podwójnych wpisów.
6. Migracja etapowa: historyczne pole `pendingDeathTriggerBatch` pozostaje nośnikiem partii do czasu osobnego, mechanicznego przemianowania; zakres partii przestaje być „śmiercią”. Fingerprint/replay obejmują partie, wybory, cele, tryby, podziały i Ward.

## Konsekwencje

Więcej jawnych decyzji i pętla SBA/triggery przed priorytetem. Koszty: stan, oferty, bot, replay/fingerprint, testy kolejności. Ryzyko: duble, utrata LKI, regressje płatności i Ward; dlatego każdy etap ma RED, mutację, kontrole i pełne bramy.

## Rozważane alternatywy

Dalsze lokalne listy typów zdarzeń odrzucone: nie realizują CR 603.3b/117.5. Pełna wymiana silnika odrzucona jako zbyt ryzykowna; przyjmujemy wspólny checkpoint na istniejących kolejkach.

## Powiązania

ADR 0002/0005/0016/0020/0030/0031; plan `../plans/PLAN_2026-11-04-wspolny-checkpoint.md`; CR 117.5, 603.2–603.3d, 603.12, 605.3a/605.4a, 608.2g, 704.3–704.4.
