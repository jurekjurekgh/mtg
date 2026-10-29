# Uwagi z gry 2026-10-29 (sesja 2026-10-27c, PR #177) — F, G, H, I, J i K

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

**Pin.** `test/h-incubator-nazwa-po-transformacji.test.js` — 7 testów:
stan silnika po `{2}: Transform` (`name`/`cardName`/`kind`/liczniki), widok
gracza (`name` kafla i celów), etykieta oferty/celu (`commandLabel` przed =
„Incubator”, po = „Phyrexian”, bez śladu starej nazwy), linia logu
(„Incubator przemienia się w Phyrexian”), generyczność (syntetyczny token
`Probe A → Probe B`) oraz brak regresji dla KART (`name` nie pojawia się w
cechach twarzy — numeracja kopii i porównania nazw zostają nietknięte).
H/7 idzie przez ŻYWĄ sesję stołu (`createSession` po mulliganach), bo modal
celowania pyta `session.nameOfObject`, a nie `playerView`. Weryfikacja RED:
odwrócenie patcha `src/` (`git apply -R`) → 6/7 testów czerwonych (H/4
przechodzi, bo log nazywa strony po `cardId`); po przywróceniu 7/7 zielone.

## I — Spellkeeper Weird: bot poświęcał stwora, który wcale nie ginął

**Zgłoszenie.** „Karta Spellkeeper Weird. Bot bezsensownie poświęca tę
kreaturę. Zdolności wymagające poświęcenia powinny być możliwe do zagrania
przez bota tylko wtedy, gdy dana kreatura już ginie — np. celuje w nią lethal
damage albo destroy albo exile i wtedy można ją poświęcić. Także jeśli kreatura
już blokuje i dostanie w blokowaniu lethal damage to można ją poświęcić.
W innych wypadkach poświęcenie powinno mieć ujemny scoring.”

**Reprodukcja (5 sond).** Spellkeeper Weird (`{2}, Sacrifice this creature:
Return target card from your graveyard to your hand`) w Głównej 1:

| stan stołu | bot przed naprawą | oczekiwane |
|---|---|---|
| brak zagrożenia | `activate_ability` (poświęca ciało za zwrot karty) | `pass_priority` |
| wrogi `destroy` (Expunge) celuje w niego, na stosie | aktywacja | aktywacja |
| Shock 2 obrażeń przy 4 tough | aktywacja | `pass_priority` — 2 < 4, jeszcze nie ginie |
| Fiery Fall 5 obrażeń (lethal) na stosie | aktywacja | aktywacja |
| blokuje i w walce dostaje lethal | aktywacja | aktywacja |

**Root cause (klasa L41).** Kara za koszt `sacrificeSelf` istniała tylko
w WYBRANYCH gałęziach wyceny zdolności (płaskie `−4` dla stworu / `−1` dla
artefaktu w gałęziach token/draw/discard), więc zdolność zwrotu karty z grobu
nie płaciła niczego, a gałąź pump/debuff liczyła ciało źródła DRUGI raz
(`sacrificePumpTradeWeight` + `bodyWorth`). Nie było też pojęcia „ten stwór i
tak zginie” — czyli jedynego przypadku, w którym poświęcenie ciała nie jest
stratą.

**Naprawa.** Jedna reguła `sacrificeSelfCostLoss(view, source, effects)`
w `src/controllers/heuristic-bot.js`, wołana raz w `activate_ability` przy
`ability.cost.sacrificeSelf`:

- nie-stwór (Skarb/Clue/land) → 0 — cena jednorazowego artefaktu zostaje
  w dawnym miejscu (`−1`), bo kara za ciało nie ma tu zastosowania;
- `permanentDoomedThisTurn` → 0 — stwór ginie w tej turze (destroy/exile na
  stosie, śmiertelne obrażenia, bloker z lethal w zadeklarowanej walce), więc
  poświęcenie nic nie kosztuje;
- efekt `add_mana` → 0 — rampa (Spawn/Blood Pet) to zamierzona funkcja
  stworzenia, ma własne wymiary (PMSSB-32, M243/C);
