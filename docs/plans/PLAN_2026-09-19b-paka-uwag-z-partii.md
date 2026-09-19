# PLAN 2026-09-19b — paka uwag właściciela z partii testowych (A–L)

Zgłoszenie właściciela: „mega paka uwag z testowych partii” — 13 punktów
(A, B, C, D, E1, E2, F, G, H, I, J, K, L). Zlecenie: podzielić na paczki,
napisać plan, wypchnąć, potem naprawiać i wypychać po kolei (jeden commit =
jedna paczka, każda: pin RED → fix → GREEN → mutacja → `npm test` +
`npm run build` → push).

Baza sesji: `03e5a25` (PR #130 domknięty opisem). Ten plan idzie do **PR #130**
jako kolejny commit (1 gałąź = 1 PR, ADR 0020 D — tylko nowe commity).

## Rozpoznanie wstępne (zmierzone)

- Katalog zawiera wszystkie zgłoszone karty: `cloudbound-moogle`,
  `youre-not-alone`, `thieves-tools`, `stirring-bard`, `inferno-titan`,
  `marut`, `caves-of-chaos-adventurer`, `sheriff-of-safe-passage`,
  `seers-lantern`, `crumb-and-get-it`, `oin-the-brave`.
- Wstępne kotwice kodu (do potwierdzenia w paczkach):
  - **A** — `queueSearchChoice` (effects.js ~762) otwiera decyzję z opcją
    „znajdź / zrezygnuj”, a `mandatory` istnieje tylko dla kryteriów bez
    jakości; tutor z Kryterium (typecycling) ma warianty szukania I odmowy.
  - **C** — `attackerCanBeBlocked` (heuristic-bot.js ~44) zna `cantBeBlocked`
    i `cantBeBlockedByPower`, ale NIE ewazję z equipmentu
    (`cantBeBlockedFromEquipment`, combat.js ~14) — bot nadal widzi blokera.
  - **D** — `keywordGrantWindowValue` (~2725) dla `['menace','haste']` daje
    `+2 + moc` już w `precombat_main`, nie wymagając intencji ataku.
  - **F** — `create_token` z `amount: 'mana_from_treasure_spent'` czyta
    `sourceObject.manaFromTreasureSpent` (effects.js ~2286) — do sprawdzenia,
    czy pole realnie jest zapisywane przez `castPermanent` (resources.js).
  - **G** — `exile_top_playable_until_next_turn` (effects.js ~1281) stempluje
    `untilTurn: turn.number + (isMyTurn ? 2 : 1)`; Caves of Chaos Adventurer
    ma brzmienie „this turn” (bez „next”), więc okno prawdopodobnie za długie.
  - **H** — `plot: { cost, colors }` + ścieżka `cast_permanent`; stempel
    plotowanego permanentu i ścieżka darmowego rzutu do sprawdzenia.
  - **J** — filtr zdolności many istnieje TYLKO w panelu
    (`isManaAbilityCommand`, render.js ~768); `hasMeaningfulDecision`
    (session.js ~3296) wyklucza jedynie `pass_priority/concede/tap_for_mana/
    resolve_combat`, więc `activate_ability` zdolności many liczy się jako
    decyzja i blokuje auto-pass (dokładnie objaw właściciela).
  - **L** — badge pompki ze statyki `condition: { enduringStory: true }`
    renderuje się jako „+1/0” bez etykiety mechaniki (render.js, badge kafla).
  - **E2** — `token_merfolk` ma hexproof; brak w modalu podziału obrażeń
    Merfolk Tokenu bota może być POPRAWNY, gdy źródłem jest czar/zdolność
    człowieka (CR 702.11b — hexproof chroni przed zdolnościami przeciwników).
    Do rozstrzygnięcia pomiarem, nie założeniem.

## Paczki

### P1 — Cyclerzy: wybór bez alternatywy rozstrzyga się sam (A)
Zakres: A. „Skoro wybieram Plainscycling, to wybieram” — po aktywacji
typecyclingu nie może być oferty „znajdź / nie znajduj (rezygnuj)”, gdy
kryterium jest JAKOŚCIOWE („search your library for a Plains card”) — fail to
find nadal legalny, ale tylko gdy naprawdę nie ma kandydata; przy 0 kandydatów
efekt rozstrzyga się sam (przeszukanie + tasowanie), a przy kandydatach
decyzja jest JEDNOznaczna: znajdź. Uwaga na CR 701.19b (fail to find) —
właściciel oczekuje realizacji automatycznej, ale nie zgody na łamanie reguły:
przy 0 kandydatów automat; przy ≥1 kandydacie wybór karty zostaje (jest
alternatywa — KTÓRĄ kartę), natomiast znika wariant „rezygnuję” dla cyclingów
(brak alternatywy „nie znajduj”, bo wybrałeś cycling). Wspólne dla wszystkich
cyclingów/land-cyclingów (skan katalogu: ile zdolności z `cycling`).
Piny: cykl zwykły (draw) przy pustej bibliotece przegrywa? — nie: zwykły
cycling zawsze dobiera; typecycling z kandydatami = brak wariantu odmowy;
typecycling bez kandydatów = brak decyzji; mutacja: przywrócenie `mandatory:
false` w ścieżce cycling → RED.

### P2 — Treść w „Rozgrywce”: skutek czaru i modal decyzji rzutu (B, K)
Zakres: B — „You’re Not Alone zostaje rozstrzygnięty” bez treści efektu
(warunkowy pump +2/+2 / +4/+4 przy 3+ stworach); K — Crumb and Get It: opcje
giftu nie mogą być widoczne w „Twoje działania” przed rzutem; najpierw oferta
rzutu, po kliknięciu — decyzja o darze.
Piny: B — zdarzenie rozstrzygnięcia niesie treść (pump z warunkiem), opis
w Rozgrywce zawiera P/T i warunek (nie nazwę karty w regule; ADR 0002);
K — panel akcji dla czaru z `gift` pokazuje JEDEN wariant rzutu, a warianty
`gifted: true/false` pojawiają się dopiero w oknie decyzji po wyborze rzutu;
mutacje: zdjęcie opisu → RED, przywrócenie giftu do panelu → RED.

### P3 — Panel: kontrolerzy w podziale obrażeń, nazwane badge (E1, E2, L)
Zakres: E1 — modal podziału obrażeń (Inferno Titan) nie mówi, KTO kontroluje
kandydatów; E2 — brak Merfolk Tokenu bota w tym samym modalu (hexproof) —
najpierw POMIAR (czy źródło należy do człowieka: wtedy poprawne CR 702.11b,
pin dokumentacyjny + komunikat; jeśli źródło bota, to realny błąd filtra);
L — Óin the Brave: badge pompki ze statyki `storied` ma brzmieć
„Storied: +1/+0”, nie „+1/0”.
Piny: E1 — etykieta kandydata niesie kontrolera („Twój/Nieprzyjaciela”);
E2 — pomiar + pin na wynik rozstrzygnięcia; L — badge z etykietą mechaniki
(deskryptor, nie nazwa karty); mutacje po jednej na pin.

### P4 — Wycena bota: ewazja z equipmentu i okno combat tricku (C, D)
Zakres: C — Thieves’ Tools: nosiciel 1/1 z „can’t be blocked as long as
power ≤ 3” nie jest widziany jako nieblokowalny (`attackerCanBeBlocked` nie
zna ewazji z załącznika), więc bot nie atakuje darmowym obrażeniem; D —
Stirring Bard: `{T}: cel dostaje menace i haste do końca tury` — bot używa
tego w Main 1 na stworze, który nie może atakować; ma używać TYLKO w swojej
turze w kroku deklaracji atakujących (przed decyzją), wobec stwora, który
(a) ma chorobę przyzwania i haste go odblokuje, albo (b) realnie zaatakuje
z menace; każde inne okno = kara (nie „4 pkt za efekt”).
Piny: C — bot atakuje nosicielem, gdy jedyni blokerzy mają moc ≤ progu;
D — brak aktywacji w Main 1; aktywacja w declare_attackers wobec stwora
z chorobą przyzwania i wobec atakującego z menace; kara w innych oknach;
mutacje: usunięcie ewazji z wyceny → RED (C), przywrócenie premii w main1 →
RED (D).

### P5 — Mana, koszty i auto-pass (F, I, J)
Zakres: F — Marut: mana ze Skarba wydana na rzut ma dać token za KAŻDĄ
wydaną sztukę („for each mana from a Treasure spent”); I — Seer’s Lantern:
pomiar, czy zapłata to 3 many (możliwy błąd płatności/podpowiedzi — do
odtworzenia sceną); J — auto-pass: zdolność many nie może być liczona jako
realna decyzja, jeśli panel jej nie pokazuje (JEDNO źródło predykatu dla
panelu i auto-passu — L41; dotyczy wszystkich kart produkujących manę).
Piny: F — rzut Marutem z 2 many ze Skarbów → 2 tokeny (i 0 przy wejściu inną
drogą); I — pomiar + pin kosztu/płatności; J — sesja nie zatrzymuje auto-passu
na zdolności many, ale nadal zatrzymuje na zdolności z wyborem; mutacje po
jednej na pin.

### P6 — Okna czasowe: impuls i plot (G, H)
Zakres: G — Caves of Chaos Adventurer: „you may play that card THIS TURN”
(karta widziana jako „zagrywalna do końca tury 27” przy turze 25 — okno za
długie o turę); H — Sheriff of Safe Passage: plot nie działa (po zagraniu za
koszt plotu karta w exile, następna tura oferuje rzut ZA PEŁNY koszt), a opis
w „Twoje działania” nie mówi „Plot”.
Piny: G — stempel okna kończy się w turze zagrania (this turn), a nie
w następnej; H — plotowany permanent w następnej turze ma ofertę rzutu BEZ
many + etykietę mówiącą o plocie; mutacje po jednej na pin.

## Kolejność i zasady

P1 → P2 → P3 → P4 → P5 → P6 (każda: pin RED → fix → GREEN → mutacja →
bramy → commit → push). Każda paczka, która okaże się NIE błędem (np. E2 przy
hexproof), kończy się pinem dokumentacyjnym i notką w raporcie — nie cichym
pominięciem (L27). Ograniczenia bez zmian: ADR 0002 (reguły bez nazw kart),
ADR 0018 (bez pełnego B0), ADR 0029 (katalog kart nie rośnie), ADR 0005
(determinizm), L92 (liczby bram mierzone, nie przepisywane).

## Stan realizacji (2026-09-19b, domknięcie)

| Paka | Punkty | Commit | Bramy po pace |
|---|---|---|---|
| P1 | A | `8564adb` | `npm test` 5870/5870, build 64 / 3856,6 kB |
| P2 | B, K | `804e4a8` | `npm test` 5876/5876, build 64 / 3855,5 kB |
| P3 | E1, E2, L | `3d7bc31` | `npm test` 5876/5876, build 64 / 3860,6 kB |
| P4 | C, D | `a3a6587` | `npm test` 5887/5887, build 64 / 3863,2 kB |
| P5 | F, I, J | `1f38cc9` | `npm test` 5899/5899, build 64 / 3869,3 kB |
| P6 | G, H | `6130760` | `npm test` 5907/5907, build 64 / 3872,0 kB |
| P7 | F/2 (log) | `65409d1` | `npm test` 5911/5911, build 64 / 3875,3 kB |

Notka P5/F (pomiar, nie założenie): ścieżka kredytu „for each mana from
a Treasure spent to cast it” jest w przepływie BOTA poprawna (pin F/1: bot
aktywuje Skarb → bot rzuca Maruta → 1 nowy token; F/5: 2 sztuki → 2 tokeny;
F/6: rzut z samych lądów → 0 nowych). Fuzz 480 scen decyzyjnych bota (5–9
lądów × 1–2 Skarby × 4 ręce × 12 seedów) dał 384 rzuty Marutem i ZERO
przypadków „Skarb poświęcony w kroku, a rzut bez kredytu”. Zmierzony obok
defekt (naprawiony bramką `sacrificeSelf` w wycenie kastru): próg odblokowania
M128 uznawał kartę za wymagającą Skarba, choć wycena kastru była ≤ 0 — Skarb
ginął bez zużycia many; po fixie 0/556 aktywacji bez zużycia (harness
eventowy, 400 gier). Zgłoszenie właściciela bez odtworzenia w silniku.
**Decyzja właściciela (2026-09-19b): F zamknięte** — „Może ta mana poszła na
coś innego, jak mówisz, że jest w kodzie ok to jest ok”. Piny F/1–F/6 (kredyt
za KAŻDĄ wydaną sztukę, 0 przy wejściu inną drogą) i bramka `sacrificeSelf`
zostają jako straż regresji.

**P7 (F/2) — log właściciela rozstrzygnął kolejność.** Sekwencja z partii
(„Zagrywa Marut → aktywuje Treasure → Marut wchodzi → trigger bez efektu →
Zagrywa Scorch Spitter”) odtworzyła się sceną 1:1 i pokazała, że brakujący
token to wada WYCENY bota: rzut Maruta zapłaciły lądy, a mana ze Skarba
(posunięta PO rzucie) sfinansowała Scorch Spittera. Karta Marut zwraca każdą
manę ze Skarbów wydaną na rzut (deskryptor `create_token` +
`mana_from_treasure_spent`), a płatność zużywa Skarb pierwszy (`spendMana`:
treasure-first) — więc Skarb PRZED rzutem jest darmowy. Fix: akcja-przed
`treasureRefundLead` (wszystkie dostępne Skarby przed rzutem, wartość z wyceny
tego rzutu + margines). Pomiar (200 gier mirror, ten sam seed-set):
przed — 4/78 rzutów Marutem z maną ze Skarbów (4 zwrócone sztuki);
po — 17/77 rzutów i 31 zwróconych sztuk; benchmark heuristic 82,0%.

Notka P5/I: Seer’s Lantern to NIE błąd płatności — rzut kosztuje 3 ({3}
w katalogu i `mana-costs`), a „2” z uwagi to druga zdolność karty
(„{2}, {T}: Scry 1”); pin dokumentacyjny I/1–I/2 (etykiety rozdzielają oba
koszty).

Notka P3/E2 (bez zmian): brak Merfolk Tokena w modalu podziału obrażeń jest
POPRAWNY — hexproof (CR 702.11b) wyklucza cel; pin dokumentacyjny.
