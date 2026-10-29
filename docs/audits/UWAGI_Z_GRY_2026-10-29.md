# Uwagi z gry 2026-10-29 (sesja 2026-10-27c, PR #177) — F, G i H

Trzy uwagi właściciela z Żywego Testera. Wszystkie naprawione u root cause,
z pinami i mutacjami; bez dopisywania kart do katalogu (ADR 0029).

## F — Caravan Vigil: Morbid nie widział śmierci stworu

**Zgłoszenie.** „Zdolność Morbid nie działa. Mimo, że w tej kolejce zginęły 2
kreatury, rzucenie tego czaru przeniosło ląd z library do ręki. A powinno do
razu na mój stół.”

**Reprodukcja (sonda).** Shock w 1/1 → SBA → `creature_destroyed`; po dwóch
zgonach `state.creatureDiedThisTurn === false`, a
`pendingSearchChoice.destinations === null` — oferta nie miała wariantu „na pole
bitwy”, więc ląd szedł do ręki.

**Root cause.** Tracker `state.creatureDiedThisTurn` (Morbid/Bloodthirst,
podstawa warunków `rule.morbid`) patrzył na JEDEN typ zdarzenia: `object_moved`
z pola bitwy do grobu. Tej ścieżki NIE emitują dwie najczęstsze drogi śmierci:

| droga śmierci | zdarzenie | tracker widział |
|---|---|---|
| obrażenia / `-X/-X` (SBA, CR 704.5a/f) | `creature_destroyed` | **nie** |
| zniszczenie efektem (CR 701.7) | `permanent_destroyed` | **nie** |
| poświęcenie (koszt/efekt) | `permanent_sacrificed` | **nie** |
| efekt „put into graveyard” | `object_moved` | tak |

Tylko ostatnia działała, więc w typowej grze Morbid był martwy — także dla
kart z warunkiem `entersWithCountersIf: morbid`.

**Naprawa.** Jeden predykat `eventIsCreatureDeath(state, ev)` (triggers.js),
używany przez tracker w game-state.js (L41 — klasa „bliźniacze gałęzie
rozjeżdżają się w ciszy”). Reguła:

- CR 700.4: „dies” = permanent trafia **z pola bitwy do cmentarza**; finality /
  exile (`toZone === 'exile'`, CR 122.1h) to NIE śmierć;
- CR 603.10a: rodzaj (stwór?) czytamy z LKI — obiekt po zmianie strefy jest
  NOWY (CR 400.7), więc `formerKind`/`formerTypes`; token ginący w grobie
  czyta LKI zdarzenia.

Deklaracja Morbida („You **may** put that card onto the battlefield instead of
into your hand”, Oracle) zostaje WYBOREM gracza — oferta ma oba warianty
i oba są opisane w etykiecie (`resolve_search_choice`, wariant „— na pole
bitwy” / „— do ręki”). Nie zmieniamy legalności: pole bitwy nie jest przymusem.

**Pin.** `test/f-morbid-kreatura-zginela.test.js` — 6 testów (śmierć od
obrażeń + oba warianty oferty, pełny przebieg „ląd na stole”, zniszczenie
czarem, poświęcenie jako koszt, anty-over-fix: finality i poświęcony ląd,
reset z nową turą). Mutacja: powrót starego warunku w trackerze → **5 RED**.

## G — Sea God's Scorn: ranking celu bounce wg zainwestowania

**Zgłoszenie.** „Mam wątpliwości, w jaki sposób bot wybiera, jakie permanenty
mają wrócić do ręki przeciwnika […] ranking powinien układać permanenty
przeciwnika wg ich TMC + TMC aur/enchantmentów + bonus za każdy pozytywny
counter. A tak nie jest, bo przed chwilą bot zwrócił najmniejsze kreatury,
a zostawił na stole największe.”

**Model właściciela = „rynek inwestycji”.** Każdy wymiar to realna strata
przeciwnika po zwrocie do ręki:

| wymiar | uzasadnienie regułowe | waga |
|---|---|---|
| TMC permanentu | odbudowa = rzut od nowa | 6 / mana |
| TMC aur na celu | aura bez gospodarza idzie do grobu (CR 704.5m) — pełna strata karty | 4 / mana |
| TMC equipmentów | equipment ZOSTAJE (CR 704.5n), ale przełożenie kosztuje manę | 2 / mana |
| pozytywne liczniki | znikają na stałe (CR 122.2 — karta wraca bez nich) | 10 / licznik |

**Stan przed.** Bounce liczył wyłącznie CIAŁO: `2 × (P+T)` w `wrapTargetsValue`
+ TMC w wadze 2 + płaskie +30 za aurę. Skutki:

- tanie wielkie ciało (8/8 za 1 manę) wygrywało z drobiazgiem za 6 many,
- equipment na celu nie był widziany W OGÓLE (`attachedAurasOf` zna tylko aury),
- liczniki nie miały żadnej wagi, choć przepadają bezpowrotnie,
- aura za 1 manę i za 4 many były wyceniane identycznie (+30).

**Naprawa.** `bounceInvestmentDelta` w `bounceTargetAdjustments`
(heuristic-bot.js) — czyli ta sama ścieżka dla `cast_spell`, `activate_ability`
i wrappera `apply_to_each_target` (L41). Załączniki rozdzielone po typie
(`attachedManaValuesOf`): aura ≠ equipment, bo różni się skutek regułowy.
Liczniki liczone generycznie po rodzaju ― każdy NIEUJEMNY (`-1/-1` to
obciążenie, nie inwestycja).

**Dwie rekalibracje, bez których nowa waga psuła istniejące decyzje:**

