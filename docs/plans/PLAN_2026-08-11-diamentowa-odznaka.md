# Plan: Diamentowa odznaka — audyt UX żywym testerem stołu (15 błędów)

Sesja `arena/019ff280-mtg` (po scaleniu PR #43). Zlecenie właściciela (handoff PR
#43, kolejka): **Diamentowa odznaka** — kolejne 15+ błędów wykrytych żywym
testerem stołu (`tools/table-tester/run-game.mjs`) na prawdziwym artefakcie,
wzorzec M73c/M73d (objaw z transkryptu → naprawa u ROOT CAUSE → test
regresyjny).

## Metoda

Rozegrano **35 partii** (różne talie × seedy: green/red, azorius/black,
innistrad/wiedzmin, spellslinger/tokens, black/graveyard, wiedzmin/red itd.)
i przeskanowano transkrypty skryptem `tools/table-tester/scan.mjs` pod kątem
podejrzanych etykiet (surowych slugów, `?`, `undefined`, złej odmiany,
dublowanych informacji). Wszystkie błędy potwierdzone w źródłach (root cause),
nie maskowane.

## Znalezione błędy (15) — wszystkie UI/etykiety/log (bez zmian bota)

1. **„X zostaje skontrowany (?)"** — `spell_countered` niesie `counteredBy`
   (id obiektu czaru-kontrującego), który po rozstrzygnięciu znika z
   `state.objects` → `nameOfObject` zwraca „?". Fix: event niesie też
   `counteredByCardId` (LKI), log czyta nazwę po cardId.
   *Objaw:* `azorius_vs_black_s13` — „Spread the Sickness zostaje skontrowany (?)".
2. **Clash „p1-library-10 na wierzch/spód"** — modal clash pokazuje surowy
   identyfikator strefy zamiast nazwy odsłoniętej karty. Root cause:
   `PlayerView.pendingClash.cards` niesie OBJECT ID, a `commandLabel`
   `resolve_clash_choice` czyta go jako cardId. Fix: PlayerView konwertuje na
   cardId (clash odsłania wierzch obu bibliotek — FoW OK).
   *Objaw:* wiele transkryptów (``Clash: p1-library-10 na wierzch biblioteki``).
3. **„· ·"/„· · · ·" — puste opisy zdolności STATYCZNYCH na kaflach** —
   statyki bez `effect` (Veiled Ascension, Kabira Vindicator level-up, inne)
   renderują pusty string, a `rulesText` skleja zdolności bez filtra. Fix:
   opis statyk w `describeAbility` (pump/condition/scope/keywords/mustAttack/
   cantAttackAlone/cantBlockAlone/costModifier/faceDownEnterFlyingCounter) +
   filtr pustych w join.
   *Objaw:* `Veiled Ascension ... · · Na początku upkeep`, `Kabira ... · · · ·`.
4. **„cel: gracz: mieli 1 kartę" — dublowany/niejasny cel w etykiecie
   AKTYWOWANEJ zdolności** — `describeAbility` dokleja `cel: <typ>` a akcja
   dodatkowo `→ cel: <nazwa>`. Fix: opcja `withTarget` w `describeAbility`;
   etykieta akcji `Aktywuj:` używa `withTarget:false` (cel i tak w `→ cel:`).
   *Objaw:* `Aktywuj: Cellar Door ... cel: gracz: mieli 1 kartę ... → cel: Nieprzyjaciel`.
5. **Surowe „resolve_reveal_exile_hand"/„resolve_reveal_exile_grave"** jako
   etykiety akcji (Dreams of Steel and Oil). Fix: `commandLabel` dla obu.
   *Objaw:* `>> resolve_reveal_exile_hand`.
6. **„(koszt )" puste przy zdolnościach bez many** — `abilityCostHtml` zna tylko
   mana/tap; koszty „odrzuć 2 / poświęć" (Plague Reaver) i brak kosztu (Crew,
   Eldrazi Scion) dają pusty nawias. Fix: `abilityCostHtml` obsługuje
   `discardCards`/`sacrificeSelf`, a „(koszt X)" pomijamy gdy koszt pusty.
   *Objaw:* `Aktywuj: Plague Reaver (Ty) (koszt ) ...`, `Irontread Crusher (koszt )`.
