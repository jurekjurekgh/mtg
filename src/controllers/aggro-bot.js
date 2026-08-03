/**
 * Deterministyczny bot referencyjny „aggro": gra agresywnie, korzystając
 * WYŁĄCZNIE z komend oferowanych przez PlayerView. Nie używa RNG (ADR 0005).
 *
 * Rola: punkt odniesienia benchmarku B0 (patrz `tools/benchmark.mjs` i
 * `docs/BOT_ROADMAP.md`) oraz prosty kontroler scenariuszowy w testach
 * silnika. Wymienny z innymi kontrolerami wg ADR 0004.
 *
 * Przeniesiony bez zmian zachowania z `test/helpers/aggro-controller.js`
 * (jako `createAggroController`), żeby benchmark i przyszłe konfiguracje
 * przeciwników mogły importować go z katalogu produkcyjnych kontrolerów.
 */
export function createAggroBot() {
  const byType = (view, type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const powerOf = (view, objectId) => view.zones.battlefield.find((o) => o.id === objectId)?.power ?? 0;
  return Object.freeze({
    chooseCommand(view) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      // resolve_scry / resolve_surveil: wymuszona odpowiedź na scry/surveil
      // (np. Campus, Curate) — aggro bierze pierwszy wariant z legalCommands
      // (deterministycznie, bez wyboru: skry na spód, surveil do grobu).
      const simple = ['draw_card', 'play_land', 'tap_for_mana', 'cast_permanent', 'activate_ability', 'resolve_scry', 'resolve_surveil', 'resolve_backup'];
      for (const type of simple) {
        const found = byType(view, type)[0];
        if (!found) continue;
        if (type === 'activate_ability') {
          // Aggro używa wyłącznie equipu własnego equipmentu — darmowy buff
          // najsilniejszego stwora pasuje do planu „atakuj". Zdolności z ręki
          // (cycling: odrzucenie groźby za land) są anty-aggro, pomijane.
          const variants = byType(view, 'activate_ability').filter((cmd) => {
            const source = view.zones.battlefield.find((o) => o.id === cmd.objectId);
            const target = view.zones.battlefield.find((o) => o.id === cmd.targets?.[0]);
            return source?.equipment && source.controllerId === view.playerId
              && target?.controllerId === view.playerId;
          });
          if (!variants.length) continue;
          return variants.reduce((best, cmd) => (powerOf(view, cmd.targets[0]) > powerOf(view, best.targets[0]) ? cmd : best));
        }
        if (type === 'resolve_backup') {
          // Aggro wzmacnia własny, najsilniejszy stwór; gdy brak własnych —
          // najsłabszy obcy (wybór wymuszony przez „target creature").
          const variants = byType(view, 'resolve_backup');
          const own = variants.filter((cmd) => powerOf(view, cmd.targetId) >= 0
            && view.zones.battlefield.find((o) => o.id === cmd.targetId)?.controllerId === view.playerId);
          const pool = own.length > 0 ? own : variants;
          return pool.reduce((best, cmd) => {
            const better = own.length > 0
              ? powerOf(view, cmd.targetId) > powerOf(view, best.targetId)
              : powerOf(view, cmd.targetId) < powerOf(view, best.targetId);
            return better ? cmd : best;
          });
        }
        return found;
      }
      // Od czarów: obrażenia w najsilniejszego wroga, wzmocnienie własnego
      // najsilniejszego w fazie combat.
      const casts = byType(view, 'cast_spell');
      if (casts.length) {
        const enemyCasts = casts.filter((cmd) => cmd.targets?.some((id) => {
          const target = view.zones.battlefield.find((o) => o.id === id);
          return target && target.controllerId !== view.playerId;
        }));
        if (enemyCasts.length) {
          return enemyCasts.reduce((best, cmd) => (powerOf(view, cmd.targets[0]) > powerOf(view, best.targets[0]) ? cmd : best));
        }
        const inCombat = view.turn.phase === 'combat';
        const ownCasts = casts.filter((cmd) => cmd.targets?.some((id) => {
          const target = view.zones.battlefield.find((o) => o.id === id);
          return target && target.controllerId !== view.playerId;
        }));
        if (inCombat && ownCasts.length) {
          return ownCasts.reduce((best, cmd) => (powerOf(view, cmd.targets[0]) > powerOf(view, best.targets[0]) ? cmd : best));
        }
      }
      // Equip (CR 702.6): gdy nie ma co rzucać, wzmacniamy własnego
      // najsilniejszego stwora — typowe zagranie aggro z ekwipunkiem.
      const equips = byType(view, 'activate_ability').filter((cmd) => {
        const source = view.zones.battlefield.find((o) => o.id === cmd.objectId);
        const target = view.zones.battlefield.find((o) => o.id === cmd.targets?.[0]);
        return source?.equipment && source.controllerId === view.playerId
          && target?.kind === 'creature' && target.controllerId === view.playerId;
      });
      if (equips.length) {
        return equips.reduce((best, cmd) => (powerOf(view, cmd.targets[0]) > powerOf(view, best.targets[0]) ? cmd : best));
      }
      const attacks = byType(view, 'declare_attackers');
      if (attacks.length) {
        return attacks.reduce((best, cmd) => (cmd.attackerIds.length > best.attackerIds.length ? cmd : best));
      }
      const blocks = byType(view, 'declare_blockers');
      if (blocks.length) {
        const size = (cmd) => Object.values(cmd.assignments).reduce((total, ids) => total + ids.length, 0);
        return blocks.reduce((best, cmd) => (size(cmd) > size(best) ? cmd : best));
      }
      const resolve = byType(view, 'resolve_combat')[0];
      if (resolve) return resolve;
      const pass = byType(view, 'pass_priority')[0];
      if (pass) return pass;
      throw new Error('Kontroler nie znalazł ruchu mimo legalnych komend');
    },
  });
}
