# PLAN 2026-11-04 — zgłoszenie C: Magma Pummeler nie marnuje refleksu

## Cel i kryterium właściciela

Bot wybiera cel, któremu obrażenia refleksu Magma Pummelera będą śmiertelne, uwzględniając obrażenia już zadane w walce. Jeżeli takiego celu nie ma, wybiera przeciwnika. Nie zmieniamy legalnych celów człowieka ani zasad silnika; nie dodajemy kart i nie rozpoznajemy karty po nazwie/identyfikatorze w sterowniku.

## Źródła i diagnoza do potwierdzenia RED

- Oracle i ruling VOW 2021-11-19: `docs/cards/scryfall-magma-pummeler.json` — „When one or more counters are removed from this creature this way, it deals that much damage to any target”; refleks działa także po śmierci źródła.
- CR 603.3d (cel przy ogłoszeniu), 608.2h (informacja efektu/LKI), 120.3e (oznaczone obrażenia), 704.5g (śmiertelność), 510.2–510.3a (jednoczesne obrażenia bojowe i wyzwalacze). Lokalny przypięty CR: `.arena/checkpoint/cr-raw.txt`, SHA-256 `8d860e45…b070ca`.
- Hipoteza z kodu: `resolveDamageAmount` obsługuje `amountFromContext`, ale oferta `resolve_trigger_target` nie przekazuje `pending.extra` jako kontekstu. Bez `cmd.damage` bot omija wspólną politykę obrażeń i wraca do rozmiaru celu. Sprawdzić to na realnej karcie i komendach, nie na syntetycznym pendingu.

## Etap 1 — RED i kontrakt kwoty

- [ ] Testy realnego Magma Pummeler + Shock: źródło przeżywa i ginie; oferta niesie liczbę zdjętych liczników, bot wybiera mniejszy cel śmiertelny zamiast największego, a przy braku śmiertelnego celu przeciwnika.
- [ ] Test prawdziwej walki: Magma blokuje, refleks dobija rannego napastnika z uwzględnieniem oznaczonych obrażeń; większy zdrowy stwór nie wygrywa rozmiarem. Wariant bez śmiertelnego celu kończy się na przeciwniku.
- [ ] Kontrole: wygrana obrażeniami w gracza, prewencja/niezniszczalność, własne cele, istniejący Warmaker/Molten Nursery i resolver `resolveDamageAmount`.

## Etap 2 — naprawa i weryfikacja

- [ ] Przekazać kontekst zdarzenia do wspólnego resolvera kwoty w ofercie (i LKI źródła, jeśli potrzebne). Jedno źródło prawdy dla oferty i rozstrzygnięcia; bez zmiany `damageTargetValue`, jeżeli istniejąca wspólna polityka spełnia kryterium.
- [ ] Mutacja usuwająca przekazanie kontekstu musi czerwienić nowe testy. Sprawdzić świadomy dryf golden-mastera; regeneracja tylko z opisem różnicy, nie „żeby było zielono”.
- [ ] Pokrewne testy, pełny `npm test` + `npm run build`, szybki benchmark oraz pomiar ukierunkowany na talię z Magma Pummeler (`kaldheim`), bez pełnego B0. Osobny commit i natychmiastowy push.

## Etap 3 — domknięcie

- [ ] Pełny `npm run test:all` przed zakończeniem, aktualizacja planu/historii/handoffu i opisu PR #179, fetch/compare przed każdym pushem, CI i mergeability.
- [ ] Bez scalania, force-push, nowych kart, pełnego B0 i eksperymentów `NIE_WDRAZAC`.

## Ryzyka

Nie mylić liczby zdjętych liczników z kwotą zapobiegniętych obrażeń ani z bieżącą liczbą liczników po śmierci źródła. Nie premiić pozornego śmiertelnego celu chronionego prewencją/niezniszczalnością. Nie zmieniać polityki czarów bojowych, które celowo łączą chip z blokiem; jeżeli wspólna polityka nie spełnia wymagania także w oknie walki, zawęzić zmianę do semantyki już wyzwolonego refleksu i udokumentować granicę.