- efekt będący pumpem zabijającym cel → 0 — ten model liczy ciało źródła sam
  (`sacrificePumpTradeWeight`, PMSSB-58/A11–A12), druga kara byłaby podwójnym
  liczeniem;
- inaczej → `bodyWorth(source)` (2×power + toughness + MV) — wynik schodzi
  pod `pass_priority`, czyli poświęcenie jest nieopłacalne.

Płatność i oferta idą tą samą komendą (`activate_ability`), więc „oferta =
walidacja = płatność” (L48/L57) zostaje bez zmian — zmienia się wyłącznie
WYCENA, nie legalność. Zero zmian w katalogu kart (ADR 0029).

**Pin.** `test/i-poswiecenie-stwora.test.js` — 6 testów (I/1 brak zagrożenia →
`pass_priority`; I/2 destroy na stosie; I/3 Shock nieśmiertelny → `pass`; I/4
lethal na stosie; I/5 bloker z lethal; I/6 guard: ta sama zdolność na
NIE-stworzeniu nie dostaje nowej kary). Weryfikacja RED:

| mutacja | czerwone testy |
|---|---|
| odwrócenie patcha `src/` (`git apply -R`) | I/1, I/3 (I/6 jest guardem — zielony w obie strony, czerwienieje dopiero od mutacji `isCreature`) |
| usunięcie `permanentDoomedThisTurn` z reguły | I/2, I/4, I/5 |
| guard nie-stworów → `const isCreature = true` | I/6 |
| usunięcie guardu `add_mana` | PMSSB-58/A16 |
| usunięcie guardu `isNegativePump` | PMSSB-58/A11, A12 |

**Skutki uboczne (świadome, przeglądnięte).**

- `test/audyt-pmssb19-search.test.js` (PMSSB-19/R1): oczekiwane pole „wynik
  zwrotu karty z grobu za ciało” 11 → **3** — teraz to ciało płaci za siebie
  (ta sama reguła dla wszystkich efektów, wcześniej zero).
- Golden-master (`tools/bot-scoring-snapshot.mjs --write`): `4902f6a7…` →
  `d5349621…`. Różnica to DOKŁADNIE dwie nie-wybrane już aktywacje poświęcające
  własne stworzenie bez zagrożenia (`@1000` tura 15 declare_attackers:
  `permanent-28#0→graveyard-59`; `@1001` tura 19 main1:
  `permanent-68#0→graveyard-35`); partia tarkir-bg|warhammer-ubr bez zmian.
- `test/panel-rozgrywka-tura-przeciwnika.test.js`: po zmianie wycen partia
  innistrad vs alara nie ma już opóźnionych triggerów (hunter 1..90 — zero
  trafień), więc nośnikiem został `the-edge.txt` seed 1 (konwencja L25;
  hunter 1..15: 3, 4, 6, 7, 12, 14).

**Uwaga do cytatu CR.** Komentarz reguły cytuje CR **701.21a** (dosłowny tekst
weryfikowany wobec CR 2026-09-25, sha256 `8d860e45…` — ten sam plik, z którego
generowana jest `test/helpers/cr-numery-tabela.js`); numer jest w tabeli
strażnika, więc `cr-numery:istnienie` zostaje zielony.

## J — Benevolent Blessing: kolor ochrony nie szedł za blokowanym stworzeniem

**Zgłoszenie.** „Karta Benevolent Blessing. Bot poprawnie nadaje flash
protection tą kartą swojej blokującej kreaturze, ale wybiera kolor inny niż
kolor kreatury, którą ta jego kreatura blokuje. Bez sensu. Kreatura bota
ginie, aura idzie do piachu.”

**Reprodukcja (sonda `probe-j-blessing.mjs`, żywy silnik).** Stół: atakujący
2/2 zielony, bloker bota 1/4 niebieski, obok trzy CZERWONE stwory wroga poza
walką — czyli dokładnie ten „bias”, który widział właściciel:

