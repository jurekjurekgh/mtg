import { createRng } from '../engine/rng.js';
import { autoManaUnits, castBeyondAutoMana } from './mana-offer-guards.js';

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
      const autoUnits = autoManaUnits(view);
      const autoMana = autoUnits.length;
      const maAktywacjeMany = view.legalCommands.some((cmd) => cmd.type === 'activate_ability');
      // N (rozszerzenie kontraktu K na rzuty): oferta castu może opierać
      // się na manie z ręcznej aktywacji (poświęcenie Sciona, CR 605.3a).
      // Losowanie takiego castu bez uprzedniej produkcji kończy się
      // odrzuceniem — losujemy spośród wykonywalnych od razu; aktywacja
      // źródła może wypaść i cast odblokuje się w kolejnej decyzji. Koszt
      // liczmy z obiektu widoku (`manaCost` = MV; komendy X/fireball niosą
      // własny `cost`). Bez aktywacji many w ofercie ogniwa filter śpi.
      const CASTY = new Set(['cast_permanent', 'cast_spell', 'cast_cleave',
        'cast_escape', 'cast_flashback', 'cast_adventure', 'cast_adventure_creature']);
      const wykonywalne = view.legalCommands.filter((cmd) => {
        if (!maAktywacjeMany) return true;
        if ((cmd.type === 'resolve_counter_pay_choice' || cmd.type === 'resolve_ward_pay_choice')
          && cmd.pay === true && (cmd.cost ?? 0) > autoMana) return false;
        if (CASTY.has(cmd.type) && castBeyondAutoMana(view, cmd, autoUnits)) return false;
        return true;
      });
      const pool = allowConcede
        ? wykonywalne
        : wykonywalne.filter((cmd) => cmd.type !== 'concede');
      if (!pool.length) throw new Error('Widok nie zawiera legalnych komend poza kapitulacją');
      const index = Math.floor(rng() * pool.length);
      return pool[index];
    },
  });
}
