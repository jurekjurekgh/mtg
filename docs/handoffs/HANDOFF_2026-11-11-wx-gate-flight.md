# HANDOFF 2026-11-11 — zgłoszenia W (Basilisk Gate) i X (Fleeting Flight)

Sesja `arena/76d4141f-mtg`, PR #184. Obie uwagi przyszły z LOGU partii
właściciela (seed 424051), nie z opisów objawów.

## W — Basilisk Gate: buff na stwora spoza planu ataku

**Pomiar z logu** (tura 13/15/17): bot aktywuje +X/+X na Druidzie 1/1 z
licznikami, choć plan ataku to `[Angel, ...]`. Sonda odtworzyła: warianty celu
po **3 pkt (3/3/3)** — remis rozstrzyga enumeracja.

**Przyczyna:** `widokDlaWycenyAtaku` (sonda planu ataku) powstawał wyłącznie
w fazie walki. Basilisk Gate to zdolność „activate only as a sorcery" — jedyne
legalne okno to Główna 1, gdzie widok zwracał `null`, a wycena spadała na słaby
`attackIntendsCreature` („istnieje jakikolwiek opłacalny zestaw z tym stworem"),
prawdziwy dla każdego stwora.

**Naprawa:** plan ataku jest funkcją STANU, nie fazy (moja tura, brak walki,
brak deklaracji w ofercie → sondę wolno zbudować). `zamiarAtakuWybranego` pyta
o JEDEN zwycięski plan (argmax po wszystkich podzbiorach), nie o maksima dwóch
rodzin. Po naprawie: Ettercap (poza planem) −23, Druid/Anioł w planie 3.

## X — Fleeting Flight: trik bojowy w podtrzymaniu

**Pomiar z logu** (tura 17): rzut na smoka 4/4 z „can't attack unless defending
player controls a creature with flying", życie człowieka **5**.

**Przyczyna:** wyjątek `closesGame` („licznik domyka grę w tym ataku") liczył
`canAttackNow`, które sprawdza TYLKO tapnięcie i chorobę — nie ograniczenia
ataku. 4+1 ≥ 5 → lethal „na papierze" → kara 120 zdjęta, karta +124.
Ten sam słaby predykat siedział w `counterLethalClockBonus` (+50).

**Naprawa:** oba miejsca czytają `canCreatureAttackNow` (tap/choroba/
cantAttackStatic/detained). Po: karta −46, bot passuje; w oknie walki rzuca.

## Zmierzone i WYCOFANE (nie wracać bez nowej decyzji)

1. **Kara proporcjonalna do ciała** (`max(120, 2·counterHostWorthWeight·(2P+T))`)
   — czerwieniła pin **D/5** (zgłoszenie D: „2/2 z licznikami domyka grę przy
   życiu 4 — wolno rzucić przed atakiem") i **PMSSB-23/C4**. Kara zostaje stała.
2. **Wymuszone `phase: 'combat'`** w widoku sondy — mutant GREEN, zbędne.
3. **Pin „20/20 w podtrzymaniu"** — usunięty: u właściciela nie wystąpił, a jest
   sprzeczny z D/5.

**Otwarta klasa dla właściciela:** stała kara vs liniowa premia od ciała.
Przy ciele ≥ 19/19 (albo przy liczniku domykającym grę) trik może wyjść na plus
poza walką. To NIE jest zgłoszenie X i koliduje z D/5 — wymaga decyzji.

## Bramy

- Piny: `test/zgloszenie-wx-gate-flight-z-logu.test.js` W/1–W/4, X/1–X/4 — **8/8**.
- Mutacje: mW1, mW3, mX1, mX3 → RED na wskazanych pinach; GREEN po przywróceniu.
- Sąsiedzi: M146 (`bot-suspend-twiddle-quality`), D/1–D/5, PMSSB-23/A1–C5, B1 — zielone.
- `npm test` **10251/10251**, `npm run test:all` **10520/10520** (0 fail, 0 skipped),
  build **79 / 5832,2 kB**.