| scenariusz | przed naprawą | oczekiwane |
|---|---|---|
| bloker przeżywa (atak 2/2) | `{R}` | `{G}` — kolor blokowanego atakującego |
| bloker ginie (atak 5/5) | `{G}` | `{G}` (gałąź ratująca życie działała) |
| host ATAKUJE i jest blokowany przez czerwonego | `{R}`/`{U}` losowo | kolor blokera |
| krok declare_blockers, blok jeszcze niezadeklarowany | `{R}` | kolor atakującego, którego host może blokować |

**Root cause (klasa L41).** Kolor ochrony liczyła jedna heurystyka
„najliczniejszy kolor wroga” (`5 + enemyInColor × colorProtectionPerCreature`),
a gałąź ratująca życie (`lethalProtectionThreatColors`) obejmowała WYŁĄCZNIE
przypadki, w których host i tak ginie. Gdy host przeżywał — a ochrona i tak
zerwałaby obrażenia od blokowanego atakującego (CR 702.16e: „Any damage that
would be dealt by sources that have the stated quality to a permanent or
player with protection is prevented.”) — wybór był
przypadkowy: przy trzech czerwonych stworach poza walką bot brał `{R}`, choć
blokował zielonego atakującego.

**Naprawa.** Nowy `protectionCombatThreatByColor(view, host)` w
`heuristic-bot.js` — jedno miejsce, trzy źródła „partnerów” hosta:
blokowani atakujący (host jest blokerem), blokerzy hosta (host atakuje) oraz —
w kroku `declare_blockers`, przed deklaracją — atakujący, których host legalnie
może blokować (`view.blockCandidates`). Wycena została rozszerzona o próg
między „ratuje życie” a „najliczniejszy kolor”:

| próg (od najwyższego) | wartość |
|---|---|
| kolor należy do `lethalColors` (host ginie bez ochrony) | `100 + liczbaKolorów` |
| kolor partnera walki | `colorProtectionCombatBonus` + `colorProtectionCombatDamageWeight` × zatrzymane obrażenia (moc źródła; trample +1, CR 702.19) |
| kolor spoza walki (gdy partner istnieje) | `5` |
| host nie walczy / atakujący bez koloru | dawna heurystyka `5 + enemyInColor × 6` (kotwica anty-over-fix) |

Dwa nowe pokrętła (`colorProtectionCombatBonus` 40, `colorProtectionCombatDamageWeight`
2) — 40 leży nad sufitem dawnej heuristicie przy realnych stołach i pod progiem
ratującym życie, więc kolejność progów jest nienaruszalna. Zero zmian
legalności (oferta i walidacja kolorów nietknięte), zero nowych kart (ADR
0029), zero branchowania po nazwie karty (ADR 0002).

**Pin.** `test/j-benevolent-blessing-kolor.test.js` — 7 testów: J/1 sedno
zgłoszenia (bloker przeżywa, `{G}` mimo przewagi czerwonych), J/2 regresja
ratowania życia (`{G}` przy 5/5), J/3 symetria „host atakuje, blokuje go
czerwony”, J/4 krok `declare_blockers` bez deklaracji, J/5 atakujący bez
koloru → dawna heurystyka, J/6 kotwica anty-over-fix (aura w fazie głównej
nietknięta: `{R}` = 23, `{U}` = 11), J/7 pokrętła + brak wpływu na cel `mana`
(Manor Gate: `{B}` = 11). Weryfikacja RED: odwrócenie patcha `src/`
(`git apply -R`) → **4 RED** (J/1, J/3, J/4, J/7); mutacja „bez gałęzi host
ATAKUJE” → J/3; mutacja „bez zliczania zatrzymanych obrażeń” → 4 RED.

**Zakres.** Bez rekalibracji pinów: żadna talia golden-mastera ani pin
scenariuszowy nie dotyka tej decyzji (fast 9040/9040 bez zmian oczekiwań).

## K — Rupture Spire: bot zagrywał ląd, którego nie było stać na opłatę ETB

**Zgłoszenie.** „Karta Rupture Spire. Bot zagrywa ją, mimo, że nie ma many na
opłacenie kosztu (1) i musi ją poświęcić. Kompletnie bez sensu. Ta karta
powinna być zagrywana tylko wtedy gdy bot ma manę na opłacenie (1).”

**Reprodukcja (sonda `probe-k-spire.mjs`, żywy silnik + `bot.trace()`).**

