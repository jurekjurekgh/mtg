# HANDOFF 2026-11-09 — zgłoszenie V („up to two" niezatwierdzalne) — DOMKNIĘTE

Sesja `arena/76d4141f-mtg`, PR #184. Zgłoszenie właściciela z gry: Weftblade
Enhancer („put a +1/+1 counter on each of up to two target creatures") — modal
0–2 celów otwiera się, ale dwóch celów nie da się zatwierdzić („Zatwierdź"
nieaktywne). Podejrzenie właściciela: „O CO CHODZI???? REGRESJA?????".

## Diagnoza (zmierzona, nie zgadnięta)

Sonda `.arena/probe-weftblade.mjs` na 7 kandydatach:
- oferta silnika: 9 wariantów = para zachłanna + 7 singletonów + pusto (ZIARNA,
  nie enumeracja — to celowe po PR #179, `7a18659`, „G, etap 2");
- plan kreatora poprawny: `targets=7 min=0 max=2 upTo`;
- par do wyboru 21, z komendą **1** → 20/21 gasi „Zatwierdź";
- `execute` zbudowanej pary `[mine0,mine2]` = **OK** — silnik waliduje każdy
  legalny podzbiór, tylko go nie publikuje.

Wniosek: regresja z PR #179; kreator nie dostał ścieżki „komenda zbudowana
z szablonu". Klasa błędu powtórzona w proliferate (0/21 par z komendą).

## Naprawa (`ce102d6`)

- `src/table/target-set-commands.js` (nowy): `builtTargetSetCommand` — najpierw
  oferta, poza nią szablon grupy. Jedna reguła (L41), bez duplikacji w UI/bocie.
- `choice-request.js`: tryb `targetIdsMode` dopuszcza wybór spoza oferty, ale
  wyłącznie w widełkach liczby celów z planu (Oracle) — 3 cele przy „up to two"
  nadal bez komendy.
- `PROJECT_HISTORY.md`, plan V (z korektami pomiaru), ten handoff.
- **Silnik: zero zmian logiki** — wyłącznie komentarze (oferta = ziarna).

## Co zostało zmierzone i ODRZUCONE (nie „dokończyć" tego)

1. Znaczniki `syntheticTargetSet`/`constructedTargetSet` + bramka w `execute`.
   Dwa razy czerwieniła pin **E/4** (`zgloszenie-e-inferno-podzial`): kontrakt
   `execute` jest czysto legalnościowy i nie wymaga znaczników. Odrzucone.
2. Widełki planu liczone z limitu z deskryptora. Mutant przechodził GREEN —
   kod zbędny (ziarno zachłanne niesie pełne `count`).
3. Zmiana widełek `proliferatePlanOf` na `targets.length`. Mutant GREEN —
   ziarno „pełne" ma już wszystkich kandydatów. (Plan z etapu 1 twierdził
   „błędne widełki" — korekta w planie.)
4. Usunięcie `synthesizedTriggerTargetSets` z bota. To warstwa POLITYKI, nie
   obejście; usunięcie czerwieniło pin G2/4. Diff bota = 0.

## Bramy (finalne)

- `node --test test/zgloszenie-v-up-to-two-regresja.test.js` → **9/9** (V/1–V/9).
- Mutacje: mV1 (kreator wraca do oferty) → RED V/6; mV2 (brak bramki widełek)
  → RED V/9; mV5 (brak budowy komendy) → RED V/1,V/2,V/6; GREEN po przywróceniu.
- Sąsiedzi: B1 up-to-multiselect, J, PR136, E/4 Inferno, PR134 proliferate,
  PMSSB-67 Necrosquito, G2 — zielone.
- `npm test` **10244/10244**, `npm run test:all` **10513/10513**, build
  **79 modułów / 5828,2 kB**.
- Sonda po naprawie: **21/21** par triggera i **21/21** proliferate z komendą.

## Kolejka następnej sesji

Brak otwartych zadań z tego zgłoszenia. Uwaga procesowa: trzy z czterech
pierwotnych punktów planu V były hipotezami; każdą linię kodu naprawy
rozliczaj pytaniem „który pin czerwienieje, gdy ją cofnę?" — reszta to kod
zbędny i dług.
