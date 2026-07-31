/**
 * Deterministyczny kontroler testowy: gra agresywnie, korzystając WYŁĄCZNIE
 * z komend oferowanych przez PlayerView. Nie jest produkcyjnym botem
 * (Etap 4) — służy do rozegrania partii syntetycznych w testach silnika.
 */
export function createAggroController() {
  const byType = (view, type) => view.legalCommands.filter((cmd) => cmd.type === type);
  return Object.freeze({
    chooseCommand(view) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      const simple = ['draw_card', 'play_land', 'tap_for_mana', 'cast_permanent'];
      for (const type of simple) {
        const found = byType(view, type)[0];
        if (found) return found;
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