| scenariusz | przed naprawą | po naprawie |
|---|---|---|
| 0 many, brak lądów na stole | `play_land` = **76** | **−20** → `pass_priority` |
| 0 many, 2 TAPNIĘTE lasy | `play_land` = **76** | **−20** → `pass_priority` |
| 0 many, 1 nietapnięty las | `play_land` = **76** | **81** → `play_land` + płatność `pay:true` |
| 1 mana w puli | `play_land` = 84 | 84 (bez zmian) |

**Root cause (klasa L41).** Kara za ETB „zapłać {N} albo poświęć ten
permanent” siedziała WEWNĄTRZ `landPlayDelta`, czyli w klamrze delty lądu
`[−14, 25]` — razem z premiami za pokrycie kolorów (+10…+16). Przy braku
many delta spadała do −12, klamra dobijała do −14 i `play_land` dostawał
`90 − 14 = 76`, czyli komfortowo więcej niż pass (0). Efekt: bot oddawał land
drop i kartę, żeby natychmiast ją poświęcić (CR 701.21a: poświęcenie przenosi
permanent z pola bitwy prosto do cmentarza, bez okna na odpowiedź). Drugi błąd
był w definicji „stać”: liczyła się wyłącznie PULA (`players[].mana`),
a nie własne nietapnięte lądy, z których da się zapłacić w odpowiedzi na
trigger.

**Naprawa.** Nowy `landEtbPayOrSacrifice(view, objectId)` — jedno źródło
reguły (L41), deskryptorowe (ADR 0002): szuka triggera `enter_battlefield`
z `payMana > 0` i `sacrificeIfUnpaid`, bez nazw i ID kart. „Stać” =
`ownOpenMana(view) >= amount` (pula + własne nietapnięte źródła many; tapnięte
nic nie da, a Spire wchodzi tapnięta, więc sama siebie nie opłaci). Wycena:

* stać na {N} — realny koszt `{N} × creatureManaCostWeight` obniża deltę lądu
  (dotychczasowa ścieżka, bez zmian);
* nie stać — gałąź `play_land` zwraca **karę poza klamrą**:
  `−landEtbUpkeepUnplayablePenalty` (20), więc zagranie przegrywa z passem
  niezależnie od premii kolorystycznych.

Nowe pokrętło `landEtbUpkeepUnplayablePenalty` 20 (`× 0` przywraca stan sprzed
K — używane w pinie jako dowód, że to parametr, nie stała w kodzie). Zero zmian
legalności (oferta = walidacja = płatność, L48/L57), zero nowych kart
(ADR 0029).

**Pin.** `test/k-rupture-spire-etb-oplata.test.js` — 6 testów: K/1 sedno
zgłoszenia (brak many → nie zagrywa), K/2 same tapnięte lądy, K/3 jeden
nietapnięty ląd → zagrywa i w pełnej ścieżce **płaci** `{1}` zamiast
poświęcać, K/4 pula 1 → 84 (bez zmian), K/5 kotwica anty-over-fix (zwykły ląd
bez many dalej zagrywany), K/6 kara jest pokrętłem (−130 przy wartości 130).
Weryfikacja RED: odwrócenie patcha `src/` → **3 RED** (K/1, K/2, K/6);
mutacja „stać = tylko pula” → K/3; mutacja „bez wczesnego zwrotu w
`play_land`” → 3 RED. Pin `PMSSB12-A` zaktualizowany: 76 → **−20** (scenariusz
„sonda” 81 bez zmian).

**Zakres.** Bez rekalibracji talii golden-mastera i pinów scenariuszowych —
pozostałe piny na `rupture-spire` (m184, m195, m200, etap-f, kafel-cena) zielone.

## Bramy (końcowe drzewo)

| Brama | Wynik |
|---|---|
| `npm test` | **9046/9046**, EXIT 0 |
| `npm run test:slow` | **268/268**, EXIT 0 |
| `npm run build` | **76 modułów / 5550,5 kB** |
| benchmark quick | 672 mecze — heuristic **88,4%** (594/672) |
| `event-contract-audit`, `family-audit` | brak naruszeń |
