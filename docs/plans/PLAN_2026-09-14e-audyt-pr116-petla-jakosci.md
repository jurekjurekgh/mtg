# PLAN 2026-09-14e — audyt PR #116 (batch 55 + koszty zdolności) + pętla jakości

Zlecenie: „Kontynuujemy projekt” — prompt **nie nazywa tematu**, więc obowiązuje
pętla domyślna z [ADR 0021](../decisions/0021-default-session-work-no-queue-question.md):
PR na starcie (0020 A) → audyt poprzedniego scalonego PR (0020 B / 0016) →
niedokończony plan z `main` → pętla jakości. Sesja `arena/01a09fda-mtg`.

Kontekst: sesja `arena/01a09fcc` (PR #117) zaczęła ten sam audyt i została
zamknięta przez właściciela po 7 minutach (PR CLOSED, bez scalenia) — na jej
gałęzi jest tylko plan `PLAN_2026-09-14d-*.md`. Audyt wykonuję samodzielnie od
zera; raport powstaje na `main` dopiero w tym PR.

## 0. Stan wejściowy (zmierzony, nie przepisany)

- `main` = `4ccc055` (PR #116 scalony 2026-09-14 11:54 UTC); origin/main ten sam SHA.
- Gałąź sesji `arena/01a09fda-mtg` — świeża od `main` (bez commitów).
- `npm test` (szybki rdzeń, pomiar tej sesji): **5482/5482, 0 fail, 151,8 s**.
- `npm run build`: **61 modułów / 3657,5 kB** (zgodne z handoffem 2026-09-14).
- Rozmiar audytowanego PR (`gh pr diff 116`): 116 plików, w tym 23 `src/`
  (`card-data.js` +224/−11, `effects.js` +154/−10, `heuristic-bot.js` +100/−11,
  `render.js` +77/−21, `spells.js` +59/−5, `game-state.js` +58/−20,
  `session.js` +33/−5, `registry.js` +11/−3, `materialize.js` +10/−1,
  `mana-costs-data.js` +11, `identity.js` +10/−5, `permanents.js` +9,
  `triggers.js` +13/−6, `combat.js` +6/−6, `abilities.js` +5/−5, `deck.js` +4,
  `main.js` +4/−4, `resources.js`/`objects.js`/`card-images.js` po +2/−2,
  `types.js`/`zones.js`/`state-based.js` po +1/−1), 10 snapshotów Scryfall,
  regeneracja talii, nowe testy, dokumenty.
- **Brak niedokończonego planu na `main`** — plany batcha 55 i 2026-09-14c
  mają etapy odhaczone; punkt 3 pętli ADR 0021 nie ma czego podjąć, po
  audycie wchodzi punkt 4 (pętla jakości).

Otwarte z handoffu (niezapomniane, nie kolejka): `[Trigger:]` w linii stosu
(kandydat UX); S-1 (literalne `\n` w `oracleText`, 20 kart) — **nie ruszane
bez zlecenia właściciela**; D1/O1/O2 z audytu PR #115 — nieblokujące.

## 1. Zakres audytu PR #116 (ADR 0020 B) — kolejność wg blast radius

1. **`src/engine/effects.js`** — nowe mechaniki: `create_token_copy_of_source`
   (Embalm, CR 702.128a), Gift (`condition.wasGifted`, Food PRZED innymi
   efektami), `reveal_top_each_player_lose_life_mana_value` (Duskmantle Seer),
   `add_counter_to_creatures_you_control.requireCounter`,
   `condition.controlsArtifact`. Zero gałęzi po nazwie karty (ADR 0002).
2. **`src/engine/spells.js` + `game-state.js`** — Gift: wariant `cast_spell`,
   przenoszenie obietnicy przez `OBJECT_FIELDS` i widok ręki (L21/L84),
   stos (`wasGifted`). Oferta ≡ walidacja (L48).
3. **`src/cards/registry.js` + `materialize.js` + `deck.js`** — freeze
   deskryptora `gift`, materializacja obu gałęzi (permanent/czar).
4. **`src/cards/card-data.js` + 10 snapshotów** — 10 kart `supported` vs Oracle
   (Act of Treason, Douse in Gloom, Gearsmith Prodigy, Lifecrafter's Gift,
   Hunt the Weak, Jungleborn Pioneer, Tah-Crop Skirmisher, Brightwood Tracker,
   Crumb and Get It, Duskmantle Seer) + koszty zdolności po 2026-09-14c
   (4 poprawki). `limitations` wyłącznie strukturalne (ADR 0022); artId
   ∈ kolekcji (ADR 0029). Automatyczny diff pól ze snapshotami (L96).
5. **`src/table/render.js` + `session.js`** — etykiety Gift, grupy panelu,
   log (`gift_given`, Z1c), H7/`EMPTY_RECEIVER_EFFECTS`.
6. **`src/controllers/heuristic-bot.js`** — wycena Gift/Embalm/odsłonięcia,
   klasyfikacje (M157/`REVIEWED_UNVALUED`, `STACKING_ACTIVATED_EFFECTS`).
7. **`src/engine/` pozostałe** — `identity.js` (mana value z druku, L85),
   `abilities.js` (4 poprawki kosztów), `permanents.js`, `triggers.js`,
   `combat.js`, `resources.js`, `objects.js`, `zones.js`, `state-based.js`,
   `deck.js`, `protocol/types.js`.
8. **Testy i strażnicy** — `ability-cost-pips`, `koszty-generyczne-zdolnosci`,
   `cr-numery-mechanik-straznik`, `real-cards-batch55`; RED→GREEN (L13).
9. **Talie i golden master** — generator ADR 0023/0024, re-podział Wiedźmina,
   dwa churny snapshotu z atrybucją.
10. **Dokumenty i liczby** — README/HANDOFF/PROJECT_HISTORY z pomiaru (L92);
    L142 (proweniencja znaleziska 2026-09-14c).

Metody: diff plik po pliku; weryfikacja twierdzeń regułowych wobec Oracle/CR
ze źródeł online — cytat dosłowny w raporcie (ADR 0030); pary
„oferta == walidacja” (L48); FoW (ADR 0003/0017); determinizm (ADR 0005);
brak wyjątków po nazwie (ADR 0002).

## 2. Etapy i kryteria ukończenia

- [x] **E0. Plan + PR sesji** (ADR 0020 A) — ten plik osobnym commitem PRZED
      kodowaniem; PR otwarty na GitHubie.
- [x] **E1. Audyt PR #116** — APPROVE; raport docs/audits/AUDYT_PR116_2026-09-14.md (c5c138d); naprawy P1-P6 osobnymi commitami (52b1ad2..eeb7496) — raport `docs/audits/AUDYT_PR116_2026-09-14.md`
      z werdyktem, tabelą znalezisk (ID, miejsce, treść, werdykt) i sekcją
      odtwarzalności; znaleziska blokujące naprawione u root cause osobnymi
      commitami (RED→GREEN + weryfikacja mutacyjna).
- [x] **E2. Pętla jakości — Żywy Tester** — 12 partii (w tym celowane chwilowymi taliami, M331); Gift/Embalm/Seer zweryfikowane na żywo; znalezisko W1 (ptaszek dla warp_card i turn_manifest_face_up) naprawione fca3f4b z dowodem end-to-end na świeżym `dist/` (L76), partie
      taliami z obszaru zmian (Gift/Embalm/Seer), ręczna lektura transkryptów
      po trzech osiach (`TESTER_STOLU.md`), naprawy u root cause + detektory.
      Kandydat: `[Trigger:]` w linii stosu.
- [x] **E3. Polowanie na niezgodności z CR** — straznik 2 nowych par (madness+702.35b; przeliczane+604.3) z cytatami ADR 0030 i weryfikacja mutacyjna (4a67459) inną ścieżką niż poprzednie sesje
      (obszar wskazany przez E1: Embalm/Gift/odsłonięcie/koszty zdolności) —
      cytat reguły w komentarzu strażnika (ADR 0030).
- [x] **E4. Bramki** — finalny head: npm test 5485/5485 (147,9 s), test:all 5495/5495 (304,6 s), build 61/3658,7 kB, quick 82,6% (555/672) / 30,7% / 4,2% (bez zmian), golden master bez churnu: `npm test` po każdym commicie; na koniec
      `npm run test:all`, `npm run build`, quick benchmark
      (`node tools/benchmark.mjs`), golden master — churn tylko świadomy (L124).
- [x] **E5. Domknięcie** — HANDOFF_2026-09-14e, wpis PROJECT_HISTORY 2026-09-14e, README (liczby), LESSONS L143/L144, opis PR #118: `docs/setup/HANDOFF_2026-09-14e.md`, wpis w
      `docs/PROJECT_HISTORY.md`, README (liczby z pomiaru, L92), opis PR
      aktualizowany kumulatywnie. Pełne B0 wyłącznie na komendę właściciela
      (ADR 0018).

## 3. Kolejność commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. ten plan; 2. raport audytu PR #116; 3…N naprawy/znaleziska osobno per
finding; N+1 pętla jakości; N+2… dokumenty zamknięcia. Każdy commit
wypchnięty od razu (ADR 0020 C/D, L136).

## 4. Ryzyka i pułapki

- **Sandbox potrafi zresetować workspace w środku tury** (ENVIRONMENT §2):
  po każdym commicie `git log --oneline -1` + push; przed `git checkout
  <plik>` sprawdzić `git diff --stat -- <plik>`.
- Gift przenosi deskryptor przez **cztery warstwy** (L21/L84) — audyt sprawdza
  każdą, nie tylko `effects.js`.
- Embalm: wygnanie z grobu to KOSZT (ruling 2017-07-14) — efekt czyta obiekt
  już z exile; druga aktywacja tej samej karty niemożliwa.
- Duskmantle Seer: **nie** emituje `card_drawn`; utraty życia jednoczesne
  (CR 104.4b). Pamięć treningowa nie jest źródłem (ADR 0030).
- Nie odpalać pełnego B0 (ADR 0018); benchmark szybki bez `| tail`.
- `gh pr edit` na tym repo bywa odrzucane → `gh api -X PATCH`.
