/**
 * Automatyczne detektory podejrzanych zjawisk na stole (M97).
 *
 * Żywy tester rozgrywa partię, ale znalezienie błędu wymagało dotąd ręcznego
 * czytania setek linii transkryptu. Detektory robią pierwszy przesiew: zgłaszają
 * miejsca, którym warto się przyjrzeć, wraz z kategorią i cytatem.
 *
 * Kategorie odpowiadają OSIOM AUDYTU z docs/setup/TESTER_STOLU.md:
 *   `bot`   — oś 1: bezsensowne/powtarzalne działania bota,
 *   `info`  — oś 2: braki i przecieki w logu oraz modalu „Rozgrywka",
 *   `ui`    — oś 3 i czytelność: etykiety, ptaszki, puste okna,
 *   `noop`  — oś 4 (M103, L15): oferty bez skutku / pewnej straty (U8-U10),
 *   `rules` — podejrzenia łamania reguł widoczne na stole.
 *
 * Detektory są CZYSTE (wejście: linie transkryptu + zebrane zdarzenia) —
 * dzięki temu mają testy jednostkowe w `test/table-tester-detectors.test.js`
 * i nie wymagają jsdom.
 */

/** Surowe identyfikatory, które nigdy nie powinny trafić do oczu gracza. */
const RAW_IDENTIFIER = /\b(battlefield|graveyard|library|exile|stack|hand)\s*→|→\s*(battlefield|graveyard|library|exile|stack|hand)\b/;
const SNAKE_CASE_EVENT = /\b[a-z]+(_[a-z]+){2,}\b/;
const PLACEHOLDER = /(^|[\s:(])\?($|[\s),.])|undefined|NaN|\[object |null\b/;

/** Ile razy ta sama akcja bota w jednej turze jest już podejrzana. */
const REPEAT_THRESHOLD = 4;

function push(out, category, message, evidence) {
  out.push({ category, message, evidence: String(evidence ?? '').slice(0, 160) });
}

/**
 * Oś 2 — przecieki techniczne w tekstach widocznych dla gracza.
 * Szuka surowych nazw stref, snake_case identyfikatorów zdarzeń i placeholderów.
 */
export function detectRawText(lines) {
  const found = [];
  for (const line of lines) {
    // Interesują nas wyłącznie teksty, które WIDZI gracz.
    const isPlayerFacing = /\[ROZGRYWKA\]|LOG:|AKCJE:|\[modal choice\]/.test(line);
    if (!isPlayerFacing) continue;
    if (RAW_IDENTIFIER.test(line)) {
      push(found, 'info', 'Surowa nazwa strefy w tekście dla gracza', line);
    }
    // snake_case w tekście UI = przeciek identyfikatora zdarzenia/efektu.
    const m = line.match(SNAKE_CASE_EVENT);
    if (m && !/http|\.mjs|\.js\b/.test(line)) {
      push(found, 'info', `Surowy identyfikator „${m[0]}" w tekście dla gracza`, line);
    }
    if (PLACEHOLDER.test(line.replace(/\(brak\)|\(pusty\)|\(puste\)|\(pusta\)/g, ''))) {
      push(found, 'ui', 'Placeholder (?/undefined/null) w tekście dla gracza', line);
    }
  }
  return found;
}

/**
 * Oś 1 — bot powtarza tę samą akcję wielokrotnie w obrębie jednej tury.
 * Typowy objaw braku progu nasycenia w heurystyce (station, firebreathing,
 * re-equip, mill). Zwraca po jednym wpisie na (tura, akcja).
 */
export function detectBotRepeats(lines, { threshold = REPEAT_THRESHOLD } = {}) {
  const found = [];
  let turn = '?';
  const counts = new Map();
  const flush = () => {
    for (const [key, n] of counts) {
      if (n >= threshold) push(found, 'bot', `Bot powtórzył akcję ${n}× w jednej turze`, `tura ${turn}: ${key}`);
    }
    counts.clear();
  };
  for (const line of lines) {
    const turnMark = line.match(/•\s*Tura (\d+)/);
    if (turnMark) { flush(); turn = turnMark[1]; continue; }
    // M122/#9: granicę tury niosą też NAGŁÓWKI KROKÓW („--- krok 12 | T. 7 …”),
    // a wpis „• Tura N” pojawia się w modalu tylko wtedy, gdy gracz akurat go
    // otworzył. Licząc wyłącznie wpisy modala, detektor sklejał akcje z wielu
    // tur w jedną i raportował „Bot powtórzył akcję 4× w jednej turze” dla
    // Soulmendera ({T}: zyskaj 1 życie) użytego RAZ w czterech różnych turach —
    // zdolność z kosztem tapnięcia fizycznie nie może zajść dwa razy w turze.
    const stepMark = line.match(/^---\s*krok\s+\d+\s*\|\s*T\.\s*(\d+)/);
    if (stepMark) {
      if (stepMark[1] !== turn) { flush(); turn = stepMark[1]; }
      continue;
    }
    const act = line.match(/\[ROZGRYWKA\]\s*•\s*(Nieprzyjaciel (?:aktywuje|rzuca)[^|]*)$/);
    if (!act) continue;
    const key = act[1].trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  flush();
  return found;
}

/**
 * Oś 1 — bot celuje efektem w SIEBIE tam, gdzie naturalnym celem jest wróg
 * (mill, obrażenia, discard). Heurystyka tekstowa: „→ cel: Nieprzyjaciel"
 * w akcji BOTA (bot nazywa się „Nieprzyjaciel" z perspektywy gracza).
 */
export function detectBotSelfTargeting(lines) {
  const found = [];
  // Celowanie w siebie bywa OPTYMALNE (Inspiration „target player draws two
  // cards", zysk życia, scry). Zgłaszamy tylko efekty jednoznacznie szkodliwe
  // dla celu — inaczej detektor produkuje fałszywe alarmy (M97: Inspiration).
  const HARMFUL = /mieli|mill|obrażeni|traci życie|odrzuc|discard|zniszcz|wygna|poświęc/i;
  const BENEFICIAL = /dobierz|dobiera|zysk|scry|surveil|szuka|licznik \+1/i;
  for (const line of lines) {
    if (!/\[ROZGRYWKA\]/.test(line)) continue;
    if (!/Nieprzyjaciel (aktywuje|rzuca)/.test(line)) continue;
    if (!/→ cel: Nieprzyjaciel/.test(line)) continue;
    if (BENEFICIAL.test(line) && !HARMFUL.test(line)) continue;
    if (!HARMFUL.test(line)) continue;
    push(found, 'bot', 'Bot celuje SZKODLIWYM efektem w siebie', line);
  }
  return found;
}

/** Typy efektów szkodliwych dla CELU-permanentu (spójne z heuristic-bot.js). */
const HARMFUL_PERMANENT_EFFECTS = new Set([
  'damage', 'damage_from_target_power', 'destroy_permanent', 'exile_permanent',
  'exile_target_creature', 'exile_all', 'bounce_permanent', 'bounce_to_library_top',
  'sacrifice_permanent', 'player_sacrifices_creature', 'tap_permanent',
  'tap_permanents', 'lock_untap', 'dont_untap_next_untap_step', 'shrink', 'pump_negative',
]);

/**
 * Buduje zbiór NAZW kart, których zagranie szkodzi celowanemu permanentowi.
 * Klasyfikacja po deskryptorach z rejestru, nie po polskim tekście logu:
 * transkrypt zawiera samą nazwę karty i nazwę celu („Nieprzyjaciel rzuca
 * Shatter → cel: Great Furnace”), więc regex po słowach kluczowych nic tu
 * nie znajdzie. Rejestr wstrzykujemy z zewnątrz, żeby detektory pozostały
 * czyste i testowalne bez ładowania całej bazy kart.
 */
export function harmfulCardNames(registry) {
  const names = new Set();
  for (const card of registry.all()) {
    const effects = [
      ...(card.spell?.effects ?? []),
      ...(card.spell?.modes ?? []).flatMap((m) => m.effects ?? []),
      ...(card.abilities ?? []).flatMap((a) => (Array.isArray(a.effect) ? a.effect : (a.effect ? [a.effect] : []))),
    ];
    if (effects.some((e) => e?.type && HARMFUL_PERMANENT_EFFECTS.has(e.type))) names.add(card.name);
  }
  return names;
}

/**
 * Oś 1 (M121) — bot rzuca czar / aktywuje zdolność w SWÓJ WŁASNY permanent
 * efektem, który temu permanentowi szkodzi.
 *
 * `detectBotSelfTargeting` łapie wyłącznie celowanie w bota-GRACZA
 * („→ cel: Nieprzyjaciel”). Tu chodzi o drugi, znacznie częstszy przypadek
 * zgłoszony przez właściciela: cel jest nazwanym PERMANENTEM, a bot jest
 * jego kontrolerem — np. „Nieprzyjaciel rzuca Shatter → cel: <własny
 * artefakt>” albo aura-kotwica na własnym stworze.
 *
 * Właściciela celu ustalamy korelacyjnie: transkrypt zawiera snapshoty
 * „MOJE POLA:” (gracz-człowiek) i „POLA WROGA:” (bot). Nazwę z „→ cel:”
 * porównujemy z ostatnim snapshotem POPRZEDZAJĄCYM akcję — czyli ze stanem
 * stołu w chwili zagrania.
 */
export function detectBotSelfHarmOnOwnPermanents(lines, harmfulNames = new Set()) {
  const found = [];
  let myField = new Set();
  let foeField = new Set();
  const namesOf = (raw) => {
    const out = new Set();
    if (!raw || /\(puste\)/.test(raw)) return out;
    for (const chunk of raw.split('|')) {
      const name = chunk.split('·')[0].trim();
      if (name) out.add(name);
    }
    return out;
  };

  for (const line of lines) {
    const mine = line.match(/MOJE POLA:\s*(.*)$/);
    if (mine) { myField = namesOf(mine[1]); continue; }
    const foe = line.match(/POLA WROGA:\s*(.*)$/);
    if (foe) { foeField = namesOf(foe[1]); continue; }

    const action = line.match(/Nieprzyjaciel (?:rzuca|aktywuje zdolność:)\s*(.+?)\s*→ cel:\s*([^⏎|]+?)\s*$/);
    if (!action) continue;
    const [, cardName, targetName] = action;
    // „Ty” / „Nieprzyjaciel” to GRACZE — obsługuje je detectBotSelfTargeting.
    if (targetName === 'Ty' || targetName === 'Nieprzyjaciel') continue;
    if (!harmfulNames.has(cardName.trim())) continue;
    // Cel musi stać po stronie BOTA i nie może być dwuznaczny (ta sama nazwa
    // po obu stronach stołu = nie da się rozstrzygnąć z samego transkryptu).
    if (!foeField.has(targetName) || myField.has(targetName)) continue;
    push(found, 'bot', `Bot kieruje szkodliwy efekt (${cardName.trim()}) we WŁASNY permanent: ${targetName}`, line);
  }
  return found;
}

/**
 * Oś 2 — istotne zagranie bota bez żadnego opisu skutku.
 * Wykrywa modal „Rozgrywka", w którym jest tylko nagłówek fazy/tury
 * (gracz otwiera okno i nie dowiaduje się niczego).
 */
export function detectEmptyBotMoveModal(lines) {
  const found = [];
  let current = null;
  const finish = () => {
    if (current && current.entries.length > 0) {
      // M98 (korekta właściciela): „Tura N — X" to ISTOTNA informacja, którą
      // gracz chce widzieć nawet bez innych zdarzeń — modal z samym nagłówkiem
      // tury NIE jest błędem. Szumem jest wyłącznie sama nazwa fazy („Faza:
      // Główna 1"), która ma sens tylko jako kontekst konkretnego zagrania.
      const meaningful = current.entries.filter((e) => !/^Faza:/.test(e));
      if (meaningful.length === 0) {
        push(found, 'info', 'Modal „Rozgrywka" z samą nazwą fazy (bez zagrania)', current.entries.join(' | '));
      }
    }
    current = null;
  };
  for (const line of lines) {
    const head = line.match(/\[ROZGRYWKA\]\s+(Rozgrywka.*)$/);
    if (head) { finish(); current = { entries: [] }; continue; }
    const entry = line.match(/\[ROZGRYWKA\]\s*•\s*(.+)$/);
    if (entry && current) current.entries.push(entry[1].trim());
    else if (!entry && current && !/\[ROZGRYWKA\]/.test(line)) finish();
  }
  finish();
  return found;
}

/**
 * Oś 3 — akcje, które gracz może chcieć wyciszyć, ale panel nie dał ptaszka.
 * Tester zapisuje w transkrypcie listę akcji z informacją o ptaszku
 * (`[ptaszek]`), więc detektor porównuje typ akcji z obecnością znacznika.
 */
export function detectMissingIgnoreTick(actionRecords) {
  const found = [];
  const IGNORABLE = /^(Rzuć:|Zagraj:|Aktywuj:|Cycling:|Wyposaż:|Flashback:|Escape:|Przygoda:|Plot:|Cel czaru|Cel zdolności|Aura:|Bestow:)/;
  for (const rec of actionRecords ?? []) {
    if (!IGNORABLE.test(rec.label)) continue;
    if (rec.hasTick) continue;
    push(found, 'ui', 'Akcja bez ptaszka wyciszenia (auto-pass)', rec.label);
  }
  return found;
}

/**
 * Oś „rules" — sygnały łamania reguł widoczne w logu partii.
 * Celowo wąskie i konserwatywne: zgłaszamy tylko rzeczy jednoznaczne.
 */
export function detectRuleSmells(lines, { profile = null, rejectionRecords = null } = {}) {
  const found = [];
  // M99: profil `impatient` z założenia klika dwa razy (double-tap z telefonu),
  // więc odrzucenie drugiej komendy jest częścią scenariusza, nie znaleziskiem.
  // Istotna jest jego KONSEKWENCJA (martwe okno), którą łapie inny detektor.
  const rejectionsExpected = profile === 'impatient';
  // M104 (reguła M99: detektor nie może zależeć od poziomu logowania):
  // odrzucenia komend widać w transkrypcie WYŁĄCZNIE w linii `LOG:` snapshotu,
  // więc pod `--quiet` detektor milczał, choć odrzucenia realnie zachodziły
  // (azorius vs black, seed 7, profil random: 3 odrzucenia niewidoczne).
  // Sterownik podaje je teraz strukturalnie; parsowanie linii zostaje dla
  // transkryptów z archiwum.
  if (rejectionRecords) {
    if (!rejectionsExpected) {
      for (const rec of rejectionRecords) {
        const reason = String(rec?.reason ?? '').trim();
        const action = String(rec?.action ?? '').trim();
        // M104: kontekst „tuż po ptaszku wyciszenia" zostaje w DOWODZIE, ale
        // nie zmienia kategorii. Taka była pierwotnie przyczyna trzech
        // odrzuceń w macierzy (zaznaczenie przewija grę — recheckAutoPass —
        // a panel nie był przerysowany po przewinięciu; naprawione w main.js,
        // decyzja właściciela 2026-08-16: semantyka ptaszka jest poprawna,
        // błędem był wyłącznie nieodświeżony ekran). Gdyby wróciło, ma być
        // widoczne jako `rules`, a nie schowane w obserwacjach UX.
        const evidence = `${action ? `${action} → ` : ''}${reason}${rec?.afterTick ? ' [tuż po ptaszku wyciszenia]' : ''}`;
        push(found, 'rules', 'Komenda gracza odrzucona przez engine', evidence);
      }
    }
  }
  for (const line of lines) {
    if (/Ruch odrzucony/.test(line)) {
      if (rejectionsExpected || rejectionRecords) continue;
      push(found, 'rules', 'Komenda gracza odrzucona przez engine', line);
    }
    if (/nie powinno się zdarzyć|Brak akcji —/.test(line)) {
      push(found, 'rules', 'Interfejs sam zgłasza stan nieoczekiwany', line);
    }
    // Życie rosnące u obrońcy przy zadawaniu mu obrażeń (sanity check logu).
    const dmg = line.match(/zadaje (\d+) obrażeń? \((Ty|Nieprzyjaciel)\)/);
    if (dmg && Number(dmg[1]) === 0) {
      push(found, 'rules', 'Zdarzenie „zadaje 0 obrażeń" w logu (powinno być pominięte)', line);
    }
  }
  return found;
}

/**
 * Oś 3 (M98) — MARTWE OKNO: panel akcji bez żadnej realnej opcji.
 *
 * Przypadek właściciela „Forever Young → ekran z jedyną opcją »Poddaj walkę«":
 * gracz utknął w oknie, w którym da się tylko poddać partię. To jest w pełni
 * widoczne w DOM (lista przycisków `#actions`), więc tester MUSI to łapać sam,
 * zamiast czekać na zgłoszenie z telefonu.
 *
 * Zgłaszamy, gdy jedyne dostępne akcje to „Poddaj partię" (ewentualnie
 * z „Dalej/pass"), a partia wciąż trwa — czyli gra nie daje graczowi wyjścia
 * albo auto-pass nie przewinął pustego okna.
 */
export function detectDeadEndWindow(lines, { windowRecords = null } = {}) {
  const found = [];
  // M99: dane STRUKTURALNE ze sterownika (panel akcji w każdym kroku) są
  // niezależne od snapshotów — pod `--quiet` linii `AKCJE:` nie ma wcale,
  // więc detektor oglądał jedno okno na całą partię. Gdy sterownik je poda,
  // korzystamy z nich; parsowanie linii zostaje dla transkryptów z archiwum.
  if (windowRecords) {
    for (const rec of windowRecords) {
      if (rec.gameOver) continue;
      const actions = (rec.actions ?? []).map((t) => String(t).trim()).filter(Boolean);
      const evidence = `AKCJE: ${actions.join('  ||  ') || '(brak)'}`;
      if (actions.length === 0) { push(found, 'ui', 'Okno gracza BEZ żadnej akcji (martwe okno)', evidence); continue; }
      if (actions.every((t) => /^Poddaj/.test(t))) {
        push(found, 'ui', 'Jedyna opcja to „Poddaj partię" — gracz nie ma wyjścia', evidence);
      }
    }
    return found;
  }
  // Po zakończeniu partii panel akcji jest pusty i TAK MA BYĆ — nagłówek
  // snapshotu niesie „Koniec partii", więc pomijamy takie okna (fałszywy
  // alarm wykryty przy weryfikacji regresyjnej M98).
  let gameOver = false;
  for (const line of lines) {
    if (/^--- krok .*Koniec partii|^== KONIEC PARTII ==/.test(line)) gameOver = true;
    if (/^== NOWA PARTIA/.test(line)) gameOver = false;
    if (gameOver) continue;
    const m = line.match(/^\s*AKCJE:\s*(.+)$/);
    if (!m) continue;
    const raw = m[1].trim();
    if (raw === '(brak)') { push(found, 'ui', 'Okno gracza BEZ żadnej akcji (martwe okno)', line); continue; }
    const actions = raw.split('||').map((t) => t.trim()).filter(Boolean);
    const meaningful = actions.filter((t) => !/^Poddaj/.test(t));
    if (actions.length > 0 && meaningful.length === 0) {
      push(found, 'ui', 'Jedyna opcja to „Poddaj partię" — gracz nie ma wyjścia', line);
    }
    // Alarm, który UI wypisuje samo (render.js) — nie może zostać przeoczony.
    if (/Brak akcji — sesja przewija okna z samym passem/.test(line)) {
      push(found, 'ui', 'UI zgłasza: okno z samym passem (auto-pass powinien przewinąć)', line);
    }
  }
  return found;
}

/**
 * Oś 2 (M98) — BRAK OKNA NA ODPOWIEDŹ: bot rzuca czar, a gracz nigdy nie
 * dostaje priorytetu, mimo że ma instant/zdolność i manę.
 *
 * Przypadek właściciela „Carrion Call: brak okna na instant w odpowiedzi".
 * Prawdziwy brak okna wygląda tak: rzucenie i rozstrzygnięcie czaru mieszczą
 * się w JEDNYM bloku modala „Rozgrywka" — bot nie oddał priorytetu.
 *
 * M99 (weryfikacja mutacyjna): pierwsza wersja resetowała kontekst wyłącznie
 * na widok snapshotu ze stosem (`STOS: ...`), więc pod `--quiet` (snapshoty
 * wyłączone) produkowała fałszywe alarmy — zgłaszała czar „Index", przy którym
 * gracz priorytet DOSTAŁ. Detektor nie może zależeć od poziomu logowania:
 * dowodem oddania priorytetu jest KAŻDY ślad powrotu sterowania do gracza —
 * nowy blok modala, akcja gracza (`>>`), modal wyboru albo snapshot ze stosem.
 */
export function detectNoResponseWindow(lines) {
  const found = [];
  // Ślady tego, że gracz odzyskał kontrolę między rzuceniem a rozstrzygnięciem.
  const REGAINED_CONTROL = [
    /^\s*\[ROZGRYWKA\]\s*Rozgrywka\s*$/,  // nowy blok modala = poprzedni zamknięty
    /^\s*>>/,                                            // kliknięcie gracza w panelu akcji
    /^\s*\[modal choice\]/,                              // decyzja gracza w modalu
    /^\s*\[combat wizard\]/,                             // wizard walki po stronie gracza
    /^\s*STOS:\s*(?!Stos pusty)/,                        // snapshot z niepustym stosem
  ];
  let pendingCast = null;
  for (const line of lines) {
    const cast = line.match(/\[ROZGRYWKA\]\s*•\s*Nieprzyjaciel rzuca ([^→|]+)/);
    if (cast) { pendingCast = cast[1].trim(); continue; }
    if (pendingCast && REGAINED_CONTROL.some((re) => re.test(line))) { pendingCast = null; continue; }
    // Rozstrzygnięcie tego samego czaru bez śladu oddania priorytetu = brak okna.
    if (pendingCast && new RegExp(`${pendingCast.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} zostaje rozstrzygni`).test(line)) {
      push(found, 'info', `Czar bota „${pendingCast}" rzucony i rozstrzygnięty bez okna na odpowiedź gracza`, line);
      pendingCast = null;
    }
  }
  return found;
}

/**
 * Oś 3 (M98) — GRUPA WARIANTÓW BEZ PTASZKA.
 *
 * Przypadek właściciela „Village Rites / Bone Splinters nie mają okienka do
 * zaptaszkowania": czar z wariantami jest w panelu JEDNYM przyciskiem
 * („Wybierz: …"), który dawniej nie dostawał ptaszka wyciszenia.
 * Tester rejestruje etykiety akcji wraz z informacją o ptaszku, więc może to
 * sprawdzić bez udziału człowieka.
 */
export function detectGroupWithoutTick(actionRecords) {
  const found = [];
  // Grupy wyboru dla czarów/zdolności (wyciszalne) — w odróżnieniu od
  // obowiązkowych decyzji resolve_* (scry, mulligan, discard...).
  // M103: sam prefiks „Cel" łapał też „Cel pokoju lochu" (obowiązkowy wybór
  // pokoju Undercity, któremu ptaszek się NIE należy) — dlatego bare „Cel"
  // wymaga, by NIE szło po nim słowo (negative lookahead).
  const IGNORABLE_GROUP = /^(Cel czaru|Cel zdolności|Bestow|Aura|Wybierz: (Cel czaru|Cel zdolności|Cel(?! \p{L})|Wariant|Tryb|Wartość X))/iu;
  for (const rec of actionRecords ?? []) {
    if (!IGNORABLE_GROUP.test(rec.label)) continue;
    if (rec.hasTick) continue;
    push(found, 'ui', 'Grupa wariantów czaru/zdolności bez ptaszka wyciszenia', rec.label);
  }
  return found;
}

/**
 * Oś „noop" (M103, L15) — OFERTA BEZ SKUTKU: akcja z panelu, której kliknięcie
 * nie zmienia stanu gry (albo zmienia go wyłącznie o zapłacony koszt) lub
 * kończy się fizzlem już przy w pełni pasywnym przeciwniku.
 *
 * Wzorzec z M102: U8 (czar celujący w stwora poświęcanego jako własny koszt),
 * U9 (equip na obecnego nosiciela — no-op za koszt), U10 (fizzle udający
 * sukces). Dotąd wymagał ręcznego czytania transkryptów (`uniq -d` po >>);
 * teraz mierzy go sonda `probeCommandEffect` (src/table/noop-probe.js),
 * uruchamiana z mostka `window.__mtgDebug` (?tester=1) przy każdym kliknięciu.
 *
 * M104: rekordy niosą też ŹRÓDŁO oferty — `panel` (przycisk „Twoje działania")
 * albo `modal` (opcja wizarda wyboru). Rozróżnienie jest istotne, bo w modalu
 * opcja „nic nie rób" (rezygnuję / nie płacę / bez celów) jest LEGALNYM
 * wyborem gracza, a nie ofertą bez skutku — zgłoszenie jej byłoby fałszywym
 * alarmem (panel takich przycisków nie pokazuje: tam „nic nie rób" to pass).
 *
 * Wejście: rekordy sondy ze sterownika — { label, source, applied, probe }.
 * Detektor jest czystą funkcją (testy bez jsdom, syntetyczne rekordy).
 */
export function detectNoEffectOffers(probeRecords) {
  const found = [];
  // Produkcja many to realny efekt, który nie zostawia śladu w fingerprint
  // (pula many jest poza nim) — tapnięcie źródła wyglądałoby jak „sam koszt".
  const MANA_ABILITY = /dodaj man|dodaje man|produkcj[aę] many|mana z/i;
  // Pass/concede/wznowienie z definicji nie są „ofertami skutku" — mostek
  // sesji je odfiltrowuje, ale detektor ma własną bramkę (obrona w głąb).
  const PASS_LABEL = /^Dalej\b|^Wznów grę bota|Poddaj/;
  // M104: opcje REZYGNACJI w modalu. Gracz świadomie wybiera „nic nie rób"
  // (CR: efekty „you may", „up to one target", odmowa płatności) — brak
  // zmiany stanu jest wtedy ZAMIERZONY, a nie wadą oferty.
  const DECLINE_OPTION = /rezygnuj|nie płać|nie kładź|nie odkładaj|nie znajduj|nie poświęcaj|bez poświęcenia|bez celów|bez ataku|bez bloków|pomijam|brak karty|zostaw kartę|nie przypisuj/i;
  for (const rec of probeRecords ?? []) {
    // Rekord jest DOWODEM, gdy: (a) gracz kliknął, a partia klik przyjęła
    // (`applied` — odrzucone kliknięcie nie dowodzi niczego), albo
    // (b) pochodzi ze SKANU okna (M104): sonda wykonała komendę na klonie,
    // więc pomiar stoi sam za siebie, nawet jeśli gracz kliknął co innego.
    if (!rec || !rec.probe || !rec.probe.ok) continue;
    if (!rec.applied && !rec.scanned) continue;
    const { label, probe } = rec;
    const source = rec.source === 'modal' ? 'modal' : 'panel';
    const where = source === 'modal' ? ' (opcja modala)' : '';
    if (MANA_ABILITY.test(label) || PASS_LABEL.test(label)) continue;
    if (source === 'modal' && DECLINE_OPTION.test(label)) continue;
    if (probe.blockedByChoice) continue; // otwarcie decyzji to skutek
    if (!probe.changed) {
      push(found, 'noop', `Oferta bez skutku${where} — kliknięcie nie zmienia stanu gry`, label);
      continue;
    }
    if (probe.fizzle) {
      push(found, 'noop', `Oferta pewną stratą${where} — fizzle już przy pasywnym przeciwniku`, label);
      continue;
    }
    const effectDiffs = probe.effectDiffs ?? [];
    if (effectDiffs.length > 0) continue;
    const costPaid = ((probe.costSignature?.mana && ((probe.ownLandTaps ?? 0) > 0 || Boolean(probe.manaChanged)))
      || (probe.costSignature?.tap && (probe.ownOtherTaps ?? 0) > 0)
      || (probe.costSignature?.tapCreature && (probe.ownOtherTaps ?? 0) > 0)
      || (probe.costSignature?.life && (probe.humanLifeDelta ?? 0) < 0)
      // M104: „Remove a counter" jako koszt (Rustvine Cultivator) — bez tego
      // zdjęty licznik wyglądał jak SKUTEK i maskował no-opa.
      || (probe.costSignature?.removeCounter && Boolean(probe.costCounterPaid)));
    // Tapnięcia/untapnięcia permanentów przeciwnika oraz zysk życia to
    // SKUTKI, nie koszty — nie zgłaszamy, gdy cokolwiek takiego zaszło.
    const onlyCosts = (probe.opponentTaps ?? 0) === 0
      && (probe.ownUntaps ?? 0) === 0
      && (probe.opponentUntaps ?? 0) === 0
      && (probe.humanLifeDelta ?? 0) <= 0;
    // M122/#4: PRODUKCJA many to skutek, a rozpoznawaliśmy ją wyłącznie po
    // polskim tekście etykiety (MANA_ABILITY). Etykieta GRUPY w panelu brzmi
    // „Aktywuj: Dragonbroods' Relic (5 opcji)" — nie ma w niej słowa „mana",
    // więc filtr nie działał i sonda raportowała 5 fałszywych no-opów.
    // Sygnał strukturalny jest jednoznaczny: pula many wzrosła (`manaChanged`),
    // choć komenda nie miała kosztu manowego (`costSignature.mana === false`),
    // czyli many PRZYBYŁO, a nie ubyło.
    const producedMana = Boolean(probe.manaChanged) && !probe.costSignature?.mana;
    if (costPaid && onlyCosts && !producedMana) {
      push(found, 'noop', `Oferta bez skutku${where} — jedyna zmiana to zapłacony koszt`, label);
    }
  }
  return found;
}

/** Uruchamia komplet detektorów; zwraca listę zgłoszeń pogrupowaną po kategorii. */
/**
 * Oś 2 (M119) — BŁĘDNA ODMIANA POLSKA w tekście widocznym dla gracza.
 *
 * Powód powstania: audyt M119 przeczytał dwanaście transkryptów i znalazł
 * „dostaje +2 licznik +1/+1”, „traci 2 licznik stun”, „Proliferate: 2 celów”
 * oraz „odłóż 5 karty”. Wszystkie przeszły przez komplet detektorów bez
 * jednego zgłoszenia — bo dotąd nikt nie sprawdzał gramatyki, a `polishPlural`
 * istniał i był używany tylko w części opisów.
 *
 * Reguła polska: 1 → forma pojedyncza, 2–4 (poza 12–14) → forma „few”,
 * reszta → „many”. Detektor sprawdza rzeczowniki, które faktycznie występują
 * w logu z liczebnikiem, i zgłasza formę niezgodną z liczbą.
 */
const PLURAL_RULES = [
  { one: 'licznik', few: 'liczniki', many: 'liczników' },
  { one: 'kartę', few: 'karty', many: 'kart' },
  { one: 'cel', few: 'cele', many: 'celów' },
  { one: 'stwór', few: 'stwory', many: 'stworów' },
  { one: 'obrażenie', few: 'obrażenia', many: 'obrażeń' },
  { one: 'token', few: 'tokeny', many: 'tokenów' },
];

/** Poprawna forma rzeczownika dla liczby (ta sama reguła co w session.js). */
export function expectedPolishForm(n, rule) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return rule.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return rule.few;
  return rule.many;
}

export function detectPolishPluralErrors(lines) {
  const found = [];
  for (const line of lines) {
    if (!/\[ROZGRYWKA\]|LOG:|AKCJE:|\[modal choice\]/.test(line)) continue;
    for (const rule of PLURAL_RULES) {
      const forms = [rule.one, rule.few, rule.many];
      // „+2 licznik”, „2 celów”, „odłóż 5 karty” — liczba tuż przed rzeczownikiem.
      // UWAGA: \\b nie działa po polskich znakach („kartę” kończy się literą
      // spoza [A-Za-z0-9_], więc \\b dopasowałoby przedrostek „kart”).
      // Granicę wyrazu sprawdzamy jawnie: po rzeczowniku nie może stać litera.
      const pattern = new RegExp(`\\+?(\\d+)\\s+(${forms.map(escapeRe).join('|')})(?![\\p{L}])`, 'gu');
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const n = Number(match[1]);
        if (!Number.isFinite(n)) continue;
        const want = expectedPolishForm(n, rule);
        if (match[2] !== want) {
          push(found, 'info',
            `Błędna odmiana: „${match[1]} ${match[2]}" — powinno być „${match[1]} ${want}"`,
            line);
        }
      }
    }
  }
  return found;
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Oś 4 (M119) — MODAL Z NIEROZRÓŻNIALNYMI OPCJAMI.
 *
 * Powód powstania: mulligan londyński pokazywał 35 wariantów „odłóż 3 karty”,
 * w tym piętnaście pozycji o IDENTYCZNEJ etykiecie
 * („Mulligan — odłóż na spód (2): Mountain, Mountain”), różniących się tylko
 * numerkiem „(x z 15)”. Gracz nie ma jak wybrać świadomie — każdy z tych
 * wariantów daje ten sam stan gry (karty o tej samej nazwie są wymienne,
 * CR 400.1). Ta sama klasa co M102/U3 (wybór landa do poświęcenia).
 *
 * Detektor normalizuje etykiety opcji (ucina licznik egzemplarzy „(x z N)”)
 * i zgłasza modal, w którym po normalizacji zostają duplikaty.
 */
export function detectIndistinguishableOptions(lines, { threshold = 2 } = {}) {
  const found = [];
  for (const line of lines) {
    const marker = '[modal choice] ';
    const index = line.indexOf(marker);
    if (index === -1) continue;
    const body = line.slice(index + marker.length).trim();
    // Interesuje nas WYPIS całego modala (jedna linia z listą opcji),
    // nie pojedyncze wiersze „▶ opcja”.
    if (body.startsWith('▶') || /^\s/.test(body)) continue;
    const options = body.split(/(?=Mulligan — odłóż|Szukanie:|Wybierz:)/).map((s) => s.trim()).filter(Boolean);
    if (options.length < 3) continue;
    const counts = new Map();
    for (const option of options) {
      const normalized = option.replace(/\s*\(\d+\s*z\s*\d+\)\s*$/, '').trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    for (const [label, count] of counts) {
      if (count > threshold) {
        push(found, 'ui',
          `Modal ma ${count} nieodróżnialnych opcji „${label.slice(0, 60)}" — gracz wybiera w ciemno`,
          line);
      }
    }
  }
  return found;
}

/**
 * Oś 2 (M123) — PRZECIEK UKRYTEJ INFORMACJI w modalu „Rozgrywka".
 *
 * Zgłoszenie właściciela: przy wpisach „Nieprzyjaciel dobiera kartę" modal
 * pokazywał ILUSTRACJE kart. Tekst poprawnie ukrywał nazwę (FoW), ale
 * miniaturka renderowała się niezależnie i zdradzała kartę, którą bot wziął
 * do ręki (CR 400.2).
 *
 * Dlaczego 60 partii M122 tego nie znalazło: żaden detektor nie miał reguły
 * dla TEJ klasy błędu (L27 — „zero zgłoszeń" znaczy „nie mam reguły").
 * Transkrypt zapisuje kafle jako tekst, więc wyciek widać jako nazwę karty
 * stojącą przy wpisie, który z definicji ma być bezimienny.
 */
export function detectHiddenCardLeak(lines, knownCardNames = new Set()) {
  const found = [];
  for (const line of lines) {
    if (!/\[ROZGRYWKA\]|\[modal/.test(line)) continue;
    if (!/Nieprzyjaciel dobiera kartę/.test(line)) continue;
    for (const name of knownCardNames) {
      if (name.length < 4) continue; // krótkie nazwy dają fałszywe trafienia
      if (!line.includes(name)) continue;
      push(found, 'rules',
        `Przeciek ukrytej informacji: przy „dobiera kartę" widać kartę „${name}"`,
        line);
      break;
    }
  }
  return found;
}

/**
 * Oś 1 (M138/Z1) — BOT WZMACNIA MOJE STWORY.
 *
 * Audyt „wcielam się w gracza”: w jednej partii bot 24× aktywował Soulbright
 * Flamekin, dając Zadeptywanie MOIM stworom (Elemental, Giant Spider, Voice of
 * the Vermin…). Płacił {2} za wzmocnienie przeciwnika — i to keywordem
 * użytecznym wyłącznie w ataku NA NIEGO.
 *
 * Dlaczego nie złapał tego `detectBotSelfTargeting`: tam warunkiem jest
 * „→ cel: Nieprzyjaciel” przy efekcie SZKODLIWYM. Tu jest odwrotnie — efekt
 * jest KORZYSTNY, a cel należy do GRACZA. To dokładnie druga przekątna tej
 * samej macierzy i nikt jej nie pilnował (L27: „zero zgłoszeń” znaczy „nie mam
 * reguły”).
 *
 * Rozpoznanie po treści logu: linia mówi, że to ruch przeciwnika, a kolejna
 * przypisuje zysk stworowi z MOJEGO pola. Nazwy własnych permanentów podaje
 * sterownik (`myPermanentNames`) — po deskryptorze „czyj to obiekt”, nie po
 * nazwie karty (ADR 0002).
 */
export function detectBotBuffsMyCreatures(lines, myPermanentNames = new Set(), enemyPermanentNames = new Set()) {
  const found = [];
  const BENEFIT = /zyskuje:|dostaje \+[0-9]|otrzymuje \+[0-9]|licznik \+1\/\+1|nadanie słów kluczowych|zdobądź|\+[0-9]+\/\+[0-9]+/i;
  const HARMFUL = /obrażeni|zniszcz|wygna|zabij|poświęc|odrzuc|mieli|-1\/-1|traci/i;
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\[ROZGRYWKA\]|LOG:/.test(line)) continue;
    if (!/Nieprzyjaciel (aktywuje|rzuca)/.test(line)) continue;
    const match = /→ cel: ([^⏎|]+?)\s*$/.exec(line) ?? /→ cel: ([^⏎|]+?)(?:\s\||⏎)/.exec(line);
    if (!match) continue;
    const target = match[1].trim();
    if (!target || /^Nieprzyjaciel/.test(target)) continue;
    if (!myPermanentNames.has(target)) continue;
    // Nazwa widziana też po stronie wroga = nie wiadomo, czyj jest ten
    // egzemplarz. Milczymy zamiast zgadywać (fałszywy alarm gorszy od ciszy
    // w narzędziu, które ma budować zaufanie do zgłoszeń).
    if (enemyPermanentNames.has(target)) continue;
    // Korzyść bywa opisana w NASTĘPNYM wpisie („X zyskuje: zadeptywanie”),
    // więc oceniamy wpis aktywacji RAZEM z najbliższym sąsiedztwem. Bez tego
    // detektor milczał na dokładnie tym kształcie, dla którego powstał.
    const context = lines.slice(i, i + 3).join(' ⏎ ');
    if (HARMFUL.test(context)) continue;   // removal w mój permanent to poprawna gra
    if (!BENEFIT.test(context)) continue;
    const key = `${target}|${line.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    push(found, 'bot',
      `Bot wzmacnia TWÓJ permanent („${target}") — płaci za korzyść przeciwnika`,
      line.trim());
  }
  return found;
}

/**
 * M146 — bot ODRKĘCA TWÓJ permanent (Twiddle — tryb „Odkręcenie" i efekty
 * untap). Odkręcenie cudzego permanentu oddaje wrogowi manę/blokera — pomoc
 * przeciwnikowi. Przed wyceną (kara -25) bot rzucał Twiddle-Odkręcenie na
 * górę wroga w swoim upkeepie (audyt Żywym Testerem M146). Ta sama matryca
 * co detectBotBuffsMyCreatures, tylko dla efektu odkręcającego.
 */
export function detectBotUntapsMyPermanent(lines, myPermanentNames = new Set(), enemyPermanentNames = new Set()) {
  const found = [];
  const UNTAP = /tryb: Odkręcenie|odkręć/i;
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\[ROZGRYWKA\]|LOG:/.test(line)) continue;
    if (!/Nieprzyjaciel (aktywuje|rzuca)/.test(line)) continue;
    if (!UNTAP.test(line)) continue;
    const match = /→ cel: ([^⏎|]+?)\s*$/.exec(line) ?? /→ cel: ([^⏎|]+?)(?:\s\||⏎)/.exec(line);
    if (!match) continue;
    const target = match[1].trim();
    if (!target || /^Nieprzyjaciel/.test(target)) continue;
    if (!myPermanentNames.has(target)) continue;
    if (enemyPermanentNames.has(target)) continue;
    const key = `${target}|${line.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    push(found, 'bot',
      `Bot odkręca TWÓJ permanent („${target}") — płaci za korzyść przeciwnika`,
      line.trim());
  }
  return found;
}

