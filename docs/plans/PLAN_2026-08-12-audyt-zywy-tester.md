# Plan: audyt rozgrywki żywym testerem stołu (M80)

Sesja `arena/019ff818-mtg`. Zlecenie właściciela: wykorzystać Żywy Tester
(`tools/table-tester/run-game.mjs`, `docs/setup/TESTER_STOLU.md`), wcielić
się w rolę gracza, rozegrać partie na prawdziwym artefakcie
(`dist/mtg-table.html`) przeciwko botowi różnymi taliami, obserwować co
wyświetla stół (etykiety, modale, log, zachowanie bota, efekty, stos, tury)
i **znaleźć ≥15 błędów/niejasności/uproszczeń**, po czym je naprawić.

## Metoda

1. `npm run build` (artefakt) + `npm i` w `tools/table-tester`.
2. Rozegrane partie (człowiek–bot, różne talie/seedy):
   - green vs red, tokens vs spellslinger, innistrad vs wiedzmin,
     azorius vs black, spellslinger vs green, black vs azorius,
     graveyard vs tokens, red vs green.
3. Rozszerzony tester (własna zmiana narzędzia):
   - loguje treść modala „Ruch przeciwnika” (`bot-move`) — wcześniej tylko
     go zamykał;
   - deklaruje BLOKI w wizardzie (wcześniej klikał „Zatwierdź bloki” bez
     zaznaczania blokerów, więc człowiek NIGDY nie blokował i nie było
     widać walki stwór–stwór).
4. Obserwacje zapisane w `tools/table-tester/audyt-m80-green-vs-red.txt`.

## Znalezione błędy / niejasności (16) i ich naprawy

### Modal „Ruch przeciwnika” (session.js)
1. **„Brak ataku” = szum.** Gdy przeciwnik nie atakuje, modal pokazywał
   „Faza: Deklaracja atakujących / Brak ataku”. Pusta lista atakujących nie
   zasługuje na pauzę. Fix: pomijamy `attackers_declared` bez atakujących.

### Etykiety wyborów (render.js `commandLabel`)
2. **Szukanie w bibliotece — nie do odróżnienia.** Wszystkie opcje wyglądały
   jak „Szukanie w bibliotece” (bez karty). Fix: `resolve_search_choice`
   pokazuje nazwę znalezionej karty albo „nie znajduj karty (rezygnuję)”.
3. **Mulligan — „nowa ręka 7 kart”.** London mulligan dobiera 7 i odkłada N
   na spód; finalna ręka to 7−N, a tekst mówił „nowa ręka 7 kart”. Fix:
   „dobierz 7 kart i odłóż N na spód (zostanie 7−N)”.

### Opisy efektów (render.js)
4. **Reclusive Artificer — „za każdy twój artefakt obrażeń”.** Dynamiczne
   obrażenia (`artifacts_you_control`) były łamane gramatycznie. Fix:
   „zada tyle obrażeń, ile artefaktów kontrolujesz” (`DYNAMIC_AMOUNT_NOUNS`).
5. **Tumbleweed Rising — surowy slug.** Kafel czaru pokazywał
   `Stwórz greatest_power_you_control/greatest_power_you_control Elemental`
   (kod w UI). Fix: `dynamicPt()` → „X (największa twoja moc)”.

### Opisy triggerów (render.js `describeTriggered`) — surowy „Trigger <event>”
6. **Landfall** (Skyclave Geopede) → „Landfall — gdy land wchodzi pod twoją
   kontrolą”.
7. **land_entered_under_opponent_control** (Nightshade Harvester) → „Gdy land
   wchodzi pod kontrolą przeciwnika”.
8. **end_step** (Frontline War-Rager, Canonized in Blood) → „Na początku kroku
   końca (gdy kontrolujesz N+ zatapnięte stwory)”.
9. **exploits** (Silumgar Butcher, Gurmag Drowner) → „Gdy ten stwór
   exploituje”.
10. **aura_host_targeted_by_spell** (Spectral Prison) → „Gdy zaczarowany stwór
    staje się celem czaru”.
11. **you_cast_second_spell_each_turn** → „Gdy rzucisz drugi czar w turze”.
12. **you_cast_noncreature_spell** → „Gdy rzucisz czar niebędący stworem”.
13. **turned_face_up** (Willbender) → „Gdy ten stwór zostanie odwrócony twarzą
    do góry”.
14. **noncombat_damage_to_opponent** (Fear of Burning Alive) → czytelny opis
    delirium.
15. **Celowany ETB z obrażeniami** (Forge Devil) → „Gdy wejdzie na bitwisko:
    zada 1 obrażenie celowi i 1 obrażenie kontrolerowi” (zamiast „1 obrażenie,
    1 obrażenie kontrolerowi”).

### Wizard obrażeń (choice-request.js)
16. **Angielskie „lethal”** w polskim UI → „śmiertelne N”.

## Kolejność commitów

1. (z poprzedniej części sesji) Jill/Shiva — już zrobione.
2. `fix(table): audyt M80 — opisy triggerów/efektów, mulligan, szukanie, śmiertelne, dynamiczne P/T`
3. `test(table): regresje audytu M80`
4. `chore(tester): żywy tester — loguje „Ruch przeciwnika” i deklaruje bloki`
5. `docs: M80 audyt żywym testerem`

## Weryfikacja

- `npm test` zielone (1413 → 1421).
- `npm run build` 50 modułów / ~1535 kB.
- Bot bez zmian → pełne B0 niewymagane.

## Wykonanie (2026-08-12)

- [x] Rozegrane partie wieloma taliami; transkrypt w `tools/table-tester/`.
- [x] Tester rozszerzony (log bot-move + bloki).
- [x] 16 błędów naprawionych u root cause + regresje.
- [x] `npm test` 1421/0, `npm run build`.
