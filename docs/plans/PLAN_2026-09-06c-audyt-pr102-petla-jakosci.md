# PLAN 2026-09-06 (sesja 01a078a2) — audyt PR #102 + pętla jakości

Sesja: gałąź `arena/01a078a2-mtg`, 1 sesja = 1 gałąź = 1 PR (ADR 0013/0020).
Start: `main` = `dfbc39f` (squash merge PR #102, 46 plików w PR, diff silnikowy
`git diff 6ce4cab dfbc39f` = 44 pliki, +3388/−84), `npm test` **4567/4567**
(zmierzone na starcie), `npm run build` 59 modułów / 3344,7 kB (zmierzone).

## Zakres

1. **Audyt poprzedniego PR (ADR 0020 B)** — PR #102 „Batch M309–M321: kreator
   pozycyjny, station scoring, Veiled Ascension/cloak, etykiety, triki bota\" →
   wynik w `docs/audits/AUDYT_PR102_2026-09-06.md`, naprawy u root cause.
2. **Pętla jakości (ADR 0021 4)** — Żywy Tester na ścieżce innej niż PR #100–#102
   + polowanie na niezgodność z CR inną metodą niż w poprzednich sesjach.
3. **Bez nowych kart** (ADR 0021 4c, ADR 0029) — tam, gdzie trzeba karty-sondy,
   wchodzi karta syntetyczna w pliku testu. Pełny B0 tylko na jawną komendę
   właściciela (ADR 0018/0025).

## Etapy (kolejność commitów)

### E1. Audyt PR #102 → `docs/audits/AUDYT_PR102_2026-09-06.md`
Kryterium: każdy zmieniony plik źródłowy diffu `6ce4cab..dfbc39f` przeczytany;
każde znalezisko ma cytowany tekst Oracle/ruling albo wynik sondy (L13:
udowodnione mutacją, nie opisem); nie-narzeczenia zapisane z dowodem, żeby
nikt ich nie powtarzał. Wynik: 7 znalezisk (F1–F7) + 5 zamkniętych tropów.

### E2. Naprawy potwierdzonych znalezisk — jeden fix = jeden commit
Kryterium: po każdym commicie `npm test` + `npm run build`; fix u root cause,
bez maskowania (ADR 0016); test RED przed naprawą (L13).

- [ ] F1 (bot, rodzina M317): widoczny pump blokerza liczony w dwóch
      bliźniaczych miejscach ze statami SUROWYMI (wyliczenie first-strike
      z trikiem deathtouch, gałąź stwora pożyczonego).
- [ ] F2 (bot, rodzina M320): podatek ward tylko dla 8 typów komend; okna
      darmowego rzutu (`resolve_*_cast`) i `cast_adventure_creature` rzucają
      czar z celem → silnik odpala ward, bot nie. Zestaw typów ma być
      WYPROWADZONY z `COMMAND_TYPES`, nie wyliczany ręcznie.
- [ ] F3 (engine, fingerprint): `cloakReady` i `ward` poza odciskiem stanu —
      dwa stany różniące się tylko nimi mają identyczny fingerprint (sonda
      „oferta bez skutku\" ślepa, replay ich nie odróżnia).
- [ ] F4 (engine, źródło przywracania warda): `faceDownOriginal` nie niesie
      `ward`, więc uncover kasuje go twardym `ward: null` — poprawny wynik
      z niepoprawnego źródła (klasa L104; karta z drukowanym wardem
      straciłaby go po odsłonięciu).
- [ ] F5 (narzędzie + snapshot, ADR 0028): `tools/fetch-card-rulings.mjs`
      tryb CLI pada (`files is not defined`), a zachowanie cloaku jest
      przypięte do rulingów WotC, których snapshot `veiled-ascension` nie
      niesie.
- [ ] F6 (widok/etykiety, zgodność z rulingiem): M319 schował PRZYCZYNĘ
      zakrycia razem z faktem „karta jest stworem\" — przeciwnik czyta
      „(Morph)\" o cloaku, czyli kłamliwą etykietę; ruling WotC wymaga,
      żeby przyczyna zakrycia była rozpoznawalna dla wszystkich.
- [ ] F7 (stół, kreator many): uncover (cloak/manifest) prowadzi przez
      `spendMana` z pipami kolorów, a nie ma deskryptora w kreatorze —
      silnik sam wybiera źródła (klasa M34/M202O).

### E3. Pętla jakości na ścieżce innej niż PR #100–#102
Kryterium: min. 3 zakończone partie Żywego Testera bez zgłoszeń detektorów,
talie spoza pary użytej w #101; na koniec `test/bot-benchmark.test.js`.

### E4. Zamknięcie sesji
`docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-06h.md`, treść PR
(REST, ciało przez `gh api -X PATCH`), raport w czacie z blokiem przekazania.