/**
 * Oś 2 (M138/Z4) — LOG TWIERDZI, ŻE NIC SIĘ NIE WYDARZYŁO, A COŚ SIĘ WYDARZYŁO.
 *
 * Voice of the Vermin: log pisał „trigger bez efektu (nic się nie wydarzyło
 * (zerowy wynik))”, a Giant Spider w tym samym kroku zmienił się z 1/3 na 3/3.
 * Root cause: `resolveTrigger` uznaje „0 nowych zdarzeń” za „brak skutku”,
 * więc każdy efekt mutujący stan BEZ emisji zdarzenia (L24 — cichy skutek)
 * produkuje aktywnie FAŁSZYWY komunikat.
 *
 * Detektor porównuje deklarację z sąsiedztwem: jeśli tuż obok wpisu „zerowy
 * wynik” widać zmianę P/T, liczników albo statusu, to zaprzeczenie samo siebie
 * demaskuje. Działa na treści logu, nie na snapshotach (M99/M104) — te same
 * linie są w obu trybach.
 */
export function detectFalseNoEffect(lines, { window: windowSize = 1 } = {}) {
  const found = [];
  // Skutek widoczny w logu: zmiana P/T, licznik, keyword, tap/untap.
  const CHANGE = /zyskuje:|dostaje \+|traci [0-9]|staje się|zostaje odkręcon|zostaje zatapnion|licznik|\b[0-9]+\/[0-9]+\b/i;
  // Wpisy logu bywają sklejone w JEDNEJ linii `LOG:` separatorem ⏎ (ogon logu
  // w snapshocie) albo rozbite na osobne linie `[ROZGRYWKA]`. Rozwijamy oba
  // kształty do płaskiej listy zdarzeń — inaczej detektor widzi „zerowy wynik”
  // i dowód jako jeden nierozróżnialny ciąg i nie zgłasza nic (fałszywa cisza).
  const entries = [];
  for (const line of lines) {
    if (!/\[ROZGRYWKA\]|LOG:/.test(line)) continue;
    for (const part of line.split('⏎')) {
      const clean = part.replace(/^\s*(?:\[ROZGRYWKA\]\s*)?(?:•\s*)?/, '').replace(/^\s*LOG:\s*/, '').trim();
      if (clean) entries.push(clean);
    }
  }
  const seen = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (!/zerowy wynik/.test(entries[i])) continue;
    const source = /^([^—]+) —/.exec(entries[i]);
    const name = source ? source[1].trim() : null;
    // M151 (audyt żywym testerem): OKNO POJEDYNCZE, tylko NAPRZÓD. Poprzednie
    // ±4 mieszało DWA niezależne triggery w tym samym oknie (Veiled Ascension
    // “zerowy wynik" + osobny pump Akrasan Squire) i produkowało fałszywe
    // alarmy. Legalny przypadek L24 (efekt mutuje stan bez zdarzenia) ma
    // skutek jako NASTĘPNY wpis zaraz po “zerowy wynik"; inny trigger wchodzi
    // między nie innymi zdarzeniami, więc znikąd. Patrzymy wyłącznie na
    // bezpośredniego następnika (i — dla sklejonych logów — poprzednika).
    const from = Math.max(0, i - 1);
    const to = Math.min(entries.length, i + 1 + windowSize);
    const near = entries.slice(from, to);
    const evidence = near.find((entry) => entry !== entries[i]
      && CHANGE.test(entry)
      && (!name || entry.includes(name) || CHANGE.test(entry)));
    if (!evidence) continue;
    const key = entries[i].slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    push(found, 'rules',
      'Log mówi „nic się nie wydarzyło (zerowy wynik)", a obok widać skutek',
      `${entries[i]} || DOWÓD: ${evidence}`);
  }
  return found;
}

