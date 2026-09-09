# Audyt B5 — żywy stół G1–G4: log i kafle (2026-09-09)

Sesja `arena/01a08691-mtg`. Cztery partie żywym testerem na artefakcie
(`npm run build` + `run-game.mjs`), odczyt pełnych transkryptów + root-cause
w kodzie + minimalne fixy z regresjami. Silnik reguł nietknięty poza jednym
polem snapshotu LKI (opisowym).

## Partie

| Gra | Gracz vs bot | Seed / profil | Wynik | Kroków |
|---|---|---|---|---|
| G1 | worek-mroczny vs tarkir-wur | 42 / greedy | Bot win | ~974 linie |
| G2 | wiedzmin-wu vs kaladesh | 7 / explorer | Bot win 20:−3 | 82 kroki |
| G3 | warhammer-ubr vs dominaria-brg | 11 / greedy | Bot win 20:−15 | — |
| G4 | srodziemie vs zendikar | 3 / impatient | Bot win 19:−1 | — |

Wszystkie DET0 (0 detektorów, 0 STOP, 0 wyjątków) — także PO fixach.

## Znaleziska naprawione (7 + detektor)

**A — Prowler wroga: „bierze żadnego lądu" (G3, log).** Blanchwood Prowler
wroga wziął Forest do ręki, a log mówił „bierze żadnego lądu" (bez „nie",
mimo że wziął). Root-cause: `satyr_look_resolved` używał `seesHiddenOf` —
ukryty wybór wpadał w fallback „żadnego lądu". Silnik przyjmuje TYLKO lądy
(`pending.landIds`), więc ukryty wybór to na pewno ląd. Fix: trzy rozłączne
gałęzie — rezygnacja „nie bierze żadnego lądu", ukryty „bierze ląd", własny
z nazwą. (`src/table/session.js`)

**C — buff wroga: „twoje stwory" (G1, log).** Marauder of the Abyss bota:
„stwory (2 stwory): +2/+1" o JEGO stworach jako „twoje". Root-cause: twarda
stała w `mass_stats_modified`. Fix: macierz viewer-relative po
`e.playerId` × scope (yours/opponents/your_lands/attacking); wróg nazywany
„Nieprzyjaciela" wprost (jak `whoN`). (`src/table/session.js`)

**D — martwy manifest wracał jako „Morph" (G1, log/modal).** Atak opisany na
żywym obiekcie: „(Manifest)"; damage w późniejszej komendzie (obiekt martwy,
LKI): „(Morph)". Root-cause: `rememberLastKnownObject` nie kopiował
`faceDownCause` (opis post-apply per komenda, więc Atak i damage to osobne
komendy na różnych wcieleniach obiektu). Fix: cause w snapshocie.
(`src/engine/objects.js`)

**E — „dodaj 3 many bezbarwną" (G2, kafel).** `manaEffectLabel` trzymał
pojedynczą „bezbarwną" przy mnogiej. Fix: `bezbarwną/bezbarwne` po `single`.
(`src/table/session.js`)

**G — „efekt (attach_aura) · cel: stwór" na kaflu aury w ręce (G2, kafel).**
Membrane zwrócona do ręki po rzucie surge. Łańcuch: `cardInfo`
(`details.spell || object.spell`) → `rulesText` → `describeSpellEffects`.
Membrane nie ma `spell` w def (tylko `aura:`), więc kafel czytał ZALEGŁE
`object.spell`: `castAuraSpell` podpina instancję czaru na stosie (efekt
`attach_aura` konstruowany w runtime — dlatego strażnik M122 go nie złapał),
a `moveObjectDirectly` (spread) niesie ją przez strefy. Kafel aury NA STOLE
był czysty, bo wpis pola bitwy w PlayerView nie niesie `spell` (ręka niesie
— „do planowania"). Fix dwuczęściowy: (1) glosa `attach_aura → zaczaruj`
(+ `attach_aura_player`); (2) strażnik kaflowy — fallback `object.spell`
tylko na stosie/wygnaniu (żywy deskryptor; wygnanie = przygoda), w spoczynku
kafel ufa wyłącznie rejestrowi. Reset `spell` w choke odrzucony: flashback
czyta `object.spell` z grobu (celowy carrier). (`src/table/render.js`)

**Manifest Dread: „Ty — manifest dread: wybór…" (G1, log).** Event nie niósł
źródła (pending tak). Fix: `sourceCardId` w evencie + `srcName(e)` w opisie
(klasa M162/C). (`src/engine/effects.js`, `src/table/session.js`)

**Disa: „Gdy karta trafi na cmentarz spoza pola bitwy" (G3, kafel).** Generyk
gubił filtr Lhurgoyf i „twój" (matcher w triggers.js egzekwuje oba). Fix:
dedykowana gałąź z `trigger.subtypes`. (`src/table/render.js`)

**Drobne w tym samym przejeździe:** clash „mana value" → „wartość many"
(log); marker `greatest_mana_among_other_artifacts` → „wartość many…" 
(kafel Emissary Escort); Glint-Sleeve: zdublowany opis fabricate (keyword
doklejał drugi opis do zdolności — silnik czyta tylko efekt, keyword zdjęty
z def).

**Detektor (luka M189-klasy):** `SNAKE_CASE_EVENT` wymaga DWÓCH podkreślników,
więc `attach_aura` przechodził. Nowy `detectTileRawSlug` (linie RĘKA/POLA/STOS,
każde snake_case; kalibracja G1–G4: zero szumu) + wpięty w `runDetectors.
(`tools/table-tester/detectors.mjs`)

## Zamknięte bez fixa (weryfikacja)

- **Disa/Silken/Sarkhan/Rush** — fałszywe alarmy z odczytu; silnik poprawny
  (Disa dobiera na Lhurgoyf; Silken = untap; Sarkhan/Rush Oracle-OK).
- **Odrzuty z kodami w nawiasach** (`not_priority`, `illegal_land`) —
  zamierzone (pomoc w bug-reportach).
- **Slabs/Vandalize tryby** — udokumentowane uproszczenia singletona.
- **Tarmogoyf „5/6 (2+1+1+1+1…)"** — formuła informatywna, zostaje.
- **Rodzaj gramatyczny** („zaczarowana", „odrzucona") i angielskie nazwy
  mechanik w kaflach (coven, surge, investigate…) — znane systemowe
  uproszczenia (decyzja właściciela, rodzina O3).

## Weryfikacja

- 20 nowych regresji: `test/b5-log-fixes.test.js` (14), `test/b5-tile-fixes.test.js`
  (6) + 3 testy detektora; 1 pin zaktualizowany (Hysterical Blindness:
  „stwory Nieprzyjaciela").
- Transkrypty G1–G4 zregenerowane tymi samymi seedami: każda naprawa
  potwierdzona w świeżym tekście (m.in. „bierze ląd", „stwory
  Nieprzyjaciela (2 stwory): +2/+1", „(Manifest)" vs „(Morph)"
  rozróżnione poprawnie — bot gra prawdziwymi morphami).
- Brama PR: test:all / build / quick w HANDOFF_2026-09-09.
