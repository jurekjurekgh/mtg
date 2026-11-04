# PLAN 2026-11-04 — zgłoszenie C: Magma Pummeler nie marnuje refleksu

## Cel i kryterium właściciela

Bot wybiera cel, któremu obrażenia refleksu Magma Pummelera będą śmiertelne, uwzględniając obrażenia już zadane w walce. Jeżeli takiego celu nie ma, wybiera przeciwnika. Nie zmieniamy legalnych celów człowieka ani zasad silnika; nie dodajemy kart i nie rozpoznajemy karty po nazwie/identyfikatorze w sterowniku.

## Źródła i diagnoza do potwierdzenia RED

- Oracle i ruling VOW 2021-11-19: `docs/cards/scryfall-magma-pummeler.json` — „When one or more counters are removed from this creature this way, it deals that much damage to any target”; refleks działa także po śmierci źródła.
- CR 603.3d (cel przy ogłoszeniu), 608.2h (informacja efektu/LKI), 120.3e (oznaczone obrażenia), 704.5g (śmiertelność), 510.2–510.3a (jednoczesne obrażenia bojowe i wyzwalacze). Lokalny przypięty CR: `.arena/checkpoint/cr-raw.txt`, SHA-256 `8d860e45…b070ca`.
- Hipoteza z kodu: `resolveDamageAmount` obsługuje `amountFromContext`, ale oferta `resolve_trigger_target` nie przekazuje `pending.extra` jako kontekstu. Bez `cmd.damage` bot omija wspólną politykę obrażeń i wraca do rozmiaru celu. Sprawdzić to na realnej karcie i komendach, nie na syntetycznym pendingu.

## Etap 1 — RED i kontrakt kwoty

- [x] Testy realnego Magma Pummeler + Shock: źródło przeżywa i ginie; oferta niesie liczbę zdjętych liczników, bot wybiera mniejszy cel śmiertelny zamiast największego, a przy braku śmiertelnego celu przeciwnika.
- [x] Test prawdziwej walki: Magma blokuje, refleks dobija rannego napastnika z uwzględnieniem oznaczonych obrażeń; większy zdrowy stwór nie wygrywa rozmiarem. Wariant bez śmiertelnego celu kończy się na przeciwniku.
- [x] Kontrole: wygrana obrażeniami w gracza, prewencja/niezniszczalność, własne cele, istniejący Warmaker/Molten Nursery i resolver `resolveDamageAmount`.

## Etap 2 — naprawa i weryfikacja

- [x] Przekazać kontekst zdarzenia do wspólnego resolvera kwoty w ofercie (i LKI źródła, jeśli potrzebne). Jedno źródło prawdy dla oferty i rozstrzygnięcia; bez zmiany `damageTargetValue`, jeżeli istniejąca wspólna polityka spełnia kryterium.
- [x] Mutacja usuwająca przekazanie kontekstu musi czerwienić nowe testy. Sprawdzić świadomy dryf golden-mastera; regeneracja tylko z opisem różnicy, nie „żeby było zielono”.
- [x] Pokrewne testy (95/95, golden-master bez dryfu), pełny `npm test` 9970/9970 + `npm run build` 77 modułów / 5691.7 kB. Mutacja kontekstu: 0/6. Szybki benchmark i pomiar ukierunkowany (`kaldheim`) — w etapie 3, bez pełnego B0.

## Etap 3 — domknięcie

- [x] Pełny `npm run test:all` **10238/10238** (585,4 s), build **77 modułów / 5691,7 kB**; aktualizacja planu/historii/handoffu i opisu PR #179, fetch/compare przed każdym pushem. CI i `mergeable_state` potwierdzone w opisie PR po pushu.
- [x] Bez scalania, force-push, nowych kart, pełnego B0 i eksperymentów `NIE_WDRAZAC`.

## Pomiar RED → GREEN

Sonda `.arena/checkpoint/c-magma-probe.mjs` (realne karty i komendy):

| Scenariusz | PRZED (wybór / `damage`) | PO (wybór / `damage`) |
|---|---|---|
| Shock, Magma 3 liczniki, wrogie 2/1 i 6/7 | big / brak | small / 2 |
| Shock, Magma 1 licznik (źródło ginie), 1/1 i 6/7 | big / brak | small / 1 |
| Walka: Magma 3 liczniki blokuje 5/5 (ranny 3), 6/7 | big / brak | att / 3 |
| Walka: Magma 2 liczniki blokuje 5/5 (ranny 2), 6/7 | big / brak | p2 / 2 |

Testy `test/zgloszenie-c-magma-lethal.test.js`: RED 0/6 → GREEN 6/6; mutacja (usunięcie kontekstu z resolvera oferty) 0/6. Naprawa wyłącznie w ofercie `resolve_trigger_target` (`game-state.js`): kontekst `pending.extra` + LKI źródła, bez zmiany `damageTargetValue` i bez rozpoznawania nazwy karty.

Benchmark ukierunkowany `kaldheim` vs `kaldheim`, heuristic–aggro, 8 seedów (16 meczów, lustrzanie): PRZED 75,0 % heuristic (12/16), PO 75,0 % (12/16) — mała próbka, bez regresji; zmiana zachowania potwierdzona scenariuszami C/1–C/6, nie win-rate. Pełny B0 nieuruchamiany.

## Ryzyka

Nie mylić liczby zdjętych liczników z kwotą zapobiegniętych obrażeń ani z bieżącą liczbą liczników po śmierci źródła. Nie premiić pozornego śmiertelnego celu chronionego prewencją/niezniszczalnością. Nie zmieniać polityki czarów bojowych, które celowo łączą chip z blokiem; jeżeli wspólna polityka nie spełnia wymagania także w oknie walki, zawęzić zmianę do semantyki już wyzwolonego refleksu i udokumentować granicę.
