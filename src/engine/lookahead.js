import { execute, playerView } from './game-state.js';

/**
 * Lookahead B2 (docs/BOT_ROADMAP.md): symulacja „co by było, gdyby" na KLONIE
 * stanu (structuredClone). Engine pozostaje jedynym autorytetem reguł — bot nie
 * implementuje zasad, tylko dostaje funkcję, która wykonuje kandydata na klonie
 * i dogrywa scenariusz prostą polityką.
 *
 * Deterministyczne (ADR 0005): klon + ta sama polityka + te same komendy dają
 * ten sam wynik — zero Math.random, zero zegara. Klon jest w pełni niezależny
 * od stanu oryginalnego (structuredClone kopiuje Map-y, tablice i obiekty gry).
 *
 * Polityka to funkcja `(view, playerId) → Command` dostarczana przez
 * WYWOŁUJĄCEGO (np. czysta, zachłanna heurystyka bota) — engine nie zna
 * kontrolerów (ADR 0004: wymienne kontrolery, zero zależności w dół).
 */
export function makeSimulate(state) {
  return function simulate(cmd, { policy = null, maxCommands = 24, horizon = null } = {}) {
    const clone = structuredClone(state);
    const exec = execute(clone, cmd);
    const currentPlayerId = cmd.playerId;
    if (!exec.ok) {
      return {
        rejected: true,
        view: playerView(clone, currentPlayerId),
        finished: clone.status !== 'active',
        winnerId: clone.winnerId,
        steps: 0,
      };
    }
    let steps = 0;
    while (clone.status === 'active' && steps < maxCommands) {
      // Horyzont zawęża symulację do bezpośrednich konsekwencji decyzji:
      // - 'combat': do rozstrzygnięcia sesji walki (state.combat === null po
      //   resolve_combat) — ewaluacja deklaracji ataku nie może zależeć od
      //   losów kolejnych tur;
      // - 'main_phase': do wyjścia z własnej fazy main — sekwencjonowanie
      //   zagrywania (land → stwór → zdolność) bez szumu dalszych tur;
      // - null: czysty limit komend (bezpiecznik).
      if (steps > 0 && horizon === 'combat' && clone.combat === null) break;
      if (steps > 0 && horizon === 'main_phase' && !['precombat_main', 'postcombat_main'].includes(clone.turn.phase)) break;
      const pid = clone.turn.priorityPlayerId;
      let view = playerView(clone, pid);
      // Gdy combat już istnieje, ponowna deklaracja ataku jest nielegalna
      // (CR 508.1 — deklaracja jest jednorazowa). Engine wprost tego nie
      // egzekwuje, więc symulacja zawęża widok dla polityki, żeby nie
      // nadpisywała rozpatrywanego ataku.
      if (clone.combat && clone.turn.step === 'declare_attackers') {
        view = { ...view, legalCommands: view.legalCommands.filter((c) => c.type !== 'declare_attackers') };
      }
      const choice = policy ? policy(view, pid) : view.legalCommands[0];
      if (!choice) break;
      // Bezpiecznik: brzegowe przypadki engine (np. śmierć uczestnika combatu
      // od czaru przed rozstrzygnięciem obrażeń) nie mogą wywalać symulacji —
      // scena jest wtedy ucinana, a kandydat zostaje z oceną B1.
      try {
        if (!execute(clone, choice).ok) break;
      } catch {
        break;
      }
      steps += 1;
    }
    return {
      rejected: false,
      view: playerView(clone, currentPlayerId),
      finished: clone.status !== 'active',
      winnerId: clone.winnerId,
      steps,
    };
  };
}
