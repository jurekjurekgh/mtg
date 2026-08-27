# Audyt Żywym Testerem — typowanie i strojenie nieoptymalnej mechaniki, M235

- **Data:** 2026-08-27
- **Metodologia (propozycja właściciela):** audyt Żywym Testerem z TYPOWANIEM
  mechaniki, która jest (a) często używana i (b) używana nieoptymalnie, a potem
  strojenie jej. Trafność podniesiona przez przecięcie DWÓCH pomiarów:
  częstość mierzona STRUKTURALNIE (instrumentacja realnych decyzji bota po
  deskryptorach efektu), nieoptymalność potwierdzona RĘCZNĄ lekturą transkryptów.

## Pomiar częstości (bot-vs-bot, 22 talie × seedy)

Ranking realnych decyzji „wydania zasobu" bota (poza pass/walką, ~44,6 tys.
decyzji łącznie): `cast_permanent` 1085, `activate_ability` 577, `cast_spell`
362. Typy efektów w rzucanych czarach/zdolnościach: add_mana, gain_life, scry,
draw_cards, add_counter, create_token, grant_keywords, animate...

Pomiar jakości strukturalnej:
- **Powtórzenia tej samej zdolności w oknie** (brak progu nasycenia): praktycznie
  ZERO (tylko 1× station_counters) — klasy re-crew/re-saddle/re-equip domknięte
  w poprzednich sesjach (M219/M230).
- **Aktywacje w „jałowym kroku"** (upkeep/draw/end własnej tury) i **mana bez
  celu w ręce**: ZERO wastefulStep, marginalne manaNoHandPlayable — timing
  aktywacji jest dobrze pilnowany.

Wniosek: detektory strukturalne są ciche (L27/L40) — nieoptymalność siedzi w
WYBORZE/OKNIE, widocznym tylko w transkrypcie.

## Znalezisko (Oś 1) — TIMING flash-aury ochronnej

Partia ravnica (gracz) vs srodziemie (bot), seed 55: bot rzucił **Benevolent
Blessing** (aura protekcji z FLASH, 2 many) na własnego stwora w **swoim
upkeepie**, bez żadnej walki.

**Korekta diagnozy (uwaga właściciela):** to NIE błąd „aura na tokenie" —
token to pełnoprawna kreatura, jego wartość to TMC. Pierwotny pomysł kary za
enchantowanie tokenu został ODRZUCONY. Prawdziwy błąd to **timing**: aura
ochronna z flash to sztuczka bojowa, a jej wartość zależy od OKNA:
- moja walka — ochrona atakującego przed blokerami danego koloru (przepycha obrażenia),
- tura przeciwnika po deklaracji atakujących — bezstratny blok.
W upkeepie/kroku bez walki to zmarnowana elastyczność instanta (lepiej trzymać
kartę do właściwego okna).

**Root cause:** gałąź `cast_permanent` (aury) NIE korzystała z infrastruktury
okien walki (M218 combatTrickWindow, używanej przez instantowe pumpy/granty) —
aura dostawała płaską bazę niezależnie od fazy/kroku.

**Fix (M235/1):** parametr `flashProtectionAuraOffWindowPenalty` (120). Kara dla
aury, która JEST flash i której CAŁA wartość jest ochronna (deskryptor
`protection` o stałej jakości ALBO `chooseColor` jak Benevolent Blessing, bez
pumpa i keywordów), gdy rzucana poza oknem walki. Okno użyteczne = gospodarz
atakuje/blokuje teraz (combatTrickWindow) albo moja Główna 1 z gospodarzem
gotowym do ataku. Kara przebija bazę → w upkeepie bot wybiera pass (trzyma
kartę); w oknie walki aura nadal wygrywa. Reguła po deskryptorze + widok
(ADR 0002/0017). Test RED→GREEN (mutacyjnie 2/5 fail).

## Zakres świadomie ograniczony

Kara dotyczy WYŁĄCZNIE aur czysto-ochronnych. Pozostałe 2 flash-aury w katalogu
(Feral Invocation +2/+2, Silken Strength +1/+2 reach) to bufory STATYSTYK —
mają wartość trwałą także poza walką (rozwój planszy), więc granie ich w main
jest uzasadnione. Rozszerzanie kary na nie groziłoby pomijaniem legalnego
rozwoju — brak dowodu (audyt) na błąd, więc nie ruszam.

## Weryfikacja braku regresji

- `npm test` (fast): **3529/3529** (3524 + 5 nowych M235).
- `node --test test/bot-benchmark.test.js`: **9/9** (progi 0.78/0.62 utrzymane).
- golden-master (bot-scoring-snapshot): bez zmian — decki snapshotu nie mają tej
  sytuacji; `npm run build` 55 modułów.

## Wniosek

Metodologia właściciela (typuj częste ∧ nieoptymalne, potem strój) trafiła:
mechanika aur/sztuczek bojowych jest częsta (cast_permanent = #1 decyzja
„wydania"), a timing flash-aury ochronnej był realnie zły i niewidoczny dla
detektorów. 1 fix RED→GREEN, benchmark bez regresji.
