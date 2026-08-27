# Audyt Żywym Testerem — worki i talie jednoplanowe spoza podziału, M230

- **Data:** 2026-08-27
- **Kontekst:** kontynuacja audytu M229 (nowe talie po podziale ADR 0024). Teraz
  priorytet 1–2 z TESTER_STOLU: worki (najmniej przeczesane) + talie
  jednoplanowe spoza podziału (alara, ravnica, wiedzmin, theros, srodziemie,
  zendikar, forgotten-realms, final-fantasy).
- **Metoda:** ~10 partii, różne profile (explorer/random/defensive/greedy)
  i seedy, `--tick-rate` 0.2–0.25. Transkrypty: `audyt-m230/`. Detektory: 0
  zgłoszeń we wszystkich — znaleziska z RĘCZNEJ lektury (L27/L40) i sond
  mechanicznych po całym katalogu.

## Znaleziska i naprawy (3 realne błędy + strażnik)

1. **M230/1 (opis karty, Oś 5) — Severed Strands:** kafel pokazywał „zyskaj
   undefined życia". gain_life z ilością DYNAMICZNĄ
   (amountFromSacrificedToughness) nie miał gałęzi w render.js. Fix: „zyskaj
   życie = wytrzymałość poświęconego stwora".
2. **M230/2 (opis karty, Oś 5) — Liliana's Triumph + STRAŻNIK:** wyciek
   surowego „controlsPlaneswalkerWithSubtype" w conditional. Fix: etykieta
   z podtypem. Dodany STRAŻNIK katalogu: mechaniczny test przelatuje
   describeSpellEffects po WSZYSTKICH wspieranych kartach i czerwieni się na
   wycieku identyfikatora — ta rodzina wracała 4× (landEnteredThisTurn,
   Sarkhan's Rage, Severed Strands, Liliana's Triumph).
3. **M230/3 (bot, Oś 1) — Bomat Bazaar Barge:** bot załogował (crew) już
   animowany pojazd do 11× w jednej turze (tapując stwory za nic). Klasa L51
   (efekt idempotentny do EOT), bliźniak M219 (re-saddle). Fix: PlayerView
   eksponuje `animatedUntilEOT`; bot karze ponowny crew animowanego pojazdu.
   Weryfikacja headless: 0 re-crew na 4 seedach; crew Bomat w partii 38→9.

## Weryfikacja pozostałych osi

- **Oś 1 (poza Bomat):** powtórzenia Clue/Pyxis/Floodhound/Keykeeper okazały
  się LEGALNE (osobne tokeny/wielokrotnie użyteczne zdolności), nie patologia.
- **Oś 2:** zmiany życia, śmierci, rozstrzygnięcia czarów/zdolności obecne;
  brak „(brak danych)" w modalu.
- **Oś 5 (mechaniczna):** sonda describeSpellEffects po całym katalogu — 0
  wycieków po naprawach (strażnik pilnuje nawrotu).
- **Oś 3/4/6:** brak zgłoszeń noop, ptaszki obecne, brak przecieku szumu.

## Wniosek

Talie spoza benchmarku faktycznie były mniej przeczesane — 3 świeże błędy,
w tym jeden bota (crew bez progu nasycenia) i dwa opisów kart. Strażnik
katalogu domyka całą rodzinę wycieków w opisach czarów. 3 naprawy, każda
z testem RED→GREEN, osobne commity M230/1–3.