7. **Odmiana „obrażeń" wg liczby** — log i opisy zawsze „zadaje 1 obrażeń".
   Fix: helper `N obrażenie/obrażenia/obrażeń` (1/2-4/5+) w session.js i
   render.js.
   *Objaw:* `Kor Sanctifiers zadaje 2 obrażeń`, `1 obrażeń zaczarowanemu graczowi`.
8. **Log wyboru odrzucenia „wybiera, którą odrzuca kartę z ręki (efekt)"** —
   nieczytelna gramatyka + techniczny sufiks `(efekt)`/`(koszt)`. Fix: czytelny
   komunikat.
   *Objaw:* `Ty wybiera, którą odrzuca kartę z ręki (efekt)`.
9. **Surowy slug „source_power" w opisie buffa Jyoti** — `buff_land_creatures`
   renderuje `source_power/source_power`. Fix: `ptAmount` dla dynamicznych
   wartości P/T.
   *Objaw:* `Trigger początek walki: source_power/source_power dla land creatures`.
10. **Brak polskich etykiet keywordów** — `double_strike`, `level_up`,
    `persist`, `defender`, `infect`, `exalted`, `indestructible`, `flash`
    wyświetlane jako surowe snake_case. Fix: `KEYWORD_LABELS`.
    *Objaw:* `Humandouble_strike`, `Knightlevel_up`, `Latanie persist`,
    `Trolldefender Zasięg`.
11. **Surowy identyfikator tokenu „token_eldrazi_scion"** w etykiecie aktywacji —
    token Eldrazi Scion nie jest zarejestrowaną kartą → `nameById` nie zna nazwy.
    Fix: `defineCard` dla `token_eldrazi_scion` (jak pozostałe tokeny).
    *Objaw:* `Aktywuj: token_eldrazi_scion (Ty) —`.
12. **Surowy event triggera „(saga_chapter)"** w logu (Shiva saga). Fix:
    `TRIGGER_EVENT_LABELS.saga_chapter`.
    *Objaw:* `Shiva, Warden of Ice — trigger (saga_chapter)`.
13. **Odmiana „życia": „zyskaj 1 życia"** — powinno „1 życie". Fix: helper
    życia w `describeEffect` (1→życie, reszta→życia).
    *Objaw:* `zyskaj 1 życia` (Soulmender, Mournful Zombie).
14. **Angielskie nazwy trybów Etherwrought Page** — „Life Gain / Surveil /
    Drain" zamiast polskich. Fix: polskie `name` trybów w definicji karty.
    *Objaw:* `wybierz tryb: Life Gain / Surveil / Drain`, `Tryb: Life Gain`.
15. **Niespójne etykiety załączników na nakładce ilustracji** — `buildFace`
    pokazuje „zaczarowana:/wyposażona:", a `buildStateOverlay` (widoczny nad
    ilustracją) „aura:/equip:". Fix: spójne „zaczarowana:/wyposażona:".
    *Objaw:* na gospodarzu obok siebie `zaczarowana: X` ORAZ `aura: X`.

## Zakres / decyzje

- Tylko warstwa UI/log (`src/table/`, definicje kart, PlayerView). **Bot bez
  zmian** — pełny B0 (13500) nie jest wymagany (zasada B0 dotyczy zmian bota),
  ale quick B0 uruchamiamy informacyjnie.
- `token_eldrazi_scion` rejestrujemy (zmiana katalogu, nie bota).
- Testy: nowe regresyjne w `test/audit-diamond-badge.test.js` + aktualizacje
  istniejących (table-ui `/zyskaj 1 życia/` → `/zyskaj 1 życie/`; Etherwrought
  tryby polskie).

## Kolejność commitów

1. `docs/plans/PLAN_2026-08-11-diamentowa-odznaka.md` (ten plan) — pierwszy commit.
2. `fix(log/ui): diamentowa odznaka — 15 błędów żywym testerem` — implementacja
   (silnik/log 1-8, opis 9-15) + testy.
3. `docs: aktualizacja PROJECT_STATE + HANDOFF`.

## Ryzyka / pułapki

- Zmiany etykiet/logu mogą psuć testy asertujące stare teksty — `npm test`
  przed commitem, poprawki testów tam gdzie zmiana jest celowa.
- `edit_file` psuje PL → python3 Path.read_text/write_text.
- Sandbox może cofnąć HEAD — po commicie `git fetch && git rebase FETCH_HEAD`
  (nie reset).
