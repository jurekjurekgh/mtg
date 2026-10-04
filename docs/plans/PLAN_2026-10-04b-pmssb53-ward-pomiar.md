# PLAN 2026-10-04b — PMSSB-53: ward zmierzony E2E (bez luki) + granica kopii czarów

Wejście: kolejka handoffu `2026-10-04a` poz. 1 („Ward — rekonesans zrobiony,
luki nie ma; postaw SONĘ na decyzję `resolve_ward_pay_choice` — bez zmierzonej
luki nie dotykaj”) oraz pytanie kontrolne z handoffu `03j` („czy bot nie płaci
bez sensu”). Karta demonstrująca: **`riftburst-hellion`** (MKM, disguise →
zakryty 2/2 z ward {2}, CR 702.168a; jedyna karta z ward w katalogu, talia
`ravnica`). Zakrycie budowane w stanie jak silnik
(`resources.js` L1835–1841: faceDown + 2/2 + `keywords: ['ward']` + `ward: 2`).

## Pytania pomiaru

1. Czy bot widzi koszt ward przy RZUCIE (podatek za cel z ward) i czy wariant
   z nieopłacalną dopłatą spada poniżej passu?
2. Czy decyzja `resolve_ward_pay_choice` zapada z intencji (pay vs refuse)?
3. Czy podatek nie przecieka na cele BEZ warda (anty-over-fix)?
4. Granica: kopie czarów (`spell_copied` → `fireWardTriggers`) — co robi bot,
   gdy silnik żąda dopłaty za KAŻDĄ kopię?

## Sonda 1 (`tools/probe-ward-bot.mjs`, usunięta po pomiarze)

p1 = bot, ręka `douse-in-gloom` ({2}{B}, 2 obrażenia + 2 życia), cel = zakryty
permanent p2; morf (bez warda) i zwykły 2/2 jako kontrole.

| scena | układ | wynik |
|---|---|---|
| G1 | 3 Swampy, cel = disguise (ward {2}) — po zapłacie czaru brak many | rzut = **−200**, bot PASS ✔ |
| G2 | 5 Swampów, disguise ORAZ zwykły 2/2 | disguise 80 vs zwykły 90 (różnica jakości celu; patrz G5) |
| G3 | 5 Swampów, tylko disguise — pełna sekwencja | rzut → pass p1 → pass p2 → **`resolve_ward_pay_choice pay=true`** (80 vs 20) → passy → czar rozstrzyga, W ginie ✔ |
| G4 | 5 Swampów, tylko zwykły 2/2 | 90 — brak podatku ✔ |
| G5 | 5 Swampów, zakryty MORPH (bez warda) | **82** = 80 + 2 → podatek dokładnie 2 ✔ |
| G6 | 3 Swampy, zakryty MORPH | **82** (nie −200) → −200 z G1 pochodzi z warda, nie z kosztu many ✔ |
| G7 | 3 Swampy, disguise ORAZ zwykły 2/2 | disguise **−200**, zwykły **90** → podatek KIERUJE rzut na cel bez warda ✔ |

**Wniosek 1:** podatek ward (`wardTargetTax` — twardy: brak many = 200, poniżej
passu) i decyzja dopłaty działają zgodnie z projektem (M320/NA2, M324/F1).
**Luki nie ma — kodu nie ruszamy.**

## Sonda 2 (`tools/probe-ward-storm.mjs`, usunięta po pomiarze)

Granica kopii: `spreading-insurrection` (MH2, sorcery {4}{R}, storm, cel =
stwór, którego nie kontrolujesz) na zakrytego disguise z ward {2}; storm = 2
(dwie kopie).

| scena | mana | wynik |
|---|---|---|
| S1 | 8 Mountain (5 czar + 2 ward + 1) | rzut → ward #1 **pay=true** → kopie (2) → ward kopii **nie pyta** (producibleMana 1 < 2) → silnik kontruje kopie; efekt oryginału zostaje ✔ |
| S2 | 8 Mountain, disguise BEZ warda (kontrola) | brak decyzji ward, kopie zostają przy oryginalnym celu ✔ |
| S3 | 14 Mountain (mana na wszystkie płatności) | ward #1 + ward kopii ×2 = **3× pay=true**; łączny koszt 11 many na potrójne „przejmij kontrolę" nad TYM SAMYM stworem |

**Wniosek 2 (granica świadoma):** przy kopii tego samego czaru na ten sam cel
bot płaci ward za KAŻDĄ kopię (80 vs 20), choć efekt jest redundantny
(przejęcie kontroli nie kumuluje się). NIE naprawiamy tego lokalnie, bo:

1. „Redundancja kopii” zależy od TYPU efektu — kopie obrażeń/usuwania
   KUMULUJĄ się (druga kopia 3 obrażeń często zabija większe ciało), więc
   reguła „nie płać za kopie” byłaby błędem w drugą stronę (L5: strażnik
   mierzy regułę, nie tekst; tu reguły nie ma bez klasyfikacji efektów).
2. Para kart jest nieosiągalna w BENCH_DECKS (`spreading-insurrection` w
   `ixalan`, ward w `ravnica` — lista 6 talii benchmarku nie zawiera ixalanu),
   więc zmiana nie ma pokrycia w golden-masterze ani w pomiarze jakości.
3. Poprawna naprawa to model klas efektów (co się kumuluje, co nie) + pole
   widoku „ta kopia celuje w to samo, co oryginał” — pozycja kolejki, nie
   łatka w decyzji ward.

## Kryteria ukończenia

1. G1–G7 i S1–S3 zmierzone, tabele w tym planie (sondy usunięte z drzewa).
2. Brak zmian w `src/` (wynik negatywny = brak fixa; „nie dotykaj bez
   zmierzonej luki” spełnione).
3. Lekcja **L177** (trigger na stosie: mierz SEKWENCJĘ decyzji, nie jeden
   krok — pierwsza wersja sondy ogłosiła fałszywy alarm „brak decyzji ward”).
4. Budżet lektury: L177 zapłacone skróceniem L170 (rejestr ≤ 100k, strażnik
   zielony).
5. Bramki: `npm test` + `npm run build` zielone; wynik bramy PR w body #154.

## Wykonanie (2026-10-04b)

Zmiany w repo: `docs/LESSONS.md` (L170 skrócone, L177 nowe),
`docs/LESSONS_PRZYPADKI.md` (proza L170), ten plan, sekcja w `docs/PMSSB.md`,
`docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-10-04b.md`. **Zero zmian
w `src/` i `test/`** — to pozycja pomiarowa.

**Bramki:** `npm test` **7537/7537** EXIT 0 (123,5 s) · build **70 modułów /
4814,2 kB** · strażnicy docs **25/25** · budżet lektury **99 870 / 100 000**
(zapas 130; L177 zapłacone skróceniem L170).
