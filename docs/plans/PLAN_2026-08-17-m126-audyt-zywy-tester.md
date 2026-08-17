# PLAN M126 — polowanie na 10 nowych błędów Żywym Testerem

Data: 2026-08-17 · gałąź `arena/01a00fa6-mtg` · PR #57

## Zlecenie właściciela

> „Wykorzystaj Żywy tester i postaraj się znaleźć 10 nowych błędów."

Kontynuacja M122 (poprzednie 10) — tym razem po naprawach M123–M125, więc
łatwe klasy błędów były już wyczerpane.

## Metoda

Pięć serii po 12 partii (N, O, P, R, S) — **60 rozgrywek** na artefakcie
`dist/mtg-table.html`, wszystkie kombinacje talii × 5 profili gracza.
Detektory zgłosiły niewiele (głównie znane wzorce Bone Splinters), więc
ciężar padł na **skany celowane** i audyty rodzin (L27: „zero zgłoszeń"
znaczy „nie mam reguły", nie „jest czysto").

## Znaleziska (10 naprawionych)

| # | Błąd | Warstwa |
|---|---|---|
| 1 | explore przy PUSTEJ bibliotece: koszt przepada bez skutku | UI |
| 2 | Dragon Arch bez wielokolorowego stwora w ręce — j.w. | UI |
| 3 | tester ZWIJAŁ identyczne kafle → 2 permanenty jako 1 | tester |
| 4 | surowe `creature_without_subtype`, `equipment_you_control` (51×) | UI |
| 5 | surowy licznik `stun×2` na kaflach (37×) | UI |
| 6 | „**?** dostaje +1 licznik -1/-1" — brak LKI dla zmarłego obiektu | UI+engine |
| 7 | „0 karty **idą** do grobu" — zła odmiana rzeczownika i czasownika | UI |
| 8 | „odrzuca N **karty**" (Nightsnare) — brak `polishPlural` | UI |
| 9 | „osiąga N **liczników** charge" — j.w. dla 2/3/4 | UI |
| 10 | bot marnował manę na jałowe explore/scry/Dragon Arch | bot |

## Decyzje projektowe

- **Rodzina zamiast pojedynczego przypadku.** Zgłoszenie dotyczyło jednej
  karty, audyt obejmował całą klasę: #1 → 4 karty (Compass, Lantern, Campus,
  Cellar Door), #4 → 6 typów celu (tester trafił 2), #5 → 2 liczniki
  (tester trafił 1), #6 → oba zdarzenia liczników.
- **Strażniki, nie łatki.** Dwa nowe niezmienniki w `card-sources-guard`:
  każdy typ celu i każdy licznik z bazy ma polską etykietę. To trzeci raz,
  gdy fallback `MAPA[key] ?? key` wypuścił slug do UI (L29).
- **Anty-over-fix obowiązkowy.** Osobne testy pilnują, że przy PEŁNEJ
  bibliotece nie ma ostrzeżenia, bot nadal używa explore, a zdolność MANY
  Seer's Lantern działa mimo jałowego scry.

## Odrzucone jako fałszywe tropy

- Shiv's Embrace 5× w turze — pompowanie **niezablokowanego** atakującego,
  9 obrażeń (14→5). Optymalna gra bota.
- Jeskai Devotee / Soulmender „powtórzenia" — duplikaty snapshotów.
- „1 życia", „3 obrażeń", „utrata 1 życia" — poprawny dopełniacz.
- Dragonbroods\' Relic „only as a sorcery" z timing `instant` — dotyczy
  DRUGIEJ zdolności, która ma poprawny timing.
- Vehicle/Spacecraft z P/T bez typu Creature — zgodne z zasadami.
- „• morph blokuje…" — celowa nazwa zakrytej karty (CR 708.2).

## Pomiary

- `npm run test:all` **2133/2133**, 0 failów (+10 od M125).
- Benchmark: heuristic vs aggro **61,7 %**, ogółem 75,3 % — bez regresji
  (`tools/b16-m126-2026-08-17.txt`).
