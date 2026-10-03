# Plan sesji 2026-10-03e — PMSSB-44: koszt okazji drugiego trybu źródła many (Seer's Lantern / Balamb / Skullcairn)

**Tryb:** ADR 0021 §4 (kontynuacja pętli jakości po PMSSB-43).
**Wejście:** pozycja 2 kolejki HANDOFF_2026-10-03 (pozycja 1 zamknięta w PMSSB-43).

## Diagnoza

Trzy karty z komentarza w handoffie:
1. **Seer's Lantern** (Śródziemie, OGW): {T}: dodaj {C}; {2}, {T}: scry 1. Scry jest instant-speed (bez `timing: 'sorcery'`). Timing scry jest już obsłużony przez M211/A1 (kara −12 za odpalenie poza EOT wroga, premia +10 za EOT).
2. **Immersturm Skullcairn** (Kaldheim, KHM): ląd wchodzi tapnięty; {T}: {B}; {1}{B}{R}{R},{T},sac (sorcery): 3 obrażenia w gracza + odrzuca kartę. Koszt w manie 4 + sacrifice — koszt many jest już liczony przez `abilityManaCostPenalty`.
3. **Balamb Garden, SeeD Academy** (Final Fantasy, FIN): ląd-Town, wchodzi tapnięty; {T}: {G}/{U}; {5}{G}{U},{T}: transform (koszt 7 − 1/inny Town, w obecnym katalogu 0 innych Townów = 7). Koszt many 7 jest liczony przez `abilityManaCostPenalty`.

Wszystkie trzy dzielą kształt: **druga zdolność kosztem {T} NA ŹRÓDLE PRODUKUJĄCYM MANĘ**.
Aktualna wycena bota nakłada koszt many (`abilityManaCostPenalty`) i karę za krok (`wastefulStep`) oraz timing (M211 dla scry), ale NIE LICZY kosztu okazji TAPNIĘCIA źródła many — czyli many, którą to źródło MOGŁOBY wyprodukować w tej turze, a nie wyprodukuje, bo jest tapnięte.

To znaczy że przy rzadkiej manie bot może przedwcześnie aktywować drugą zdolność na źródle, zostawiając się bez kolorów do odpowiedzi. Jest to koszt okazji w rozumieniu L48 (koszt alternatywny decyzji).

## Przykład (Seer's Lantern)

- Tura wroga, jego początek walki, bot otwiera manę na 3, w ręce Counterspell {U}{U} (nie da się rzucić na bezbarwnym Lantern, ale Lantern i tak jest bezbarwny — nie jest dobrym przykładem).
- Lepszym przykładem jest **Balamb Garden**: jeśli ja w mojej Głównej 1 mam 6 otwartej many i 1 zielone źródło (Balamb) + 5 innych, aktywacja transformu za 5GU tapuje Balamb → tracę {G} i zostaję z 5 bez zielonego. Jeśli w ręce jest zielony czar za 1G, zostaję zablokowany. Bot widzi koszt many 7, ale jeśli many jest 8 (np. 6 podstawowych + Balamb = 7 zielonej? — tutaj trzeba przeliczać ile many daje tapnięte źródło).

## Naprawa (generyczna, ADR 0002)

Dodać karę `manaOpportunityCostPenalty` przy aktywacji zdolności ze `cost.tap`, której źródło jest producentem many (czyli ma własną zdolność `add_mana` z inną zdolnością, albo ma `manaSource` w widoku), ale tylko gdy:
1. Zdolność NIE jest sama zdolnością many (`add_mana` w `abilityEffectTypes`) — bo wtedy TAP jest sposobem zapłaty za manę, nie kosztem;
2. Nie jesteśmy w końcu tury wroga (tam mana i tak wyparuje — bez kosztu okazji);
3. Nie jesteśmy w wastefulStep (tam jest już większa kara).

Wielkość kary: waga `manaTapOpportunityWeight` × łączna produkcja many źródła (ilość = `manaSourceOfView(source)?.amount ?? 1`). Jeśli mana nie jest kontestowana (brak kart w ręce do zagrania) → zmniejszona kara, bo strata nic nie kosztuje.

Pin: stworzyć test/sondę:
- A1: aktywacja scry Seer's Lantern w Głównej 1 przy zagrzywalnym czarze w ręce (kontestowana mana) ma obniżoną ocenę.
- A2: aktywacja scry w EOT wroga (bez kontestacji many) NIE dostaje kary.
- A3: zdolność many (tap_for_mana) nie dostaje tej kary (bo jest celowym ruchem produkującym manę).

## Etapy

- [x] Etap 0 — sonda PRZED: kod już pokrywa wszystkie trzy karty bez dodatkowych zmian
- [x] Decyzja: bez kodu na zapas (istniejące kary M211 + `abilityManaCostPenalty` wystarczają; sondy pokazują poprawne wybory)
- [ ] Etap 4 — bramki (fast/build/audit)
- [ ] Etap 5 — docs (PMSSB §44, HISTORY, handoff)

## Sondy i wyniki

- **Seer's Lantern scry za {2},{T} w Głównej 1** (4 Plains + Lantern, ręce sorcery/instant za 2W): `activate_ability` −12 vs `pass_priority` 0 → bot passuje (poprawnie, kara M211 za nie-EOT).
- **Seer's Lantern scry za {2},{T} w EOT wroga**: `activate_ability` +10 vs pass 0 → bot odpala scry (poprawnie).
- **Darmowy scry za {T} przy 1 Plains + artefakt-many, czar w ręce za 1W**: `activate_ability` −10 vs pass 0 → bot passuje (już jest kara za aktywację library-arranging w nie-oknie).
- **Skullcairn** (4 many + sacrifice w Głównej 1, przeciwnik z kartą na ręce): zniszczenie lądu + damage + discard to kosztowny wymiar, ale `abilityManaCostPenalty` liczy koszt 4, a `sacrificeSelf` już przechodzi przez `selfHarmPenalty`.
- **Balamb Garden transform** za 7 GU z tapnięciem lądu: koszt 7 GU + tap liczy się przez `abilityManaCostPenalty`; w 6-landowej ręce transform zabiera manę i zielone/niebieskie pipy; obecny model barwi kary za kroki (M211 nie dotyczy, bo to sorcery-speed).

## Wniosek

Koszt okazji „tracę manę przez tapnięcie źródła" jest już częściowo pokryty przez:
- M211 (`looksAtOwnLibraryOnly`): −12 za aktywację scry w złym oknie, +10 w EOT wroga (tam mana i tak wyparuje, bez kosztu okazji);
- `abilityManaCostPenalty` za manę wydaną na aktywację (0.6/manę);
- `producesManaOnly` kara gdy nie ma co zagrywać.

Dodanie OSOBNEJ kary za tapnięcie źródła many bez zademonstrowanego błędu w rozgrywce byłoby **kodem na zapas** — sprzeczne z ADR 0022 §4 (tylko błędy odtwarzalne). Pozycję kolejki uważam za **sprawdzoną, bez zmian w kodzie**.

Czyszczę pliki-proby w `tools/probe-*.mjs` (nie commitować, L173).
