# PLAN 2026-09-03 — audyt PR #93 + naprawa rzutu modalnego z exile (sesja `arena/01a066d9-mtg`)

Prompt właściciela: „kontynuujemy projekt” → tryb domyślny ADR 0020/0021:
**PR na starcie → audyt ostatniego scalonego PR (#93) → naprawy u root cause →
pętla jakości**. Raport: `docs/audits/AUDYT_PR93_2026-09-03.md`.

## Pomiar startowy (wykonany przed kodowaniem)

- baza: `main` @ `83a9043` (squash PR #93, merged 2026-09-03T10:36Z);
- `npm test` (szybki rdzeń): **4276/4276 pass**, 0 fail (~152 s); drzewo czyste.

## Etap 1 — plan + raport audytu + PR (ADR 0020 A/B) ✅

- `docs/audits/AUDYT_PR93_2026-09-03.md` — 89 plików diffu przejrzane per plik;
  weryfikacja mutacyjna dwóch głównych napraw (§5 raportu);
- ten plan;
- **PR #94 otwarty przed pierwszą zmianą w kodzie.**

## Etap 2 — Znalezisko A: modalny rzut w oknie zdolności (Vaan)

Kryteria ukończenia:

1. **Test RED przed naprawą** (`test/audyt-pr93-modalny-rzut-z-okna.test.js`):
   - repro na REALNEJ karcie: Vaan (`decks/final-fantasy.txt`) wygania
     `aerith-rescue-mission` (modalna, 2 tryby, MV 4) → oferta MUSI zawierać
     rzut z wyborem trybu (dziś: tylko rezygnacja);
   - po rzucie: obiekt na stosie niesie `chosenMode`, koszt pobrany w całości
     (Vaan nie zwalnia z kosztu), trigger „you cast a spell you don't own”
     (liczniki +1/+1 na Scouty) nadal działa;
   - anty-over-fix: po rezygnacji karta NIE jest rzucalna później w turze
     (ruling WotC 2025-02-10 — to sedno naprawy z PR #93, nie wolno jej cofnąć);
   - strażnik klasy: skan katalogu — KAŻDY czar modalny (`spell.modes`)
     jest rzucalny z okna zdolności (syntetycznie, per karta).
2. **Naprawa (chirurgiczna):** `castSpell` przekazuje opcje do
   `castModalSpell`; `castModalSpell` zna `abilityWindowCast` (uprawnienie +
   ignorowanie timingu — mirror `requireSpell`); `outsideHandCastScope` dostaje
   jawny `allowModes` (okno zdolności: `true`).
3. **Odwrócenie testu cementującego odchyłkę**
   (`test/audyt-pr92-darmowy-rzut-zakres.test.js`, przypadek „mody odrzucone po
   obu stronach”) + komentarz, dlaczego poprzednia asercja była zgodna z kodem,
   a nie z Oracle (L5/L44).
4. Mutacje: (a) wycięcie `allowModes` z wywołań Vaana → RED; (b) powrót
   `castModalSpell` bez `abilityWindowCast` → RED; (c) przywrócenie stempla
   `playableUntilTurn` na karcie Vaana → RED testu anty-over-fix.

## Etap 3 — Znalezisko B: modalny darmowy rzut Discover (ta sama klasa)

Kryteria ukończenia:

1. **Test RED:** Discover trafia czar modalny → oferta zawiera wariant
   `castFree` **per tryb** (`modeIndex`), a rozstrzygnięcie stosu wykonuje
   efekt WYBRANEGO trybu (dziś: czar w ogóle nie jest w ofercie).
2. **Naprawa:** walidacja `modeIndex` w `resolve_discover_choice`, `chosenMode`
   na obiekcie stosu i w zdarzeniu `spell_cast` (rozstrzyganie już czyta
   `object.chosenMode` — spells.js:1669).
3. Mutacja: `chosenMode` nie doklejony do obiektu stosu → RED.

## Etap 4 — pętla jakości (ADR 0021 §4), jeśli zostanie budżet sesji

- kolejne polowanie na niezgodności z CR inną ścieżką niż poprzednie sesje
  (kandydat: pozostałe wyłączenia `outsideHandCastScope` — `additionalCost`,
  `xCost`, `fireball` — zmierzyć, czy któraś z nich jest osiągalna realną
  kartą w talii; jeśli tak, to ta sama odchyłka co A/B);
- Żywy Tester na zbudowanym artefakcie (`npm run build` — L76) dla ścieżek,
  których nie kryją testy: rzut modalny z exile na żywym stole.

## Kolejność commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. plan + raport audytu ✅ (PR #94 przed kodem)
2. Etap 2: test RED → naprawa → testy + mutacje (osobne commity per krok)
3. Etap 3: jw.
4. Dokumentacja: `docs/ENGINE_MILESTONES.md`, `docs/PROJECT_HISTORY.md`,
   `docs/LESSONS.md` (nowa lekcja tylko jeśli budżet lektury na to pozwala —
   patrz niżej), handoff, liczby w `README.md` **na koniec** (L92).

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- **Budżet lektury startowej jest niemal wyczerpany** (~99,84k / 100k;
  `test/dokumentacja-budzet-lektury.test.js`). Nowa lekcja w `docs/LESSONS.md`
  wymaga zwolnienia miejsca kondensacją innego wpisu (proza →
  `docs/LESSONS_PRZYPADKI.md`), **progu nie podnoszę** (L66).
- **L5/L44:** test z poprzedniej sesji może cementować odchyłkę od Oracle —
  odwrócenie takiego testu wymaga jawnego uzasadnienia w opisie commita.
- **L48:** oferta i walidacja to jeden filtr — każda zmiana zakresu w dwóch
  miejscach naraz (oferta `playerView` + bramka `execute`).
- **L8:** weryfikacja mutacyjna na własnych, jeszcze niecommitowanych
  poprawkach — kopia `cp`, nie `git checkout`.
- **L13:** każdy nowy test musi pokazać RED po cofnięciu naprawy.
- **ENVIRONMENT §2:** sandbox potrafi zresetować workspace — push po każdym
  zielonym kroku, przed `reset` robię `git diff > ~/backup.patch`.
