# HANDOFF — Zgłoszenie G, etap 1: walka „konstruuj + waliduj” (2026-11-05)

## Co zgłosił właściciel

Po zgłoszeniu F (zero ucinania enumeracji) właściciel wskazał błąd
założeń: po co enumerować wszystkie kombinacje, skoro kontroler użyje
jednej? Decyzja: migracja etapami — **najpierw walka**, potem pozostałe
decyzje kombinatoryczne. Plan:
`docs/plans/PLAN_2026-11-05-g-architektura-konstruuj-waliduj.md`.

## Stan: etap 1 WYKONANY (bramki zielone)

- Commity: `a179b00` (plan), `9e8355b` (rdzeń etapu 1), `6bf7891`
  (poprawki bramkowe). PR #179 — **bez scalania, decyzja właściciela**.
- Bramki: `npm test` 10013/10013; `npm run build` OK;
  `test:all` 10281/10281; benchmark bota 10/10;
  `test/zgloszenie-g-walka-konstruuj.test.js` 7/7.

## Jak działa walka po etapie 1

- `legalCommands` dla `declare_attackers`/`declare_blockers` niesie
  wyłącznie ziarna wielomianowe (`attackerSeedDeclarations`,
  `blockerSeedAssignments` z ziarnami złożonymi: gang, multi-slot,
  pokrycie zachłanne) — nigdy pełny iloczyn kartezjański.
- `playerView.combatDeclaration` to deskryptor problemu: kandydaci,
  ograniczenia, wymogi (`mandatoryIds`), pule par bloker–atakujący.
- UI (`renderCombatWizard`) buduje deklarację z deskryptora
  (fallback ofertowy dla starych widoków).
- Bot heurystyczny dokłada własne kandydatury z deskryptora:
  prefiksowe deklaracje ataku (`synthesizedAttackDeclarations`) oraz
  bloki (`synthesizedBlockDeclarations`: gangi prefiksowe per
  atakujący + pokrycia w permutowanych porządkach blokerów).
  Synteza bloków pomijana przy wymogach bloku — wtedy wystarczają
  ziarna silnika. Kształty legalne z konstrukcji; silnik i tak
  waliduje przy `execute` (`attackerDeclarationViolation`,
  `blockerDeclarationViolation` — jedno źródło prawdy).
- Żadna legalna deklaracja nie jest ucięta: dowolna kombinacja
  zbudowana przez kontrolera przechodzi walidację przy wykonaniu.

## Świadome decyzje i resztki

- Golden-master wyceny bota regenerowany świadomie dwukrotnie;
  rejestr dryfu w `test/bot-scoring-snapshot.test.js`
  (`… → 37a41eab… → abc4017e…`). Benchmark dowodzi braku załamania
  poniżej progów, nie równej siły gry.
- Test A8 (untap) przepisany: deskryptor niesie komplet kandydatów,
  a walidacja przyjmuje każdy wybrany podzbiór — migracja tego
  wyboru na picker to etap 3. Test D2 (escape) pina komplet
  C(10,4)=210 ofert po F — picker też etap 3.
- Etap 2 (kolejny): triggery wielocelowe + podział obrażeń.
  Etap 3: mulligan bottom, untap, delve/escape, {X}/Fireball.

## Pułapki dla kontynuatora

- Bot NIE może zwrócić nielegalnej komendy (`session.js` i
  `simulation.js` rzucają o nielegalnej) — każda synteza kandydatów
  musi być legalna z konstrukcji albo filtrowana walidacją silnika.
- Same ziarna parowe silnika nie wystarczają botowi do przeżycia
  (FixB/T3) — ziarna złożone i synteza botowa są celowe, nie cofać.
- Przy zmianie limitów ofert sprawdzaj też walidację przy `execute`
  (kap {X} żył w dwóch miejscach — oferty i `resources.js`).

## Etap 2 — WYKONANY (2026-11-05, po etapie 1)

Triggery wielocelowe (`resolve_trigger_target`, count > 1) i podział
obrażeń (`resolve_damage_division`) działają jak walka: ziarna w
`legalCommands`, deskryptory `pendingTriggerTarget` (kandydaci,
`maxTargets`, `upTo`) i `pendingDamageDivision` (cele, budżet), botowa
synteza zestawów celów, walidacja przy `execute` bez zmian. Commity:
`625c04d` + poprawki bramkowe. Dowód:
`test/zgloszenie-g2-triggery-podzial.test.js` 6/6; `npm test`
10019/10019; `test:all` 10287/10287; golden-master bota bez dryfu.
Został tylko etap 3 (mulligan bottom, untap, delve/escape, `{X}`/Fireball).

## Etap 3 — WYKONANY (2026-11-05). ZGŁOSZENIE G DOMKNIĘTE

3a: mulligan bottom, untap, escape, delve — ziarna-okna/singletony,
deskryptory, botowa synteza zestawów, konstruktor w kreatorze
mulligana. 3b: rzuty {X}/Fireball/dzielone — ziarna ofert,
`commandForXSelection` (konstrukcja X z planu + korekta `cost`),
botowa synteza pośrednich X. Commity: `4b90c31`, `de0754d`,
`d4d4fa9`, `bd94a2d`. Bramki: `npm test` 10029/10029; build OK;
`test:all` 10297/10297; golden-master bota bez dryfu. Testy:
`zgloszenie-g3-decyzje-oczekujace` 5/5, `zgloszenie-g3-rzuty-x-fireball` 5/5.

Całe zgłoszenie G (etapy 1–3) jest zrealizowane: żadna decyzja
kombinatoryczna nie enumeruje wariantów w `legalCommands`.
