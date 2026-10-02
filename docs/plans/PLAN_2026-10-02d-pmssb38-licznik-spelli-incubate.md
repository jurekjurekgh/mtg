# Plan PMSSB-38 — licznik czarów w widoku bota i wycena incubate (2026-10-02d)

Pytanie właściciela po PMSSB-37: „czemu bot nie widzi licznika czarów? może powinien widzieć — możesz to dodać. I czemu nie wyceniasz incubate?”.

## Diagnoza

- **Licznik czarów.** Silnik trzyma `spellsCastThisTurnByPlayer` i czyta go w triggerze „your second spell each turn” (`triggers.js`), ale `playerView` go nie wystawiał (obok jest `landEnteredThisTurn`). To luka kontraktu widoku (ADR 0017), nie decyzja projektowa — informacja jest jawna (czary przechodzą przez stos i log).
- **Incubate.** Brak klucza w `ETB_EFFECT_BONUS`, w pętli efektów czaru i w liście payoffów. Dotyczy dwóch kart: Tiller of Flesh (trigger „spell that targets a permanent”) i Merciless Repurposing (exile + incubate 3).

## Kroki

1. `playerView.spellsCastThisTurn` (własny licznik widza) — ta sama liczba, którą czyta silnik.
2. `incubateValue` = `10·N − 2·creatureManaCostWeight` (ciało N/N jak `tokenBodyValue`, minus koszt przemiany {2}); wpięte do `ETB_EFFECT_BONUS`, do wyceny czaru i do `PAYOFF_TABLE_EFFECTS`.
3. `boardCastPayoffValue`: zdarzenia `you_cast_second_spell_each_turn` (rzut jest drugim, gdy `spellsCastThisTurn === 1`) i `you_cast_spell_targeting_permanent` (cel = permanent na polu; gracz i własny rzut nosiciela nie liczą się).
4. Testy `test/audyt-pmssb38-licznik-spelli-incubate.test.js` czerwone na starym kodzie, golden-master, `run-tests all`, build.

## Granice

Payoffy z TYMCZASOWYM efektem (Jeskai Devotee: pump do końca tury; prowess) wymagają prognozy walki, nie miary wartości trwałej — poza zakresem. „Drugie dobranie w turze” (Jolrael) — inny licznik.
