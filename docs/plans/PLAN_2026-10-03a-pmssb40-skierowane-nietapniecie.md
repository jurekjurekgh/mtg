# Plan PMSSB-40 — payoffy rzutu II: efekty skierowane i wymiar nietapnięcia (2026-10-03a)

Zadanie: kontynuacja pętli PMSSB (polecenie właściciela „kontynuuj z PMSSB").
Wejście: GRANICE z PMSSB-39 („dynamiczne X, efekty skierowane, `buff_attacking_creatures`
i vigilance Kulratha bez wyceny") + inwentarz kart z katalogu (sonda
`/tmp/pr/inwentarz-pmssb40.mjs`, 18 nóg triggerów rzutu/wejścia na 14 kartach).

## Diagnoza (POMIAR PRZED — sonda `/tmp/pr/probe-pmssb40-przed.mjs`)

| # | Scenariusz | Δ payoffu (PRZED) | Klasa |
|---|---|---|---|
| S1 | Molten Nursery + bezbarwny artefakt (`damage` z `requiresTarget: any_target`) | **0** | bramka `requiresTarget` pomija CAŁY trigger |
| S2 | Goblin Battle Jester + czerwony czar (`cant_block` z `requiresTarget: creature`) | **0** | jw.; wpis `cant_block` w tabeli ETB (`=> 2`) nie ma w katalogu ŻADNEGO konsumenta |
| S3 | Kulrath Mystic + czar MV≥4 (`buff_creature_until_end_of_turn` + `keywords: ['vigilance']`) | 7 (sam pump) | rider vigilance bez wyceny |
| S4 | Steelfin Whale (tapnięty) + artefakt (`untap_permanent` na nosicielu) | **0** | noga spoza `PAYOFF_TABLE_EFFECTS` |

## Model (reuse istniejących miar, L41/L48)

1. **Bramka `requiresTarget` przestaje pomijać trigger.** Wymóg celu JEDZIE do miary
   (`ETB_EFFECT_BONUS[typ](leg, view, req, def)`) — tak jak robi to `etbEnterBonusValue`
   dla triggerów wejścia; brak legalnego celu = 0 (nie kara).
2. **F1 `damage`**: ta sama liczba co ETB-obrażenia (Forge Devil, Reclusive Artificer —
   identyczny kształt „trigger zadaje N obrażeń celowi”): `min(3·N, 15)`.
3. **F2 `cant_block`**: MIARA ŚCIEŻKI RZUTU (`cantBlockRemovalValue`, okno
   „zadeklarowany atak ALBO przed atakiem w mojej głównej"), max po blokerach wroga —
   płaska 2 z tabeli ETB jest w katalogu martwa (L5).
4. **F3/F4 wymiar nietapnięcia** — jedna miara `untappedBodyDefense(host)` =
   `payoffUntappedBodyWeight × min(manaTapBodyMax, wytr. × manaTapBodyPerStat)`
   (reuse drabiny tapnięcia CIAŁA z PMSSB-32; obrona = wytrzymałość):
   - Kulrath: rider `vigilance` doliczany TYLKO gdy nosiciel realnie zaatakuje
     (polityka ataku bota — z dodanym świeżym słowem w symulowanym widoku) i nie ma
     go jeszcze (świeżość M431); po tapnięciu (okno walki) vigilance = 0 (CR 702.20
     nie odkręca atakującego);
   - Steelfin: untap na nosicielu → wartość TYLKO gdy nosiciel jest tapnięty
     (inaczej no-op = 0).
5. Nowe pokrętło: `payoffUntappedBodyWeight` (default 1; ×0 = stan sprzed zmiany).

## Granice (poza modelem, bez kart w katalogu)

-dynamiczne X, `buff_attacking_creatures`, `untap` na CUDZYM celu w triggerze rzutu
(midnight-guard jest poza listą zdarzeń payoffu), blokada wroga poza jedną szansą.

## Weryfikacja

Sonda PRZED/PO (te same 4 scenariusze), `test/audyt-pmssb40-skierowane-nietapniecie.test.js`
(piny czerwone na starym kodzie), mutacje, golden-master (`bot-scoring-snapshot`),
tie-audit PO, `npm test`, `run-tests all`, build. Raport w `docs/PMSSB.md` + rejestr.
