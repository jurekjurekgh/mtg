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
      // K (Abstruse Interference): oferta „zapłać” przy kontrze/ward powstaje
      // także przy samej ręcznej manie (CR 608.2g — najpierw aktywacja
      // źródła, potem płatność). Losowanie płatności przed wyprodukowaniem
      // many kończy się odrzuceniem komendy, więc losujemy spośród komend
      // wykonywalnych OD RAZU (auto-mana: pula + nietapnięte lądy); aktywacja
      // źródła nadal może wypaść i odblokuje płatność w kolejnej decyzji.
      const autoMana = (view.players?.find((p) => p.id === view.playerId)?.mana ?? 0)
        + (view.zones?.battlefield ?? []).filter((o) => o.controllerId === view.playerId
          && !o.tapped && (o.kind === 'land' || (o.types ?? []).includes('Land'))).length;
      const maAktywacjeMany = view.legalCommands.some((cmd) => cmd.type === 'activate_ability');
      const wykonywalne = view.legalCommands.filter((cmd) =>
        !(maAktywacjeMany
          && (cmd.type === 'resolve_counter_pay_choice' || cmd.type === 'resolve_ward_pay_choice')
          && cmd.pay === true && (cmd.cost ?? 0) > autoMana));
      const pool = allowConcede
        ? wykonywalne
        : wykonywalne.filter((cmd) => cmd.type !== 'concede');
      if (!pool.length) throw new Error('Widok nie zawiera legalnych komend poza kapitulacją');
      const index = Math.floor(rng() * pool.length);
      return pool[index];
    },
  });
}
