import { createRng } from '../engine/rng.js';

/**
 * Prosty kontroler testowy: wybiera wyłącznie spośród legalnych komend widoku.
 *
 * `allowConcede: false` usuwa `concede` z losowania — losowa kapitulacja
 * kończyłaby większość partii w pierwszej turze, co czyni bota bezużytecznym
 * jako punkt odniesienia benchmarku B0 (`tools/benchmark.mjs`). Domyślnie
 * zachowanie pozostaje bez zmian (kompatybilność scenariuszy testowych,
 * w tym eksploracji losowych ścieżek z ADR 0004).
 */
export function createRandomBot({ seed, allowConcede = true }) {
  const rng = createRng(seed);
  return Object.freeze({
    chooseCommand(view) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      const pool = allowConcede
        ? view.legalCommands
        : view.legalCommands.filter((cmd) => cmd.type !== 'concede');
      if (!pool.length) throw new Error('Widok nie zawiera legalnych komend poza kapitulacją');
      const index = Math.floor(rng() * pool.length);
      return pool[index];
    },
  });
}
