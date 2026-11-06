# HANDOFF 2026-11-06 — audyt scalonego PR #179 (Mapa: 223/223, 0 otwartych)

## Stan

- Gałąź `arena/8df1ec4d-mtg`, PR #180 (otwarty, niewysyłany do scalenia). PR audytowany: **#179** (merge `7a18659`, HEAD `main`), baza `04ca8e9`; PR #179 miał 223 pliki, 126 commitów, +10 872/−1 445.
- Uzasadnienie kolejności: ADR 0020 (audyt poprzedniego scalonego PR przed nową pracą). Zakres = **przegląd diffu #179**, nie pełna reinkarnacja silnika i nie dowód wszystkich interakcji; bez nowych kart (ADR 0029), bez pełnego B0 (ADR 0018), bez scalania i bez force-push.
- Plan: `docs/plans/PLAN_2026-11-06-audyt-pr179.md` (Etapy 1–5 domknięte). Mapa: `docs/audits/PR179_MAPA_PLIKOW_2026-11-06.md` — **na ten moment jest zamknięta i spójna z drzewem**.

## Znaleziska i naprawy

- **A-1 (błąd silnika, CR 508.3d)** — `attacks_you_control` odpalał się RAZ NA ATAKUJĄCEGO. Naprawa u root cause: skan raz na `attackers_declared` (dowolny permanent atakującego gracza, zero atakujących → brak triggera, kopia przeciwnika odrzucona kontrolerem). Osobne `attacks` (per atakujący, zdolności na atakującym obiekcie) nietknięte. RED `160316b` → GREEN `ecec534`; mutacje (M1–M3) złapane przez piny; nowy strażnik `test/audyt-pr179-attacks-you-control.test.js` (5 pinów, kotwica = Living History, Oracle z `docs/cards/scryfall-living-history.json`). Etykieta UI „twój atak".
- **A-2 (komentarze stale po zgłoszeniu G)** — twierdzenia „enumeracja W PEŁNI / kompletna po zniesieniu cap" w `game-state.js`, `combat.js`, `spells.js` (×3), `choice-request.js` dociągnięte do modelu ziarna + deskryptor + pełna walidacja przy `execute` (commit 40e0873); potrójny doc Fireballa i nagłówki escape/delve poprawione (commit 9615133). ENGINE_MILESTONES M463 i `PLAN_2026-11-06c-pmssb72.md` dostały **adnotację** poprawki A-1 — historia nieprzepisywana (projektowa zasada: adnotacja, nie falsyfikacja).
- Tabela zweryfikowanych cytatów CR (`test/helpers/cr-numery-tabela.js`) zregenerowana narzędziem na zakotwiczonym wydaniu CR 2026-09-25 (sha256 `8d860e45…` — ponownie pobrane 2026-11-06 z `nwgarne/mtg-data`, bajtowo zgodne): dodany `508.3d`; dwa odręczne komentarze adnotacyjne przywrócone. Strażnik cytatów zielony.
- Probe PMSSB-72/3 (`tools/pmssb72-batch72-sonda.mjs`) dostosowana do przepływu pojedynczego triggera (teraz decyzja celu otwiera się wprost; partia `resolve_trigger_order` tylko przy checkpoint partii). Piny PMSSB-72 zachowane; pełny pakiet zielony.
- Lekcja **L191** dopisana (`docs/LESSONS.md` + `docs/LESSONS_PRZYPADKI.md`).

## Bramy (po naprawkach, na drzewie z sesji)

- `npm test`: **10 065 pass / 0 fail / 0 skip** (baza `7a18659`: 10 060).
- `npm run test:all`: **10 333 pass / 0 fail / 0 skip**.
- `npm run build`: **78 modułów / 5 759,0 kB**.
- Szybki benchmark NIE był uruchamiany (brak decyzji właściciela; ADR 0018).

## Zdarzenie CI po pushu b0d0495 — strażnik budżetu lektury

- Pierwszy push `b0d0495` z dokumentacją sesji **OBLAŁ CI** (`run-tests.mjs all`): strażnik `test/dokumentacja-budzet-lektury.test.js` (AGENTS.md §0, limit 100k tokenów) — mój wpis L191 rozsadził budżet (z ~99,99k do ~100,4k). Lokalnie `npm test` tego NIE pokazał (strażnik jest w `tools/test-manifest.json` slow) — bramą PR jest `test:all`, nie `npm test`.
- Zadanie obowiązkowe wg tekstu strażnika: kondensowanie, nie podnoszenie progu. Wykonane: L191 skrócony do kotwicy z faktami; L187 wyniesiony do archiwum rejestru (proza i tak mieszkała w `LESSONS_PRZYPADKI.md`); próg NIETKNIĘTY; suma ~**99,996k** tokenów; `docs-decisions.test.js` zielony. Strażnik CR i mapa/historia/handoff bez zmian.
- Lekcja do zapamiętania: po zmianach w dokumentacji OBOWIĄZKOWO uruchamiać `npm run test:all` lokalnie (albo przynajmniej `test/dokumentacja-budzet-lektury.test.js`), nie polegać na samym `npm test`.

## Granice i co NIE jest dowiedzione

- Audyt = przegląd diffu #179 (z kotwicami CR 508.3d / claims dokumentów / testami behaviouralnymi). Nie dowodzi poprawności całego katalogu kart ani wszystkich interakcji — w szczególności nie weryfikowała się od nowa legalność i wycena 702 kart poza diffem.
- Golden-master `bot-scoring-snapshot` nie był regenerowany (dryf był świadomie zatwierdzony w #179 z notami); po naprawie A-1 wybrana trajektoria bota NIE zmienia się (Living History odpala raz — a snapshot pinuje WYBRANE komendy, nie liczbę triggerów; pakiet przechodzi bez zmian).
- Obserwacje zapisane, CELOWO nienaprawiane (poza zakresem audytu, decyzje właściciela lub osobne batche): (1) `restrictedPool` (Powerstone) — many celowej można wydawać na nie-artefaktowe cele (legacy, przypięte testami; kandydat na pytanie właściciela); (2) `pendingDamageDivision.deathBatchSlotId` poza fingerprintem (niecelowe, bez wpływu); (3) `commandForXSelection` konstruuje komendy spoza oferty z wyceną nadmiarową — świadoma konsekwencja „konstruuj + waliduj", silnik waliduje.

## Następny krok (po pushu)

- Zgodnie z ADR 0020: kolejny scalony PR po #180 → audyt #180, potem pętla jakości. Właścicielowi zostają decyzje: czy (1) wprowadzić `limitations` dla Powerstone-wariantu, (2) pełny B0 przy okazji następnego batche'a, (3) czy sesja #180 ma być scalona.
- Po scaleniu #180: aktualizować wiersze CI w opisie PR (jak w #179).
