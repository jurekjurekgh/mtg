# AUDYT ŻYWYM TESTEREM M256 (2026-08-29) — runda 2: kardynały z M255

**Zlecenie właściciela:** „Proponuję rundę Żywym Testerem do wyczerpania
budżetu", potem: domknięcie dwóch kardynałów z `AUDYT_M255_ZYWY_TESTER`
(precyzja „trigger bez efektu"; okno bloodrushu) wraz z dokumentacją.

Niniejszy raport jest dowodem audytu — transkrypty (`tmp-audyt-m256/`, poza
repo, decyzja właściciela 2026-08-28) są artefaktami przebiegu.

## Metoda

- Świeży build `dist/` (L76) przed każdą rundą; `npm i` w `tools/table-tester`
  (jsdom). Uwaga operacyjna: sandbox czyści `node_modules` i `dist`, a katalogi
  poza repozytorium (`/home/user/tmp-audyt-*`) znikają przy restarcie —
  dlatego skrypt przebiegu i transkrypty leżą w gitignorowanym
  `tmp-audyt-m256/` **wewnątrz** drzewa roboczego (strażnik
  `test/repo-artefakty-audytu.test.js` patrzy na pliki ŚLEDZONE).
- **Runda 2 — 18 partii** (build przed poprawką): talie, które dostały karty
  w Batchu 51, oraz talie spoza próbki benchmarku (`worek-*`); profile
  `explorer / random / greedy / defensive / impatient`, seedy 101–191,
  `--steps 260`.
- **Runda 2b — 20 partii**: partie kontrolne na częściowej poprawce + 15 prób
  okna bloodrushu profilami `greedy / random / explorer / defensive`.
- **Runda 2c — 17 partii** (build po PEŁNEJ poprawce): 7 kontrolnych (te same
  adresy co w rundzie 2 — porównanie komunikatu przed/po) + 10 nowym profilem
  `hoarder`.
- Detektory (osie 1–4) + **ręczna lektura** transkryptów (L27/L40: zero
  zgłoszeń detektorów to dolne ograniczenie, nie dowód poprawności).

| Runda | Partie | Zakończone | Detektory |
|---|---|---|---|
| 2 | 18 | 18 × „KONIEC PARTII" (15 wygrywa Bot, 3 Gracz) | 17 × 0, 1 × 1 (`noop`) |
| 2b | 20 | 20 × „KONIEC PARTII" | 20 × 0 |
| 2c | 17 | 17 × „KONIEC PARTII" (15 Bot, 2 Gracz) | 16 × 0, 1 × 1 (`noop`) |
| 3 | 21 | 21 × „KONIEC PARTII" (17 Bot, 4 Gracz) | 21 × 0 |

Runda 3 szła po taliach, których runda 2 nie dotknęła (`dominaria-wu`,
`final-fantasy`, `forgotten-realms`, `innistrad-wu`, `mirrodin-brg`,
`wiedzmin`, …), profilami `explorer / impatient / defensive / greedy / random /
hoarder`, seedami 301–322. **Uczciwa uwaga:** 22. zaplanowana partia nie
powstała — w skrypcie przebiegu wpisałem nazwę talii z literówką
(`forgoten-realms`), tester zgłosił to jako błąd (M203: nieistniejąca talia to
błąd, nie cichy fallback), a filtr logu przepuścił tylko nagłówki. Zostaje
przy zapisaniu: 21 partii, brak śladu w logu to wina skryptu, nie silnika.

Żadnego `[STOP] brak akcji`, żadnego odrzucenia komendy, żadnego przekroczenia
limitu kroków.

## Znalezisko H (silnik + log) — „trigger bez efektu" nie odróżniało PUSTEGO ZBIORU ODBIORCÓW

**Objaw (runda 2, 12 wystąpień w 18 partiach):**

```
Trostani Discordant — trigger bez efektu (nie było czego wykonać)   ×4
Veiled Ascension    — trigger bez efektu (nie było czego wykonać)   ×3
Jyoti, Moag Ancient — trigger bez efektu (nie było czego wykonać)   ×3
Plague Reaver       — trigger bez efektu (nie było czego wykonać)   ×1
Chronic Flooding    — trigger bez efektu (nie było czego wykonać)   ×1
```

W czterech pierwszych wypadkach komunikat był NIEPRECYZYJNY: karta nie miała
na kim działać (brak zakrytych stworów / brak cudzych stworów / brak
stworów-lądów / brak innych stworów), a gracz dostawał zdanie, które sugeruje
usterkę. Dokładnie to przewidział kardynał 1 z `AUDYT_M255`.

**Przyczyna:** `resolveTrigger` wnioskował powód z LICZBY nowych zdarzeń
(`producedNothing`). Milczenie ma trzy źródła — pusty zbiór odbiorców, brak
paliwa (pusta biblioteka) i stan już docelowy (CR 701.20b) — a proxy z
M106/Z2 rozróżniało tylko dwa z nich.

**Naprawa (wspólny mianownik, L28/ADR 0002):**

1. `EMPTY_RECEIVER_EFFECTS` (`src/engine/triggers.js`) — tabela selektorów
   kluczowana TYPEM EFEKTU, która zwraca **POWÓD** (`no_targets`,
   `empty_library`) albo `null`. Kolejna przyczyna to kolejna WARTOŚĆ,
   nie kolejny `if`.
2. Selektory wyeksportowane z `src/engine/effects.js` i używane TAKŻE przez
   same efekty — jedna definicja zbioru zamiast dwóch kopii (L41/L48).
   Dotknięte efekty: `add_flying_counter_to_face_down_you_control`,
   `control_to_owners_all_creatures`, `buff_land_creatures`,
   `sacrifice_each_other_creature`, `mill_cards` (cel GRACZEM, który istnieje —
   brakuje kart, stąd osobny powód `empty_library`).
3. `session.js`: `empty_library` → „pusta biblioteka".

**Po poprawce (runda 2c, te same adresy):**

```
Trostani Discordant — trigger bez efektu (brak legalnych celów)   ×4
Veiled Ascension    — trigger bez efektu (brak legalnych celów)   ×2
Jyoti, Moag Ancient — trigger bez efektu (brak legalnych celów)   ×2
Plague Reaver       — trigger bez efektu (brak legalnych celów)   ×1
Chronic Flooding    — trigger bez efektu (pusta biblioteka)       ×1
Jyoti, Moag Ancient — trigger bez efektu (nie było czego wykonać) ×1  ← ETB, 0 tokenów
```

Ostatnia linia zostaje celowo: Jyoti tworzy tokeny „za każde rzucenie
commandera" — w tym formacie zawsze zero, więc „nie było czego wykonać" jest
intencją M106/Z2 (Undead Servant przy pustym grobie).

**Dowód, że anty-over-fix działa w realnej grze (nie tylko w teście):** w tym
samym materiale `Undead Servant` dostał „nie było czego wykonać" ×2 — czyli
przypadek, dla którego M106/Z2 powstało, nadal jest raportowany po staremu.

**Ścieżka celowana (M189/Z2) bez zmian** — w r2b/r2c „brak legalnych celów"
dostały też: Breaching Hippocamp ×2, Azorius Justiciar, Squire's Lightblade,
Frost Lynx. Żadnego nowego „nie było czego wykonać" spoza ustalonej intencji.

**Uwaga metodologiczna:** runda 2b (20 partii) pobiegła na buildzie z CZĘŚCIOWĄ
poprawką (tylko dwa pierwsze wpisy tabeli) — dlatego jej kontrolne komunikaty
dla Jyoti i Plague Reavera są jeszcze stare. Wyniki „po" brane są wyłącznie
z rundy 2c (build po pełnej poprawce).

## Znalezisko I (silnik) — Village Bell-Ringer: legalny no-op ZBIOROWY

Znalezione **skanem katalogu**, nie transkryptem (strażnik H7): „untap all
creatures you control" ma w zbiorze SAMO ŹRÓDŁO, więc pusty zbiór odbiorców
jest niemożliwy; za to „wszystkie stwory już odkręcone" to wykonana zdolność
(CR 701.20b), a nie porażka triggera — dokładnie przypadek M106/Z2 (Glaring
Aegis na już tapniętego stwora). Naprawione osobną tabelą
`STATE_IDEMPOTENT_MASS_EFFECTS` (predykat dostaje CAŁY zbiór, nie jeden
obiekt); wpis `untap_all_creatures_you_control` w `EMPTY_RECEIVER_EFFECTS`
został wycofany, bo oznaczałby coś, co nie może się zdarzyć.

## Kardynał 2 z M255 — bloodrush:DOMKNIĘTY (nowy profil testera)

W 33 partiach rund M255 + 2b (profile `greedy / random / explorer /
defensive`) nie powstało ani jedno okno, choć `Skinbrand Goblin` bywał w ręce
w 9 partiach (29 snapshotów). **Przyczyna nie leżała w silniku**: stała
kolejność priorytetów sterownika („Zagraj:" przed „Aktywuj:") zagrywała kartę
na stół, zanim powstało okno, w którym mechanika działa.

Nowy profil **`hoarder`** (`tools/table-tester/run-game.mjs`): rozpoznaje karty
z bloodrushem po treści kafla (jak gracz), trzyma je w ręce i używa, gdy tylko
panel wystawi ofertę. Efekt (runda 2c, 2 z 10 partii: `ravnica×alara s203`,
`ravnica×mirrodin-wu s208`):

```
AKCJE: Bloodrush: Skinbrand Goblin (koszt R, odrzuć) → atakujący +2/+1 || Dalej (pass) || Poddaj partię
>> Bloodrush: Skinbrand Goblin (koszt R, odrzuć) → atakujący +2/+1
• Odrzucasz Skinbrand Goblin (koszt: bloodrush)
• Używasz bloodrush: Skinbrand Goblin — odrzuca tę kartę z ręki → cel: Infectious Horror
• Ty: zdolność Skinbrand Goblin rozstrzygnięta
…
• Infectious Horror zadaje 4 obrażenia (Ty)     ← 2 bazowe + 2 z bloodrushu
```

Log i modal z M255/B1–B2 przeszły end-to-end po raz pierwszy; premia jest
policzona (2 → 4).

## Zgłoszenie detektora `[noop]` (Thunderstaff) — zweryfikowane, uznane za poprawne

`warhammer-wu × worek-legend`, seed 157, profil `random`:

```
[noop] Oferta bez skutku — jedyna zmiana to zapłacony koszt
  Aktywuj: Thunderstaff (Ty) (koszt 2, T) — +1/+0 dla atakujących stworów do końca tury
```

Sonda skanuje KAŻDĄ widoczną ofertę raz na partię, więc trafiła aktywację
w oknie bez atakujących — efekt wygasa w cleanup, zostaje sam koszt. To
prawdziwy odczyt sondy, ale **nie błąd**: aktywacja jest legalna (CR 117.1),
a UI nie ukrywa akcji, które gracz może wykonać. Naprawa z rundy M255/E
dotyczyła BOTA (nie ma powodu palić efektu w Głównej 1); człowiekowi panel
pokazuje wszystko, co legalne, i to jest pożądane. Wniosek idzie do kardynałów
(oś 4 w wersji „miękkiej": etykieta ostrzegawcza zamiast ukrywania).

## Sprawdzone i uznane za poprawne (bez zmian)

- **Jyoti, Moag Ancient — ETB**: 0 tokenów przy braku command zone; komunikat
  „nie było czego wykonać" to intencja M106/Z2.
- **„Brak legalnych celów" sprzed tej rundy** (7 wystąpień w rundzie 2):
  Zoraline, Wavecrash Triton, Squire's Lightblade, Servant of the Scale,
  Glaring Aegis, Frost Lynx, Fathom Fleet Cutthroat — trigger celowany bez
  legalnego celu (M189/Z2 działa).
- **Chronic Flooding**: młynowanie działa (2 × 3 karty w tej samej partii);
  jedyne „bez efektu" padło przy pustej bibliotece przeciwnika, który w tej
  samej partii przegrał przez deck-out (talie z generatora mają ~22 karty).

## Znalezisko J (silnik + log) — Silken Strength: odkręcenie OD KRĘCONEGO gospodarza to legalny no-op

**Objaw (runda 3, `final-fantasy × worek-dziki`, seed 316, profil `hoarder`):**

```
[ROZGRYWKA]   • Silken Strength wchodzi na pole bitwy
[ROZGRYWKA]   • Silken Strength — trigger (wejście na pole bitwy)
[ROZGRYWKA]   • Silken Strength — trigger bez efektu (nie było czego wykonać)
```

Oracle: „When this Aura enters, untap enchanted permanent." Gospodarz był
odkręcony — zdolność wykonała się w całości (CR 701.20b: odkręcenie
odkręconego jest legalne), a gracz dostał komunikat o porażce. Ta sama klasa
co M189/Z2 (Glaring Aegis) i M106/Z2e (Steelfin Whale), tylko obiektem efektu
jest **GOSPODARZ aury** (`attachedTo`), nie cel z wyboru ani samo źródło —
dotychczasowa reguła „cel albo źródło" tego nie obejmowała.

**Naprawa:** `untap_enchanted_permanent` trafia do `STATE_IDEMPOTENT_EFFECTS`,
a obiekt bierze nowa, jednoelementowa tabela `STATE_IDEMPOTENT_TARGET`
(aura działa na gospodarza). Testy J1/J1b/J1c.

## Kardynały następnej rundy

1. **Oś 4 „miękka"**: oferta legalna, ale w tym oknie bezużyteczna
   (Thunderstaff w Głównej 1) — rozważyć etykietę/ikonę „efekt nie ma teraz
   odbiorców" zamiast ukrywania akcji (decyzja właściciela).
2. **Jyoti (ETB, `create_token` z `amount: 'commander_casts'`)**: komunikat
   mógłby mówić „0 tokenów (brak rzutów commandera)" — wymagałoby to, żeby
   efekt raportował SWÓJ powód, nie tylko liczbę zdarzeń (ta sama klasa co H,
   ale po stronie KWOTY, nie zbioru). **Uwaga:** obecny komunikat
   („nie było czego wykonać") to jawna intencja M106/Z2, więc zmiana wymaga
   decyzji właściciela, nie samej diagnozy.
3. **Budżet lektury**: po tej sesji ~85 % (L91 waży ~3,5 tys. znaków).

## Bramy

- `npm test` **3725/3725** (+18 testów H1–H7 i J1–J1c względem stanu po M255:
  było 3707, potem 3714 po pierwszej transzy, 3722 po drugiej, teraz 3725).
- `npm run build` **56 modułów / 2893.8 kB**.
- Weryfikacja mutacyjna (9 mutacji, każda cofnięta jedną edycją, pliki
  przywracane z kopii zapasowych — L88): `zawsze no_result` → H1, H1c, H2;
  `zawsze no_targets` → H3; selektor bez filtra kontrolera → H1c; selektor
  właściciela zawsze pusty → H2b; wycięcie `buff_land_creatures` → H4, H7;
  `sacrifice_each_other_creature` → H5, H7; `mill_cards` → H3, H7;
  `empty_library` → `no_targets` → H3; wycięcie masowej idempotentności → H6.
- Kontrole pozytywne do KAŻDEJ asercji o braku komunikatu (H1b, H2b, H3b, H4b,
  H5b, H6b, J1b) — bez nich asercja bywa zielona dlatego, że nic się nie dzieje
  (klasa M255/G2).
- Mutacja **MUT11** (werdykt czytany z AURY zamiast z gospodarza) **przeżyła —
  to mutant równoważny**: w tym silniku aura nie bywa tapnięta, a sam efekt
  wykonuje się niezależnie od werdyktu (werdykt zmienia wyłącznie komunikat).
  Zapisuję to jawnie, żeby następna sesja nie wzięła braku czerwonego testu za
  lukę w pokryciu (L83: strażnik ma mierzyć regułę, nie tekst).
- Strażnik kompletności tabeli (H7): skan katalogu — każdy „zbiorowy" typ
  efektu ma wpis w `EMPTY_RECEIVER_EFFECTS` albo udokumentowany wyjątek;
  heurystyka NAZWY mieszka wyłącznie w teście (silnik kluczuje po typie efektu,
  ADR 0002).
