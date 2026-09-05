# Audyt Żywym Testerem — jakość rzucania czarów przez bota (Oś 1), M233

- **Data:** 2026-08-27
- **Zlecenie właściciela:** skup audyt na tym, JAK bot rzuca czary i używa
  zdolności — przeanalizuj każde zagranie bota w kontekście MOMENTU rzutu. To
  najsłabsze ogniwo: zagrania technicznie i CR-owo poprawne, ale marnujące
  manę / czary / potencjał.
- **Metoda:** 7 partii na taliach po podziale (ADR 0024) i spoza benchmarku,
  profile defensive/greedy/explorer, różne seedy. Transkrypty: `audyt-m233/`.
  Detektory: **0 zgłoszeń we wszystkich 7 partiach** — zgodnie z L27/L40 to nie
  znaczy „czysto"; każdą turę bota przeczytano RĘCZNIE po logu `[ROZGRYWKA]`.

## Klasa błędu: czar-wrapper „każdemu z max N celów" marnowany (2 naprawy)

Wspólny mianownik obu znalezisk: karty z deskryptorem `apply_to_each_target`
owiniętym w `variableTargets { min: 0, max: N }`. CR 601.2c dopuszcza wybór
ZERO celów, więc gdy na stole nie ma legalnego celu (albo jest tylko własny),
silnik i tak oferuje legalny rzut. Wycena bota nie miała reguły dla tego
wrappera — czar zostawał na bazie `spellBase` (50) i przebijał pass (0).

### M233/1 — Wrap in Flames rzucone BEZ celów (0 obrażeń, 0 celów)

**Partia:** tarkir-wur (gracz) vs warhammer-ubr (bot), seed 11, profil
defensive. **Tura 12:** bot rzucił Wrap in Flames (Sorcery 4 many — „1 obrażenie
każdemu z max 3 celów + nie może blokować") mimo że gracz kontrolował ZERO
stworów (na stole miał tylko Plains + Island). Czar poszedł bez celów: 4 many
i cała karta wyrzucone za zero efektu.

**Root cause:** `effectIsInertNow` (heuristic-bot.js) nie miał przypadku dla
`apply_to_each_target`. Wrapper aplikuje efekty wewnętrzne do KAŻDEGO celu —
zero celów = zero efektu, ale `allEffectsInertNow` tego nie wykrywał.

**Fix:** `apply_to_each_target` z pustą listą celów jest jałowy (kara −70,
poniżej passu). Generycznie po pustej liście celów komendy (ADR 0002).
Test `test/m233-bot-wrap-no-targets-noop.test.js` (RED→GREEN, mutacyjnie 2/3
fail po cofnięciu). Regresja M158 (premia na stworze wroga) zachowana.

### M233/2 — Sea God's Scorn odbijające WŁASNEGO stwora

**Partia:** worek-legend vs theros, seed 5 (potwierdzone sondą jednostkową).
Sea God's Scorn (Sorcery 6 many — „odbij max 3 stwory/enchantmenty na ręce
właścicieli") ma tę samą strukturę wrappera. Wycena per-cel (M158) obsługiwała
tylko `damage`/`cant_block`, więc gdy jedynym legalnym celem był WŁASNY stwór,
bot odbijał swojego stwora na rękę (6 many, czysta strata tempa) — wariant
zostawał na bazie 50 > pass.

**Fix:** rozszerzenie wyceny wrappera o efekty USUWAJĄCE permanent
(bounce/destroy/exile) — cel własny karany (−90), wroga premiowany
(`P.removalEnemyBase` + waga P/T), analogicznie do górnego `REMOVAL_EFFECTS`.
Generycznie po typie efektu i kontrolerze celu (ADR 0002). Test
`test/m233-bot-bounce-own-creature-noop.test.js` (RED→GREEN, mutacyjnie 2/2
fail po neutralizacji `hasRemoval`).

### Przegląd całej rodziny `variableTargets min:0`

Sprawdzono wszystkie karty katalogu z `min: 0` (grep + sonda bota):
- **Wrap in Flames, Sea God's Scorn** — naprawione (wyżej).
- **Aerith Rescue Mission, You're Confronted by Robbers** — tryby tap-only
  (`tap_permanents`) startują od score −1 (utility-only) i są ZAWSZE zdominowane
  przez alternatywny tryb tokenowy (80 pkt), więc zerowy tap nigdy nie jest
  wybierany. Bez zmian (potwierdzone sondą).

## Zagrania sprawdzone i UZNANE ZA POPRAWNE (nie ruszam)

- **Feed the Infection** (g2, mirrodin-brg): draw 3 + strata 3 życia przy 20 ż.
  — realna przewaga kartowa, poprawny tempo/wartość.
- **Blazing Torch equip → strzał** (g5): equip na własnego Snarling Wolf, potem
  aktywacja obrażeń w gracza — sensowna sekwencja.
- **Trigon of Corruption -1/-1 na wrogach** (g6): zgodne z naprawą M221/F.
- **Divine Offering / Banishment Decree** (g6, po stronie gracza-testera): to
  ruchy testera, nie bota.

## Obserwacje bez naprawy (świadoma decyzja — ryzyko regresji > zysk)

- **Nadmierna inwestycja w removal w tani cel** (g6): bot zużył Force Away +
  2× Ojutai's Breath (rebound) + Bring Low na jeden token 1/1 Crawling Chorus.
  Każde zagranie z osobna jest poprawne (bounce/tap wrogiego stwora ma dodatnią
  wycenę), a drugi Ojutai's Breath to DARMOWY rzut z rebound (nie kosztuje
  karty ani many). Wprowadzenie progu „nie wydawaj drogiego removalu na tani
  cel" wymaga modelu wartości celu vs koszt czaru i pełnego benchmarku —
  odłożone jako kandydat na strojenie B6, nie doraźny fix (ADR 0021: nie
  maskować, nie zgadywać bez pomiaru).

## Weryfikacja braku regresji

- `npm test` (fast): **3516/3516** (3511 + 5 nowych z M233).
- `node --test test/bot-benchmark.test.js` (slow): **9/9** — bot nie słabszy vs
  Random/Aggro (progi 0.78/0.62 utrzymane).
- `npm run build`: 55 modułów.

## Wniosek

Zlecenie trafione: klasa „technicznie legalny, marnuje czar" istniała i była
niewidoczna dla detektorów (0 zgłoszeń w 7 partiach). Ręczna lektura po MOMENCIE
rzutu wyłapała 2 realne błędy z jednej rodziny (`variableTargets min:0` +
`apply_to_each_target`), naprawione generycznie i domykające całą rodzinę.
2 commity, każdy RED→GREEN + mutacja, golden-master i bot-benchmark bez regresji.