- `bounceFoeEtbWeight` 1 → 2 — przy wadze TMC 6 pojedyncza kara za powtórkę
  ETB przestawała rozstrzygać: drogi stwór z ETB wracał jako cel bounce, czyli
  łamał się zakaz z PMSSB-1/A/F6 (pin zielony po zmianie),
- `counterspellTmcWeight` 6 → 10 — kontra trzyma parytet z wagą TMC bounce
  (2 parytetu + 4 za trwałość); inaczej Steel Sabotage KONTUROWAŁ drogi czar
  artefaktu przegrywając z odbiciem drobiazgu (pin `bot-modal-modes`).

**Pin.** `test/g-sea-gods-scorn-ranking.test.js` — 6 testów porównujących
wyceny wariantów jedno-celowych (czysty ranking, niezależny od „up to three”):
TMC bije ciało, equipment na bliźniaku, droższa aura, liczniki `+1/+1`,
anty-over-fix `-1/-1`, oraz pełna decyzja z czterech celów — odpada NAJMNIEJ
zainwestowany (dokładnie zgłoszony objaw: „zostawił największe”). Mutacje:
każda waga → 0, liczenie liczników ujemnych, brak całego wymiaru → RED.

**Piny zaktualizowane (stara skala, relacje bez zmian):** PMSSB-1 (86 / okna
94-86-78 / overflow 98 / lockout 142 / param ETB 2), bot-modal-modes
(102 / 142 / 150), bot-params (10), PMSSB-3 F5 (108/118), PMSSB-5 (82/92,
abstruse 91.97), PMSSB-6 (86), PMSSB-8 (96/94), PMSSB-18 (109).
Golden-master bez zmian (scenariusze bounce poza snapshotem).

## H — nazwa dwustronnego tokenu nie szła za twarzą (Incubator → Phyrexian)

**Zgłoszenie.** „Karta Tiller of Flesh tworzy token Incubator. Po zapłaceniu
Incubator zmienia się w token Phyrexian. Mimo to w grze w modalach do celowania
ten permanent dalej nazywa się Incubator.”

**Reprodukcja (sonda).** Tiller of Flesh na stole, czar z celem w stwora →
trigger `incubate 2` → token `token_incubator` (`name: 'Incubator'`). Po
aktywacji `{2}: Transform` stan silnika miał już `cardId: 'token_phyrexian'`,
`cardName: 'Phyrexian'`, `kind: 'creature'`, `types: [Artifact, Creature,
Token]`, 0/0 + 2 liczniki +1/+1 (CR 701.53/707.9/712.8) — ale
`object.name` **nadal `'Incubator'`**, a `playerView` niesie dla tokenu
właśnie `name` (M155). Kafel, modal celowania (`choice-request` →
`session.nameOfObject`) i etykiety ofert czytały więc starą nazwę.

**Root cause (klasa L41).** Nazwa WIDOCZNA ma jedno źródło zależne od rodzaju
obiektu: KARTA — z rejestru po `cardId` (`session.nameOf`), TOKEN i kopia —
jawnie z `object.name` (bo `cardId` tokenu jest poza rejestrem). Obie ścieżki
zmiany twarzy przepisywały `cardId`/`cardName`, ale **nie pole `name`**:

| ścieżka | builder cech twarzy | objaw |
|---|---|---|
| `transform` w miejscu (CR 712.18 — ten sam obiekt) | `transformInPlaceFields` | token zostawał z nazwą strony opuszczanej |
| craft / powrót z wygnania przemienioną stroną / wejście nocną stroną | `transformedCharacteristics` | to samo, gdy token-kopia obracała się na nowy obiekt |

**Naprawa.** Nowy `transformedDisplayName(back, previous)` w
`src/engine/permanents.js` — jedno miejsce, z którego oba buildery biorą nazwę
nowej strony: puste dla KARTY (`previous.name == null` → pole zostaje puste,
nazwa dalej z rejestru), a dla tokenu/kopii `back.name ?? back.cardName`
(deskryptor `transformTo` już niesie `cardName`, więc **żadnej nowej listy
nazw w kodzie** — ADR 0002). Payloady powrotne (`transform` → `transformTo`,
craft, `exile_return_transformed`, wejście nocną stroną) niosą odtąd także
`name` opuszczanej strony, żeby druga przemiana wróciła z poprawną nazwą.
Zero zmian legalności i zero zmian w katalogu kart (ADR 0029; zgłoszenie nie
wymagało nowej karty — nośnik mechaniki był).

**Pin.** `test/h-incubator-nazwa-po-transformacji.test.js` — 6 testów:
stan silnika po `{2}: Transform` (`name`/`cardName`/`kind`/liczniki), widok
gracza (`name` kafla i celów), etykieta oferty/celu (`commandLabel` przed =
„Incubator”, po = „Phyrexian”, bez śladu starej nazwy), linia logu
(„Incubator przemienia się w Phyrexian”), generyczność (syntetyczny token
`Probe A → Probe B`) oraz brak regresji dla KART (`name` nie pojawia się w
cechach twarzy — numeracja kopii i porównania nazw zostają nietknięte).
Weryfikacja RED: odwrócenie patcha `src/` (`git apply -R`) → 5/6 testów
czerwonych (H/4 przechodzi, bo log nazywa strony po `cardId`); po przywróceniu
6/6 zielone.

## Bramy (końcowe drzewo)

| Brama | Wynik |
|---|---|
| `npm test` | **9026/9026**, EXIT 0 |
| `npm run test:slow` | **268/268**, EXIT 0 |
| `npm run build` | **76 modułów / 5540,8 kB** |
| benchmark quick | 672 mecze — heuristic **88,2%** (593/672) |
| `event-contract-audit`, `family-audit` | brak naruszeń |
