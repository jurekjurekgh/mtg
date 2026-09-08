# Audyt wewnętrzny poprawek PR #105 — weryfikacja wg CR i rulingów (2026-09-08)

> **Korekta z audytu następnej sesji (PR #106, 2026-09-08):** poniższy raport
> jest historyczny. Potwierdzenie E8/B5 nie obejmowało własnego celu (brak
> rzeczywistej zmiany kontrolera); opis E8/B3 cytował stare ograniczenie
> kolejności obrażeń. Aktualne CR 510.1c dopuszcza dowolny podział między
> blokerów. Pełna suma oraz trample/protection pozostają poprawne. Dowody,
> źródła i naprawy: [audyt #105](AUDYT_PR105_2026-09-08.md), ustalenia A i C.


**Polecenie właściciela** (po refutacji E9/F3): dogłębny audyt dotychczasowych zmian
w PR #105 — części audytowej (PR #104), rundy brązowej (E8/B1–B5) i pozostałych
poprawek srebrnych (E9/F1, F2, F4, F5) — każda poprawka sprawdzona pod kątem
dosłownego tekstu CR i rulingów Gatherera. **Audyt dokumentacyjny: żadnych zmian
w kodzie.** Znalezione problemy czekają na decyzję właściciela.

**Metoda:** (1) dosłowny tekst reguły pobrany z sieci (yawgatog/mtg.wiki/archiwa
sędziowskie/r/mtgrules), (2) rulingi Gatherera gdzie istnieją, (3) odczyt kodu
w drzewie, (4) sonda empiryczna na żywym silniku tam, gdzie to możliwe.

## Werdykty zbiorczo

| Fix | Twierdzenie | Werdykt |
|-----|-------------|---------|
| Audyt PR #104 (`bd16701`) | fizzle czaru, CR 608.2b | **POPRAWNA** (test-only, silnik nietknięty) |
| E8/B1 (`888a234`) | 1 tarcza = 1 zniszczenie | **POPRAWNA** |
| E8/B2 (`4bcf5ab`) | flaga „nie odtapuje się" | **POPRAWNA** |
| E8/B3 (`2b944c0`) | pełny przydział obrażeń | **POPRAWNA** |
| E8/B4 (`2e15ba6`) | trample vs protection, lethal 0 | **BŁĄD — fałszywe znalezisko, fix pogarszający; zalecenie revertu** |
| E8/B5 (`b0c02d9`) | zmiana kontroli usuwa z walki | **POPRAWNA** |
| E9/F1 (`bfd9cbc`) | reanimacja + choroba przywołania | **POPRAWNA** |
| E9/F2 (`fc3d492`) | masowa zmiana kontroli a walka | **POPRAWNA** (sister B5) |
| E9/F3 (`a7ae267`) | explore bez wyboru | **SFALSZOWANA** — cofnięta `613a379` (patrz plan, sekcja F3) |
| E9/F4 (`d207034`) | search→BF + choroba | **POPRAWNA** (siostrzana F1) |
| E9/F5 (`03b71f0`) | podwójny trigger ETB Throne | **POPRAWNA** (korekta cytatu: CR 603.2c, nie 603.6c) |

Zmiany spoza zakresu głębokiego audytu (E1–E3 wyceny bota, E6/E7 zgłoszenia
właściciela, plany talii, UI/logi) nie niosą twierdzeń regułowych — przejrzane
na poziomie diffów; jedyna zmiana kodowa części audytowej (`bd16701`) to
test-guardia.

---

## BŁĄD: E8/B4 — trample vs protection (wymaga decyzji właściciela)

### Twierdzenie z E8 (błędne)
`lethalOf` „ignorował protection" — rzekomo „lethal" w trample to obrażenia,
które faktycznie zabiłyby, więc bloker w pełni chroniony miałby lethal 0.
Fix: `isDamagePreventedByProtection → return 0` w `lethalOf` (combat.js).

### Dosłowny tekst reguły
CR 702.19b: „The controller of an attacking creature with trample first assigns
damage to the creature(s) blocking it. Once all those blocking creatures are
assigned lethal damage, any remaining damage is assigned as its controller
chooses among those blocking creatures and the player or planeswalker the
creature is attacking. **When checking for assigned lethal damage, take into
account damage already marked on the creature and damage from other creatures
that's being assigned during the same combat damage step, but not any abilities
or effects that might change the amount of damage that's actually dealt.**"

Klauzula „but not any abilities or effects that might change the amount of
damage that's actually dealt" **wyłącza prewencję z wyliczenia lethal** —
ochrona (CR 702.16d: „can't be dealt damage") ZAPOBIEGA zadaniu obrażeń, więc
przy PRZYDZIALE lethal = toughness − damage already marked. Dla blokera 2/2
z protection od źródła atakującego: **minimum przydziału to 2** (które i tak
zostanie preventowane), nadwyżka (przy trample) legalnie na obrońcę.

### Źródła zbieżne (rzuty sędziowskie i poradniki, 2013–2025)
- MTG Tutorials: 7/7 trampler vs 3/3 protection from creatures — legalne
  przydziały **3–7** na blokera, minimum 3: „Because of the blocking creature's
  protection from creatures, all damage that gets assigned to it by the
  attacking creature is prevented. However, this doesn't stop the attacking
  creature's controller from assigning that damage in the first place."
- r/mtgrules (2024, multi-block z protection): „you have to assign 2 more
  damage to the creature with protection before trampling to face".
- Draftsim: „if you're attacking with a 7/7 trampler into a 2/2 with
  protection, it will still assign **5** damage to the defending player" (7−2).
- CoolStuffInc (2025): „you will still have to assign 2 damage to that little
  2/2, even though it's protected".
- tappedout (deathtouch+trample): „[1 damage as lethal] is true even if the
  creature is indestructible, **the damage is prevented, or the defending
  creature has protection** from that creature" — deathtouch nadaje się, bo to
  ono ZMIENIA definicję lethal, a nie preventuje obrażenia.

### Dowód empiryczny (sonda na obecnym drzewie)
`/tmp/probe-b4-protection.mjs`: 7/7 trampler vs 2/2 protectionFromColors:['R']:
- `validateDamageAssignment(..., [{blockerId:'prot', amount:0}])` → **OK
  (przepuszczona)** — naruszenie CR 702.19b; sprzed B4 zwracało
  `trample_blocker_below_lethal` (poprawnie).
- `defaultDamageAssignmentFor(...)` → **[{prot: 0}]** — boty masowo robią
  nielegalny przydział (0 w chronionego, cała moc w obrońcę).

### Stan sprzed B4 (`git show 2e15ba6`)
`lethalOf = deathtouch ? 1 : max(0, toughness − damage)` — **dokładnie CR
702.19b** (deathtouch: CR 702.2b czyni 1 obrażenie „lethal"; prewencja bez
wpływu). Stary kod był zgodny z regułami. B4 wprowadził naruszenie w dwóch
miejscach naraz (walidacja + domyślny przydział botów + prefill wizarda).

### Zalecenie (do decyzji właściciela — nie wykonane w ramach audytu)
Revert `2e15ba6` + przepisanie `test/e8-b4-trample-protection.test.js` na
guardię twierdzącą odwrotność: minimum przydziału na chronionego blokera
= toughness−marked (nadwyżka legalna), deathtouch→1 nadal pierwszy. Po
rewerocie pełna bramka test:all (piny z B3 były niezależne od lethalOf
protection, ale wymagają potwierdzenia uruchomieniem).

---

## Poprawki POTWIERDZONE (reguła + kod + sonda/test)

### E8/B1 — tarcze regeneracji (CR 701.15a)
Reguła: „Regenerate [permanent]" (efekt rozstrzygającego czaru/zdolności)
= „The NEXT time [permanent] would be destroyed this turn, instead remove all
damage marked on it and tap it. If it's an attacking or blocking creature,
remove it from combat." Tarcze kumulują się i każda wchłania DOKŁADNIE jedno
zniszczenie: mtgsalvation (arch., Gareth): „A 2/2 creature which has been
regenerated four times will be able to withstand four destruction events";
kontroler wybiera, która tarcza zastosuje się do danego zniszczenia.
Kod (`tryRegenerate`, state-based.js): `state.regenerationShields` to tablica
wystąpień; `indexOf` + usunięcie JEDNEGO elementu na zniszczenie — zgodne.
Uwaga o cytacie: commit mówi „CR 701.15b" — to wariant zdolności statycznych;
stos tarczy wynika z 701.15a + ogólnych reguł efektów zastępczych. Substancja
poprawna, numeracja do doprecyzowania.

### E8/B2 — flaga „nie odtapuje się" („controller's NEXT untap step")
Rulingi: Frost Breath (2011-09-22): „If a creature affected by Frost Breath
changes controllers before its old controller's next untap step, Frost Breath
will prevent it from becoming untapped during **its new controller's next
untap step**" (efekt używa aktualnego kontrolera — CR 608.2g: „current
information of that object"). Tamiyo, the Moon Sage (ruling): efekt
zakładany na już odkręcony cel istnieje dalej i wygasa na następnym untap
stepie — niezależnie od stanu tapped. Analogia 701.37b (exert): „If you exert
a permanent more than once before your next untap step, each effect causing it
not to untap expires during the same untap step."
Kod (`untapControlled`, permanents.js): flaga zużywana NA untap stepie
obecnego kontrolera, niezależnie od `tapped` — zgodne w obu wymiarach
(kontroler-dzień i niezależność od tapped).

### E8/B3 — pełny przydział obrażeń (CR 510.1a/510.1c)
Reguła: każda stwor-zwalczająca przydziela obrażenia RÓWNE mocy (510.1a);
przy wielu blokerach „at least lethal damage" na wcześniejszym w kolejności
przydziału, zanim cokolwiek trafi do następnego (510.1c); przydział większy
niż lethal na blokera jest legalny. „Niedobór" przy braku trample nie jest
regułowy (obrażenia przydzielane w pełnej mocy) — twierdzenie E8 poprawne.
Kod: walidacja `sum < amount && !trample → 'damage_must_be_fully_assigned'`,
kolejność 510.1d sprawdzona, nadwyżka > lethal dozwolona — zgodne.

### E8/B5 + E9/F2 — zmiana kontrolera usuwa z walki (CR 506.4)
Reguła (dosłownie): „A permanent is removed from combat if it leaves the
battlefield, **if its controller changes**, if it phases out, ... A creature
that's removed from combat stops being an attacking, blocking, blocked, and/or
unblocked creature." Źródła sędziowskie potwierdzają dla każdej zmiany kontroli
(planeswalker/creature — mtgsalvation arch.).
Kod: `removeFromCombat` po `control_changed` w `gain_control_until_end_of_turn`
(B5) i `control_to_owners_all_creatures` (F2) — zgodne.

### E9/F1 + E9/F4 — choroba przywołania (CR 302.6)
Reguła (dosłownie): „A creature's activated ability with the tap symbol or the
untap symbol in its activation cost can't be activated unless the creature has
been under its controller's control continuously since their most recent turn
began. A creature can't attack unless..." — liczy się KONTROLA, nie sposób
wejścia: dotyczy też wejścia z grobu (F1), z biblioteki przez search (F4),
i zmiany kontroli (silnik ustawia flagę też tam). Landy/nie-stwory nieobjęte.
Kod: `summoningSickness: true` dla creature w obu ścieżkach (freeze przed
`applyEnterCounters` w F1) — zgodne; landy nietknięte (F4 ustawia flagę tylko
dla kind/types creature).

### E9/F5 — podwójny ETB Throne (CR 603.2c — KOREKTA CYTATU)
Reguła (dosłownie): „**603.2c** An ability triggers only once each time its
trigger event occurs. However, it can trigger repeatedly if one event contains
multiple occurrences." Jedno wejście na pole bitwy = jedno zdarzenie reguł —
mimo że silnik emituje dwa rekordy (object_moved→BF + permanent_entered_
battlefield z Throne), trigger ETB odpala RAZ. **Cytat w commicie („603.6c")
jest błędny** — właściwy to 603.2c; substancja fixu poprawna.
Kod: dedupe per wchodzący obiekt (`etbEnterFired`) w jednym przebiegu
`processTriggersScan` — bezpieczny: moveObjectDirectly nadaje nowe id przy
każdej zmianie strefy (blink w jednej komendzie = nowe id), a land drop emituje
WYŁĄCZNIE land_played (game-state.js:1356), więc dedupe dotyka wyłącznie
wzorca podwójnej emisji Throne. Test RED→GREEN: Omenspeaker 2×→1×
`ability_triggered`.

### Część audytowa PR #104 (`bd16701`) — fizzle, CR 608.2b
Reguła (dosłownie): „If all its targets, for every instance of the word
'target,' are now illegal, the spell or ability doesn't resolve. It's removed
from the stack and, if it's a spell, put into its owner's graveyard."
Zmiana = wyłącznie test-guardia (`test/audyt-pr105-fizzle-martwy-cel.test.js`)
+ README; silnik nietknięty; sonda z audytu potwierdziła, że silnik już
wtedy fizzlował poprawnie. Bez ryzyka.

---

## Post-mortem F3 i korekty cytowań (do warsztatu)

1. **F3 (cofnięty)**: „znalezisko" zbudowane z pamięci (zła numeracja 701.54b,
   opisana treść nieistniejąca); CR 701.44a daje wybór („may put the revealed
   card into their graveyard"). Remediatum: test-guardia
   `test/e9-f3-refutacja-wyboru.test.js`.
2. **B4 (niniejszy audyt)**: ta sama klasa błędu AGENTA, odwrotna strona:
   klauzula 702.19b („but not any effects that might change the amount
   actually dealt") przeczytana ODWROTNIE — jako „prewencja obniża lethal",
   podczas gdy wyłącza prewencję z wyliczenia. Remediatum wymaga decyzji
   właściciela (patrz wyżej).
3. Korekty cytowań (substancja poprawna): B1 „701.15b"→701.15a(+efekty
   zastępcze); F5 „603.6c"→603.2c.

## Źródła (pobrane 2026-09-08)

- CR 302.6: mtg.wiki/page/Summoning_sickness; yawgatog.com/resources/magic-rules/
- CR 701.15a/b: r/magicTCG (doubt about +1/+1 counters and regenerate);
  axionnowevents.com (CR 701 keyword actions)
- Stos tarczy: mtgsalvation arch. „Regenarte.. twice?" (Gareth);
  krakenthemeta.com/blog/mtg-regenerate
- „Doesn't untap": mtgsalvation 776288 (Frost Breath 2011-09-22); 771100
  (Tamiyo); 784222 (701.37b exert)
- CR 510.1a/510.1c/702.19b: mtgsalvation 784293 „Combat damage"; 289746
  „Trample and Prevent Damage" (pełny tekst 510.1c i 702.19b)
- Trample vs protection: mtgtutorials.tumblr.com (7/7 vs 3/3 prot);
  r/mtgrules 1h12ghf (2024); draftsim.com/trample-mtg;
  coolstuffinc.com (Trample overview 2025); tappedout (deathtouch+trample)
- CR 506.4: mtgsalvation arch. „Planeswalker changes controllers during
  combat" (pełny tekst); „Battle and changing control"
- CR 603.2c: yawgatog; blogs.magicjudges.org/rules/comprehensive-rules/
- CR 608.2b: r/magicTCG „Doubt about illegal targets" (pełny tekst)

---

## NASTĘPCZO (2026-09-08, po decyzji właściciela): B4 NAPRAWIONY

Właściciel zarządził naprawę wg CR (zgodnie z zaleceniem powyżej):
- ADR 0030 (`367e92c`) — obowiązek pobierania CR/rulingów ze źródeł online
  przed zmianami regułowymi (fix istniejącego kodu albo nowa mechanika).
- Revert `2e15ba6` + guardia (`227c142`): `lethalOf` z powrotem
  `deathtouch ? 1 : toughness − marked`; test/e8-b4 pinuje poprawną regułę
  (przydział 0 w chronionego odrzucony, default przydziela toughness,
  deathtouch→1, E2E). Sonda /tmp/probe-b4-protection.mjs: walidacja znów
  odrzuca 0, domyślny przydział botów = 2.
- Budżet lektury startowej (skutek ADR 0030): kondensacja 65 bloków
  „Przypadek" w LESSONS → 99.6k/100k (`be09633`).
- Bramki po naprawie: npm test 4772/4772; test:all 4782/4782; build
  3396,2 kB; bench heuristic 85,0% (bez zmian).
