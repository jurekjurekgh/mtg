# PLAN 2026-08-22 — M180: pętla jakości Żywym Testerem (Batch 41/42 + nowe talie)

Zlecenie właściciela: audyt Żywym Testerem po M177 (Batch 42) i M178
(rewolucja talii) — nowe talie mogą dać nowe sprzężenia.

UWAGA (9. lekcja o resetach): pierwotny przebieg M180 przepadł w 8. resecie
workspace ZANIM został scommitowany — naprawy Z1–Z5 odtworzone z notatki
właściciela (zachował treść podsumowania), transkrypty wygenerowane od nowa
(g1–g7 przed naprawami, v3-g1…v3-g7 po naprawach i rebuildzie).

## Kroki

- [x] 1. Partie Żywym Testerem na parach pokrywających Batch 41/42 i worki.
- [x] 2. Naprawy zgłoszeń (Z1–Z5) + testy RED→GREEN.
- [x] 3. REBUILD artefaktu + powtórki v3 = 0 zgłoszeń.
- [x] 4. Dokumentacja + PR.

## Wynik

7 partii bazowych (g1–g7; pary: ravnica/innistrad, tarkir/dominaria,
worek-mroczny/worek-dziki, worek-basni/warhammer, mirrodin/worek-legend,
innistrad/worek-basni, dominaria/worek-mroczny), zgłoszenia w 5 klasach;
po naprawach 7 powtórek (v3-*.txt) = **0 zgłoszeń**. Pułapka procesu:
tester gra na ZBUDOWANYM artefakcie — weryfikacja wymaga `npm run build`
po naprawach.

- **Z1 [rules, L48/L4]:** Seer's Lantern — regresja M179/D: własna mana
  źródła liczyła się w ofercie jego zdolności z {T} („{2},{T}: Scry 1”),
  płatność padała. manaForActivation/colorExcludeId/preExcludeId liczą
  teraz z wykluczeniem KAŻDEGO źródła tapowanego kosztem (nie tylko landów).
- **Z2 [ui]:** widok niesie `isToken` jawnie (render rozpoznawał tokeny po
  fladze, której playerView nie wysyłał — „token_squirrel” w celach)
  + obrona w głąb po cardId `token_*`.
- **Z3 [info]:** „dostaje” w DRUGA_OSOBA („Ty dostaje +1 licznik poison”).
- **Z4 [ui]:** grupa Halo Foragera („Wartość X”) wyciszalna
  (OPTION_IGNORABLE_TYPES — JEDNA lista dla panelu akcji i modala) +
  fallback w advance(): wyciszona blokująca decyzja opcjonalna wykonuje
  wariant decline zamiast klinować auto-pass wyjątkiem; czysta rezygnacja
  (decline/skip) nie liczy się jako realna decyzja.
- **Z5 [noop]:** effectIsNoOpOnTarget — powtórny becomes_subtype (Krotiq
  Nestguard) i Dragon Arch bez wielokolorowego stwora w ręce nie są
  oferowane (precedens M103/M104: chowamy no-op, nie ostrzegamy — test
  M126/#2 zaktualizowany).

Testy: test/m180-petla-jakosci.test.js (5) + Z1 w m179 (17).