/**
 * Oś 2 (M138/Z2,Z3,Z5,Z9,Z10) — OPIS KARTY URWANY W POŁOWIE.
 *
 * Pięć z dziesięciu znalezisk audytu to jedna klasa: kafel pokazywał warunek
 * bez skutku („gdy ma licznik +1/+1” — i tyle), koszt bez członu („{1}, {T}”
 * zamiast „{R}, {T}, odrzuć kartę”), cel bez parametru („stwór o sile ≥” bez
 * liczby!) albo aurę zupełnie bez treści („Enchantment — Aura”).
 *
 * Wspólny mianownik: mapa etykiet nie nadążyła za danymi kart (L29/L31).
 * Detektor szuka w transkrypcie zdań, które KOŃCZĄ SIĘ spójnikiem/operatorem
 * albo mają pusty człon opisu — czyli wyglądają na ucięte w pół słowa. To
 * heurystyka tekstowa, więc zgłoszenie jest hipotezą (jak każde tutaj), ale
 * wyłapuje całą rodzinę naraz, także dla kart dodanych w przyszłości.
 */
export function detectTruncatedCardText(lines) {
  const found = [];
  // Zdanie kończące się operatorem/przyimkiem = brakuje parametru.
  // Operator/przyimek bez dopełnienia = brakuje parametru. „gdy ma licznik X”
  // jest tu SAMODZIELNIE poprawny, o ile w opisie stoi też skutek (keyword) —
  // po naprawie Z3 kafel brzmi „Zasięg · gdy ma licznik +1/+1” i to jest pełne
  // zdanie, więc warunek zgłaszamy tylko wtedy, gdy jest JEDYNĄ treścią reguł.
  const DANGLING = /(?:o sile [≥≤]|z podtypem|bez podtypu|ze słowem kluczowym|o sile)\s*(?:·|\||$)/;
  const LONE_CONDITION = /·\s*gdy [^·|]*·\s*[0-9]+\/[0-9]+\s*(?:\||$)/;
  const seen = new Set();
  for (const line of lines) {
    if (!/RĘKA:|POLA|\[modal|AKCJE:/.test(line)) continue;
    for (const chunk of line.split('|')) {
      const text = chunk.trim();
      if (!text || text.length < 8) continue;
      // Warunek jest jedyną treścią reguł tylko wtedy, gdy przed nim nie ma
      // opisu skutku — czyli po typie karty od razu leci „gdy …”.
      const loneCondition = LONE_CONDITION.test(text)
        && /(?:Creature|Artifact|Enchantment)[^·|]*·\s*gdy /.test(text);
      if (!DANGLING.test(text) && !loneCondition) continue;
      const key = text.slice(0, 90);
      if (seen.has(key)) continue;
      seen.add(key);
      push(found, 'ui', 'Opis karty urwany — warunek/cel bez parametru', text);
    }
    // Kafel permanentu bez ŻADNEJ treści reguł: sama nazwa, koszt i typ.
    // Tak wyglądała aura Grounded („Enchantment — Aura” i nic więcej).
    // Nazwa może stać po etykiecie strefy („RĘKA: Grounded · 2 · …”) albo po
    // separatorze kafli („| Grounded · …”) — oba kształty daje transkrypt.
    const bare = /(?:^|\| |: )([A-Z][A-Za-z'’ -]{3,}) · [0-9]+ · (Enchantment — Aura|Artifact — Equipment)\s*(?:\||$)/.exec(line);
    if (bare) {
      const key = `bare:${bare[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        push(found, 'ui', `Kafel „${bare[1]}" nie pokazuje ŻADNEJ treści reguł`, bare[0].trim());
      }
    }
  }
  return found;
}

/**
 * M151 (audyt żywym testerem) — PRZECIEK SZUMU DO LOGU GRACZA.
 *
 * TESTER_STOLU.md (oś 2) dokumentuje `mana_produced` i `step_advanced` jako
 * wyciszone, a mimo to główny log gracza zalewały: 18× „Nieprzyjaciel
 * przygotowuje manę (Swamp)" i 140× „— beginning/upkeep —" w jednej
 * partii (root cause: apply/streamAutoEvents logowały describeEvent bez
 * filtra). To strażnik nawrotu: jeśli szum znów trafi do logu gracza,
 * detektor to zgłosi w dowolnej rozgrywce.
 */
export function detectLogNoiseLeak(lines) {
  const found = [];
  const stepPhase = /—\s*(beginning|untap|upkeep|draw|precombat|postcombat|combat|end|cleanup)\/[a-z_]+\s*—/;
  for (const line of lines) {
    if (!/(LOG:|\[ROZGRYWKA\]|\[modal)/.test(line)) continue;
    if (/przygotowuje manę/.test(line)) {
      push(found, 'info', 'Log gracza pokazuje szum „przygotowuje manę" (mana_produced ma być wyciszone)', line.trim());
      continue;
    }
    if (stepPhase.test(line)) {
      push(found, 'info', 'Log gracza pokazuje szum przejścia fazy (step_advanced ma być wyciszony)', line.trim());
    }
  }
  return found;
}

export function runDetectors(lines, { actionRecords = [], windowRecords = null, profile = null, probeRecords = [], rejectionRecords = null, harmfulNames = new Set(), allCardNames = new Set(), myPermanentNames = new Set(), enemyPermanentNames = new Set() } = {}) {
  const all = [
    ...detectRawText(lines),
    ...detectBotRepeats(lines),
    ...detectBotSelfTargeting(lines),
    ...detectBotSelfHarmOnOwnPermanents(lines, harmfulNames),
    ...detectHiddenCardLeak(lines, allCardNames),
    ...detectEmptyBotMoveModal(lines),
    ...detectMissingIgnoreTick(actionRecords),
    ...detectRuleSmells(lines, { profile, rejectionRecords }),
    // M98 — przypadki, które dotąd zgłaszał właściciel z telefonu, a są
    // w pełni widoczne w DOM (decyzja właściciela: tester ma je łapać sam).
    ...detectDeadEndWindow(lines, windowRecords ? { windowRecords } : {}),
    ...detectNoResponseWindow(lines),
    ...detectGroupWithoutTick(actionRecords),
    // M103 (L15) — wzorzec „oferta bez skutku" z M102 (U8/U9/U10):
    // pomiar sondą na klonie stanu zamiast ręcznego czytania transkryptów.
    ...detectNoEffectOffers(probeRecords),
    // M119 (audyt żywym testerem) — klasy błędów, które przeszły przez
    // komplet dotychczasowych detektorów bez jednego zgłoszenia.
    ...detectPolishPluralErrors(lines),
    ...detectIndistinguishableOptions(lines),
    // M138 (audyt „wcielam się w gracza”) — trzy klasy, które przeszły przez
    // komplet dotychczasowych detektorów: 22 partie dały ZERO zgłoszeń, a
    // ręczne czytanie transkryptu dziesięć znalezisk (L27).
    ...detectBotBuffsMyCreatures(lines, myPermanentNames, enemyPermanentNames),
    ...detectBotUntapsMyPermanent(lines, myPermanentNames, enemyPermanentNames),
    ...detectFalseNoEffect(lines),
    ...detectTruncatedCardText(lines),
    ...detectLogNoiseLeak(lines),
  ];
  // Deduplikacja: ten sam komunikat + dowód pojawia się raz.
  const seen = new Set();
  const unique = [];
  for (const item of all) {
    const key = `${item.category}|${item.message}|${item.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/** Formatuje zgłoszenia do sekcji transkryptu (czytelne dla człowieka). */
export function formatFindings(findings) {
  if (findings.length === 0) return ['== DETEKTORY: brak zgłoszeń =='];
  const out = [`== DETEKTORY: ${findings.length} zgłoszeń (do weryfikacji) ==`];
  const byCategory = new Map();
  for (const f of findings) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  for (const [category, items] of byCategory) {
    out.push(`  [${category}] ${items.length}`);
    for (const item of items.slice(0, 12)) {
      out.push(`    - ${item.message}`);
      out.push(`      ${item.evidence}`);
    }
    if (items.length > 12) out.push(`    … i ${items.length - 12} więcej`);
  }
  return out;
}
