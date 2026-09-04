# Audyt Żywym Testerem — nowe talie po podziale (ADR 0024), M229

- **Data:** 2026-08-27
- **Kontekst:** po podziale 5 dużych talii na połówki kolorystyczne (ADR 0024)
  powstało 10 nowych talii — świeże próbki do audytu „z perspektywy gracza".
- **Metoda:** `tools/table-tester/run-game.mjs`, ~15 partii, priorytet talii =
  świeżo podzielone (tarkir-bg/wur, innistrad-wu/brg, mirrodin-wu/brg,
  dominaria-wu/brg, warhammer-wg/brg), różne profile (explorer/defensive/random/
  greedy) i seedy, `--tick-rate` 0.2–0.25. Transkrypty: `audyt-m229/`.

## Znaleziska i naprawy (3 realne błędy)

Wszystkie z jednej partii-zapalnika (warhammer-ubr vs mirrodin-brg, seed 23:
bot rzuca Awaken the Sleeper — PRZEJMUJE Hill Giant gracza) + ręcznej lektury.

1. **M229/1 (UI, render):** kafel przejętego stwora pokazywał „Pośpiech ·
   Pośpiech" — keyword NADANY dublował się (linia reguł czyta keywordy
   efektywne + osobny badge grantedKeywords). Fix: linia reguł pokazuje tylko
   keywordy WYDRUKOWANE; nadane mają badge.
2. **M229/2 (detektor, false positive — L74/L75):** detectBotBuffsMyCreatures
   oskarżał bota o „buff TWOJEGO permanentu", gdy PRZEJMOWAŁ kontrolę
   (Awaken the Sleeper). To poprawna, wroga gra. Fix:
   gain_control_until_end_of_turn dołączone do HARMFUL_PERMANENT_EFFECTS;
   detektor pomija cel, gdy rzucana karta jest w harmfulNames. Log-level-
   independent (M99) — zweryfikowane normal i --quiet (1→0 w obu).
3. **M229/3 (opis karty, Oś 5):** kafel Sarkhan's Rage pokazywał surowy
   identyfikator „controlsNoCreatureSubtype" i urwane „w przeciwnym razie: ·"
   (brak gałęzi else). Fix: mapa CONDITIONS + podtyp; else tylko gdy istnieje.

## Weryfikacja pozostałych osi

- **Oś 1 (bezsensowne ruchy bota):** brak — powtórzenia akcji mieściły się
  w normie (pump/crew/cycling), zero mielenia własnej biblioteki itp.
- **Oś 2 (kompletność logu/modala):** zmiany życia, śmierci, przejęcia kontroli
  i efekty conditional (Trade Route Envoy z obiema gałęziami) opisane poprawnie.
- **Oś 3/4:** brak zgłoszeń noop; ptaszki wyciszenia obecne.
- **Oś 6:** brak przecieku szumu (mana/faza) do logu gracza.

## Wniosek

Rotacja talii (ADR 0024) potwierdziła wartość: nowe pary od razu odsłoniły
klasę błędów (control-steal), której stała próbka benchmarku nigdy nie
odwiedzała. 3 naprawy, każda z testem RED→GREEN, osobne commity M229/1–3.
