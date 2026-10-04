# PLAN 2026-10-04c — PMSSB-54: przegląd czytników `zone === 'exile'` + strażnik pokrycia komend

Wejście: kolejka handoffu `2026-10-04b` poz. 1 („`zone === 'exile'` —
rekonesans z kartą demonstrującą; najpierw sonda, potem decyzja o fixie”).
Proweniencja: zaległy punkt z handoffów 03d/03i/03j („przegląd czytników
`zone === 'exile'`”), nigdy nierozliczony pomiarem.

## Krok 1 — przegląd czytników (wynik NEGATYWNY)

Skan `grep -rn "== 'exile'" src/` → **52 miejsca** (12 plików). Klasyfikacja:

- budowa id stref (`attachments`, `game-state`, `state-based`) — mechaniczne;
- permity rzutu z exile (impuls/plot/suspend/rebound/madness/warp/epic) —
  bramkowane `zone === 'exile' && <flaga>` + stamp tury (`impulse-window.js`);
- dowiązania „exiledBy” (`effects.js` 5019/5997–6004, `objects.js` 309,
  `triggers.js` 2018) — czytane po LKI, świadomie;
- zamienniki stref śmierci (finality, unearth, flashback — `objects.js`
  110/115, `state-based.js` 247);
- kontrakt widoku (CR 406.3 — zakryte wygnanie nie ujawnia tożsamości,
  `game-state.js` 6916).

**Jedyna granica** (udokumentowana w kodzie, nie ukryta): rzut karty
z suspend oferowany jest wyłącznie dla `kind === 'spell'`
(`game-state.js:7597`), a ścieżka rzutu używa `castSpellWithoutManaCost` —
komentarz przy wykonaniu (`game-state.js:3327–3331`) mówi wprost: „gdy
pojawi się PERMANENT z suspend, rzut idzie ścieżką permanentu i stwór
zyskuje haste (CR 702.62a), czego ta gałąź nie robi”. Jedyna karta
z suspend w katalogu (**Mindstab**, sorcery, `dominaria-brg`) jest czarem,
więc: **brak karty demonstrującej = brak fixa** (spójnie z PMSSB-53; katalog
rośnie tylko z kolekcji właściciela, ADR 0029). Ścieżka suspend ma już
31 asercji w `m201-zawieszone-w-wygnaniu` i `bot-suspend-twiddle-quality`.

## Krok 2 — z przeglądu narodził się strażnik (pomiar + fix)

Przegląd „kto czyta wygnanie” postawił pytanie lustrzane: **czy bot obsługuje
KAŻDĄ decyzję, którą silnik potrafi wyemitować?** Pomiar statyczny:

- silnik emituje **89** typów komend (`command('…'` w `src/engine/*.js`;
  `src/table` nie emituje żadnej; jedyne niestatyczne wywołanie to walidacja
  wejścia `game-state.js:2126`),
- bot ma dla nich **89/89** jawne `case`.

Luka nie leży więc w pokryciu (jest pełne), tylko w jego **pilnowaniu**:
brak `case` nie kończy się błędem, tylko `default: finish(0)` — wyborem
z KOLEJNOŚCI OFERT silnika (antywzorzec L41). Telemetria
`bot.unvaluedDecisions()` (detektor Żywego Testera) łapie to dopiero w grze.

**Fix = strażnik `test/bot-komendy-silnika-straznik.test.js`** (3 piny):
1. każdy typ komendy silnika ma jawny `case` w bocie (lista świadomych
   wyjątków pusta, z instrukcją uzasadniania wpisów),
2. kotwice (≥80 typów po obu stronach + `pass_priority`/`resolve_ward_pay_choice`),
3. brak gnijących wpisów na liście wyjątków.

**Dowód RED→GREEN przez mutacje (L13):**
- m1: usunięcie `case 'resolve_ward_pay_choice'` z bota → strażnik FAIL
  („typy bez case w bocie … resolve_ward_pay_choice”);
- m2: dodanie `command('resolve_fake_probe_type')` w silniku → strażnik FAIL
  (nazywa typ fałszywy);
- po restorze z /tmp (cmp identyczne) → GREEN 3/3, `src/` bez zmian.

## Kryteria ukończenia

1. Przegląd 52 czytników: wynik negatywny + jedna granica opisana (bez kodu).
2. Strażnik dodany, mutacje m1/m2 RED, GREEN po restorze; `src/` nietknięte.
3. Bramki: `npm test` **7540/7540** EXIT 0 (123,1 s), build 70 modułów /
   4814,2 kB.
4. Dokumenty tej rundy + wpisy w rejestrach; handoff 04c.

---

Proweniencja kolejki (handoffy 03d→04b): ward (domknięte PMSSB-53) →
`zone === 'exile'` (domknięte negatywnie tutaj) → kondensacja.
