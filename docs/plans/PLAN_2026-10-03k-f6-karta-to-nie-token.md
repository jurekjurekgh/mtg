# PLAN 2026-10-03k — F6: „czy obiekt jest KARTĄ" to jawna flaga `isToken`, nie `name != null`

Zlecenie: „kontynuuj z kolejnym zadaniem" — pozycja 1 kolejki z
`docs/setup/HANDOFF_2026-10-03f.md` (pętla jakości, ADR 0021), znalezisko F6 z
`docs/audits/AUDYT_PR153_2026-10-03.md`.

## Problem (zmierzony, nie przeczuty)

Audyt PR #136 (F-2) naprawił predykat celu „card from an opponent's graveyard"
na jawnej fladze `zones.isCardInOpponentGraveyard` (CR 108.2b), ale **bliźniacze
gałęzie zostały na heurystyce `name != null`** („tokeny mają nazwę, karty nie").
Pole `name` nosi także KOPIA permanentu z `enterAsCopy` (nazwa kopiowalna,
CR 707.2 — `game-state.js` „name: target.cardName ?? target.cardId") i nie jest
kasowane przy zmianie strefy, więc poległa kopia była „nie-kartą" w:

- licznikach typów kart: delirium (CR 207.2c), Tarmogoyf/Disy (CR 205.3m),
- warunku Gray Slaada („four or more creature cards in your graveyard"),
- pulach celów „…card from your graveyard" (Mystic Sanctuary, Ironclad Slayer,
  Circle of the Land Druid, Annie Flash — `permanent_card_in_graveyard`),
- warunku descend/triggerze „card into your graveyard from anywhere other than
  the battlefield" (Disa), czyli także w zdarzeniach, nie tylko w odczytach.

Do tego w kontrolerze bota filtr był **MARTWY**: widok nie wystawia `name` poza
polem bitwy (grób niesie `kind`/`types`/P/T od M274, ale nie `name`), więc bot
liczył nazwane kopie, a silnik nie — dwie ścieżki, dwa wyniki (L1/L41/L48).

Sonda PRZED (usunięta po naprawie, wyniki w audycie i w komentarzu testu):

```
3 zwykłe karty (Instant, Sorcery, Land) + poległa nazwana kopia (Creature)
SILNIK delirium: 3 / Tarmogoyf: 3     ← kopia pominięta
WIDOK bota:      4                    ← kopia policzona (filtr `name` martwy)
wpis grobu: {id, cardId, controllerId, zone, plotted, kind, types, power, toughness, manaCost, colors}
```

## Zakres (F6 jako pętla jakości, nie nowa mechanika)

1. `zones.isCardObject(object)` = `!object.isToken` — jedno źródło reguły
   w NAJNIŻSZEJ warstwie grafu importów (bez cyklu).
2. Przepisać 12 kopii heurystyki: `triggers.js` (6 miejsc: delirium, 4 gałęzie
   puli celów, Disa, descend), `permanents.js` (2: Gray Slaad, Tarmogoyf),
   `effects.js` (2: Forever Young, Sequestered Stash), `game-state.js`
   (1: kandydaci „put on top"), plus mylący wykrywacz tokenów po prefiksie
   `cardId` (oczyszczanie poza polem bitwy) i filtr bota.
3. Widok: wystawić `isToken` także poza polem bitwy (grób jest strefą publiczną,
   CR 400.2) — bez tego bot nie ma z czego odczytać reguły (ADR 0017).
4. Poprawić 4 niedokładne fixture'y testów, które „token" ustawiały polem `name`
   (dowodziły reguły, której silnik nie miał) — w tym jeden pin był WAKACYJNY
   (typ tokenu powtarzał typ innej karty).
5. NOWY plik pinów `test/karta-to-nie-token-nazwana-kopia-w-grobie.test.js`
   (A1–A4, B1–B2, C1, D, E) + dowód mutacyjny m1–m6.

## Kryteria ukończenia

- [x] `npm test` zielone (fast) i `npm run build` zielone.
- [x] Każdy pin czerwienieje po cofnięciu naprawy (m1–m6 udokumentowane).
- [x] Anty-over-fix: token w grobie nadal nie jest kartą (A3, A4, B2).
- [x] Silnik i bot liczą to samo na tym samym stanie (D).
- [x] `bot-scoring-snapshot` bez regeneracji fixture.
- [x] Zero nazw kart w kodzie silnika (ADR 0002); karty w testach z katalogu
      właściciela (ADR 0029 — nic nie dodano).
- [x] Wpis w `docs/PROJECT_HISTORY.md` + handoff + status F6 w audycie PR #153.

## Wykonanie (2026-10-03k)

- Commit `898c238` — naprawa + piny + fixture'y; `npm test` **7513/7513** EXIT 0,
  `npm run test:all` **7784/7784** EXIT 0 (407,2 s), build 70 modułów / 4803,8 kB,
  `event-contract-audit` 0 naruszeń, snapshot 4/4.
- Mutacje (wszystkie oczekiwane RED, po przywróceniu zielone): m1 → A1,
  m2 → A2 (i D), m3 → B1, m4 → D, m5 → D+E, m6 → C1.

- Dokumentacja: `docs/PROJECT_HISTORY.md` `2026-10-03k`, status F6 w
  `docs/audits/AUDYT_PR153_2026-10-03.md`, handoff `docs/setup/HANDOFF_2026-10-03g.md`.
