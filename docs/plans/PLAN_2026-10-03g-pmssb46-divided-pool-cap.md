# Plan PMSSB-46 (2026-10-03g): O1 DIVIDED_POOL_CAP — gracz-przeciwnik wypada z puli celów przy 8+ wrogich stworach

## Kontekst (wejście)

Obserwacja z audytu PR #150 zapisana w HISTORY (linia ~15095):

> O1 `DIVIDED_POOL_CAP = 8` (gracz-przeciwnik wypada z puli przy 10 wrogich stworach — kolejka handoffu)

Funkcja `dividedDamageDivisions` (`src/engine/spells.js` L2462) generuje oferty
podziału obrażeń (Fiery Justice) i przycina listę kandydatów do stałego CAP=8,
posortowaną wg `rank()`:

```js
const rank = (id) => {
  if (isPlayer(id)) return id === playerId ? 3 : 1;    // gracz-wróg = 1
  const target = state.objects.get(id);
  if (target?.kind === 'creature') return target.controllerId === playerId ? 4 : 0;  // wróg-stwór = 0
  return 2;
};
const pool = [...candidates].sort((a,b) => rank(a)-rank(b)).slice(0, DIVIDED_POOL_CAP);
```

Przy 8+ wrogich stworach cały CAP wypełniają stwory (rank=0) — gracz-wróg (rank=1)
i moje stwory (rank=4) wypadają mimo, że są jawnymi, legalnymi celami. Bot i gracz
dostają 792 oferty (stała dla k=1..5 celów wśród 8 kandydatów), ale żadna z nich
nie pozwala przypisać obrażeń do gracza-przeciwnika — Fiery Justice nie może
dobić gracza przy szerokim stole, chociaż reguły (CR 601.2d) na to pozwalają.

## Diagnoza (sonda `tools/probe-pmssb46-o1-dividedpool.mjs`)

Sonda ustawia 6 landów R/G/W, rzuca Fiery Justice z ręki przy n wrogich 1/1:

| n wrogich | oferty | stwory w puli | gracz p2 w puli | wynik |
|-----------|--------|---------------|-----------------|-------|
| 3         | 126    | 3/3           | tak             | OK    |
| 7         | 792    | 7/7           | tak             | OK    |
| 8         | 792    | 8/8           | **nie**         | BUG   |
| 9         | 792    | 8/9           | nie             | BUG   |
| 12        | 792    | 8/12          | nie             | BUG   |

Już przy 8 wrogich stworach (nie 10, jak szacowano w HISTORY) gracz wypada.

## Naprawa (generyczna, ADR 0002)

**Zasada:** pula przycięta do CAP=8 zawsze musi mieścić reprezentację każdej
klasy celów, by gracz mógł wybrać dowolny LEGALNY profil (creature opponent,
player-opponent, planeswalker, own creature) nawet przy szerokim stole. Najniższy
koszt informacyjny: **rezerwuj** po 1 miejscu w puli dla każdej nie-pustej
klasy innej niż najwyższa w rankingu, resztę wypełniaj po ranku.

W praktyce dla Fiery Justice (typ celu `any_target`, bez my-creatures):
- rezerwacja 1 miejsca dla gracza-wroga (rank=1);
- rezerwacja 1 miejsca dla planeswalkera (rank=2, jeśli jest);
- pozostałe 6 miejsc – stwory wroga posortowane po jakości (moc, wytrzymałość,
  można użyć dotychczasowy rank jako tie-breaker z dodatkowym porządkiem:
  stwory z większą mocą najpierw, bo lepszy cel burna).

Krytyczny warunek: **walidacja nie może przepuszczać ofert z celem spoza
ograniczonej listy** (L48) — nie zmieniamy walidacji, tylko pulę z której
generujemy oferty. Każdy pojedynczy cel spoza listy nadal może być wybrany w
innej kombinacji? Nie — jeśli cel nie jest w `pool`, nie pojawi się w
`damageDivision` żadnej oferty. Trzeba więc wystawić taki podział, żeby:
1. Każdy pojedynczy cel z `candidates` mógł być SOLO-celem (k=1) — co najmniej
   jeden podział na tego id.
2. CAP podniesiony minimalnie do gwarancji (1) lub rozszerzony o reprezentację klas.

