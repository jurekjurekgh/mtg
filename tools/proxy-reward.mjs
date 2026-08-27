/**
 * B6 T2 — gęstszy sygnał (proxy reward) dla strojenia bota.
 *
 * Problem (z docs/setup/STROJENIE_BOTA.md → „Pułapki / credit assignment"):
 * czysty win-rate to sygnał 1-bitowy z końca gry — zmiana wyceny jednej rodziny
 * tonie w szumie kilkudziesięciu decyzji. Runda 1–2 strojenia (M225) pokazała
 * to wprost: benchmark blisko nasycenia, win-rate nie rozróżnia wariantów.
 *
 * Rozwiązanie: PROXY = pozycyjna przewaga gracza `heuristic`, próbkowana GĘSTO
 * (co turę) w trakcie partii. Trzy składowe liczone z SUROWEGO stanu:
 *   - materiał: Σ (power + toughness) kontrolowanych stworów,
 *   - karty: liczba obiektów gracza w ręce + na polu bitwy (card advantage),
 *   - życie: różnica życia gracz − przeciwnik.
 * Uśrednione po turach dają ciągłą miarę „jak dobrze bot prowadził grę", a nie
 * tylko „czy wygrał". To jest sygnał, który zmienia się wraz z wyceną rodziny,
 * więc hill-climbing ma czego szukać.
 *
 * Determinizm (ADR 0005): czyste funkcje stanu, zero RNG i zegara. FoW nie
 * dotyczy — to narzędzie OFFLINE (pomiar), nie kontroler; czyta pełny stan
 * (jak harness/benchmark), nie PlayerView. Bot dalej widzi wyłącznie PlayerView.
 *
 * Skala: proxy jest NORMALIZOWANE do ~[0,1] (funkcja logistyczna), żeby dało
 * się je mieszać z win-rate wagą β bez przypadkowej dominacji jednej skali.
 */

/** Σ (power + toughness) stworów kontrolowanych przez gracza. */
export function materialAdvantage(state, playerId) {
  let sum = 0;
  for (const id of state.zones.battlefield) {
    const o = state.objects.get(id);
    if (o && o.controllerId === playerId && o.kind === 'creature') {
      sum += (o.power ?? 0) + (o.toughness ?? 0);
    }
  }
  return sum;
}

/** Liczba obiektów gracza w ręce + na polu bitwy (miara przewagi kartowej). */
export function cardAdvantage(state, playerId) {
  let count = 0;
  for (const zone of ['hand', 'battlefield']) {
    for (const id of state.zones[zone]) {
      if (state.objects.get(id)?.controllerId === playerId) count += 1;
    }
  }
  return count;
}

/** Życie gracza (0, gdy brak). */
export function lifeOf(state, playerId) {
  return state.players.find((p) => p.id === playerId)?.life ?? 0;
}

const OPPONENT_OF = (state, playerId) => state.players.find((p) => p.id !== playerId)?.id ?? null;

/**
 * Surowa przewaga pozycyjna (różnice gracz − przeciwnik), bez normalizacji.
 * Rozbita na składowe, żeby dało się je diagnozować i ważyć osobno.
 */
export function positionalDelta(state, playerId) {
  const foeId = OPPONENT_OF(state, playerId);
  return {
    material: materialAdvantage(state, playerId) - (foeId ? materialAdvantage(state, foeId) : 0),
    cards: cardAdvantage(state, playerId) - (foeId ? cardAdvantage(state, foeId) : 0),
    life: lifeOf(state, playerId) - (foeId ? lifeOf(state, foeId) : 0),
  };
}

/** Logistyka — mapuje dowolną liczbę do (0,1); k to łagodność nachylenia. */
function logistic(x, k) {
  return 1 / (1 + Math.exp(-x / k));
}

/**
 * Skalarny proxy w (0,1): ważona suma znormalizowanych składowych przewagi.
 * Wagi składowych dobrane tak, by materiał i karty (trwała przewaga) liczyły
 * się mocniej niż chwilowa różnica życia. To NIE są parametry strojenia bota
 * — to definicja miernika (stała, jak funkcja celu benchmarku).
 */
export function positionalScore(state, playerId) {
  const d = positionalDelta(state, playerId);
  // Nachylenia dobrane do typowych zakresów: materiał ±20, karty ±6, życie ±20.
  const material = logistic(d.material, 10);
  const cards = logistic(d.cards, 4);
  const life = logistic(d.life, 12);
  return 0.45 * material + 0.35 * cards + 0.20 * life;
}

/**
 * Akumulator próbek proxy dla JEDNEJ partii. `sample(state)` woła się z haka
 * onStep symulacji, ale próbkuje tylko przy ZMIANIE numeru tury (gęstość ~1
 * próbka/turę wystarcza, a nie zawyża przez setki passów w jednej turze).
 */
export function createProxySampler(playerId) {
  let lastTurn = -1;
  let sum = 0;
  let samples = 0;
  return {
    sample(state) {
      const turn = state.turn?.number ?? 0;
      if (turn === lastTurn) return;
      lastTurn = turn;
      sum += positionalScore(state, playerId);
      samples += 1;
    },
    /** Średni proxy w (0,1); 0.5, gdy brak próbek (neutralne). */
    mean() {
      return samples > 0 ? sum / samples : 0.5;
    },
    get count() { return samples; },
  };
}