**Najmniej inwazyjna naprawa:** dla k=1 (pojedynczy cel) wrzuć WSZYSTKICH
kandydatów (gwarancja, że „rozbij wszystkie 5 w głowę" zawsze jest możliwe),
a dla k≥2 użyj obecnego posortowania z CAP.

To zwiększa liczbę ofert z 792 do (N_candidates) + (dla k=2..5 na top 8) —
dla N=12 to 12 + 792 − 44 = ~760 dodatkowych ofert dla k=1, mieszcząc się
w szybkim tierze testów.

Alternatywnie: rozszerz CAP o 1 jeśli jest gracz w candidates (gracz zawsze
wchodzi) — ale to nadal nie gwarantuje, że wąskie wyszukanie „jeden stwór"
znajdzie 9-tą i dalszą kreaturę. Zgodnie z uwagą w komentarzu źródłowym:
"stwory wroga najpierw, potem gracze, na końcu własne stwory — to one wypadają"
— własne stwory wypadać mogą (są samobójcze i bot ich nie powinien wyceniać
jako wartościowe), ale gracz jest krytyczny dla zamknięcia zegara.

**Wybrany kształt (najbezpieczniejszy):**
1. Posortuj kandydatów wg dotychczasowego rank (stabilnie).
2. Zbuduj `pool` o rozmiarze min(`DIVIDED_POOL_CAP`, len(candidates)) ale
   GWARANTUJĄC, że jeśli w `candidates` jest jakikolwiek gracz-inny-niż-my,
   to jeden taki gracz znajdzie się w `pool` (wymieniając ostatnie miejsce
   jeśli zabrakło).
3. Dodatkowo: własny stwór również nie zostaje wygarnętowany przez stwory wroga,
   ale dla Fiery Justice self-harm jest sytuacją marginalną — odpuszczamy
   (ADR 0022 §4: tylko to co mamy dowodowo potrzebne).
4. Planeswalkerzy również mają rank=2 i wchodzą przed moimi stworami — przy
   8 wrogich stworach też wypadają, ale w taliach benchmarku jest mało PW,
   zostawiamy odrębnie (kod na zapas).

Podejście to NIE łamie złotej reguły „stwor wroga jest lepszym celem niż gracz",
gdy stół jest mały — gwarantuje tylko, że gdy pula jest przycięta, gracz nie
wypada (nadal jest w puli na pozycji 8, a stwory z najmniejszego ranku 0 są
odrzucane).

## Etapy

- [x] Etap 0 — sonda: potwierdzono buga dla n≥8, gracz p2 znika z damageDivision
- [x] Etap 1 — naprawa w `spells.js/dividedDamageDivisions` (rezerwacja miejsca dla gracza-wroga)
- [x] Etap 2 — piny O1–O4 w `test/pmssb46-divided-pool-cap.test.js`
- [x] Etap 3 — mutacja (cofnij rezerwację → 3/4 pinów RED; O3 przechodzi bo n=7 bez cięcia)
- [x] Etap 4 — bramki: fast **7492/7492** (+4 piny), build **70 / 4799,2 kB**, event-contract-audit 0 naruszeń, bot-scoring-snapshot **6/6 zielony** (bez dryfu)
- [x] Etap 5 — docs (PMSSB §46, HISTORY, handoff 03e)

## Pliki do zmiany

- `src/engine/spells.js` L2462 (`dividedDamageDivisions`)
- `test/pmssb46-divided-pool-cap.test.js` (nowy)
- `docs/PMSSB.md` §46
- `docs/PROJECT_HISTORY.md`
- `docs/setup/HANDOFF_2026-10-03e.md`
- `docs/plans/PLAN_2026-10-03g-pmssb46-divided-pool-cap.md` (ten plik)

## Piny

- O1: przy 8 wrogich 1/1, Fiery Justice w ręce, 6 landów R/G/W — przynajmniej
  jedna oferta rzutu ma damageDivision celujący w `p2` (gracz-wróg).
- O2: przy 12 wrogich 1/1 — jw., przynajmniej jedna oferta na `p2`.
- O3: regresja — przy 7 wrogich 1/1 pula nadal liczy 792 oferty (jak dotąd).
- O4: walidacja rzutu z oferty zawierającej `p2` przechodzi execute OK (rzut
  nie jest odrzucany jako „nielegalny cel").
