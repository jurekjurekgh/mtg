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
      // resolve_scry / resolve_surveil / resolve_clash_choice: wymuszona
      // odpowiedź na decyzje (np. Campus, Curate, Release the Ants) — aggro
      // bierze pierwszy wariant z legalCommands (deterministycznie: skry na
      // spód, surveil do grobu, clash na wierzch).
      const simple = ['draw_card', 'play_land', 'tap_for_mana', 'cast_permanent', 'cast_adventure', 'cast_adventure_creature', 'activate_ability', 'resolve_scry', 'resolve_surveil', 'resolve_clash_choice', 'resolve_backup', 'resolve_room_target', 'resolve_sacrifice_choice', 'resolve_food_choice', 'resolve_discover_choice', 'resolve_explore_choice', 'resolve_craft_exile', 'resolve_hand_creature', 'resolve_devour_choice', 'resolve_endure_choice', 'resolve_delirium_target', 'resolve_mentor_target', 'resolve_graveyard_top_choice', 'resolve_legend_choice', 'resolve_reveal_order', 'resolve_proliferate', 'resolve_damage_target', 'resolve_modal_choice', 'resolve_discard_choice', 'resolve_hand_top_choice', 'resolve_land_type_choice', 'resolve_search_choice', 'resolve_pay_or_sacrifice', 'resolve_optional_pay_choice', 'resolve_trigger_target', 'resolve_optional_trigger_choice', 'resolve_moonlit_choice', 'resolve_mulligan_choice', 'resolve_mulligan_bottom_choice'];
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
        if (type === 'resolve_room_target') {
          // Wybór celu pokoju lochu (M24) — deterministyczna polityka aggro:
          // Trap! → przeciwnik; Throne → najsilniejszy odsłonięty stwór;
          // Forge/Arena → własny najsilniejszy stwór (goad własnego =
          // gwarantowany atak; goad wroga w 1v1 zmusza go do ataku na nas).
          const variants = byType(view, 'resolve_room_target');
          const pending = view.pendingRoomTarget;
          if (!pending) return variants[0];
          if (pending.kind === 'player') {
            return variants.find((cmd) => cmd.targetId !== view.playerId) ?? variants[0];
          }
          if (pending.kind === 'revealed_creature') {
            const stats = (id) => {
              const card = (pending.cards ?? []).find((c) => c.id === id);
              return card ? (card.power ?? 0) * 2 + (card.toughness ?? 0) : 0;
            };
            return variants.reduce((best, cmd) => (stats(cmd.targetId) > stats(best.targetId) ? cmd : best));
          }
          const own = variants.filter((cmd) => {
            const target = view.zones.battlefield.find((o) => o.id === cmd.targetId);
            return target && target.controllerId === view.playerId;
          });
          const pool = own.length > 0 ? own : variants;
          return pool.reduce((best, cmd) => (powerOf(view, cmd.targetId) > powerOf(view, best.targetId) ? cmd : best));
        }
        if (type === 'resolve_sacrifice_choice') {
          // Grave Exchange: cel poświęca stwora własnego wyboru — aggro
          // deterministycznie poświęca NAJsłabszego własnego stwora (minimalizuje
          // stratę atakującego planu).
          const variants = byType(view, 'resolve_sacrifice_choice');
          return variants.reduce((best, cmd) => (powerOf(view, cmd.targetId) < powerOf(view, best.targetId) ? cmd : best));
        }
        if (type === 'resolve_food_choice') {
          // Insatiable Appetite: aggro poświęca Food (+5/+5).
          return byType(view, 'resolve_food_choice').find((c) => c.sacrifice) ?? found;
        }
        if (type === 'resolve_discover_choice') {
          // Geological Appraiser: aggro rzuca bez kosztu.
          return byType(view, 'resolve_discover_choice').find((c) => c.castFree) ?? found;
        }
        if (type === 'resolve_explore_choice') {
          // Guidestone Compass: aggro zachowuje kartę na wierzchu.
          return byType(view, 'resolve_explore_choice').find((c) => !c.putInGraveyard) ?? found;
        }
        if (type === 'resolve_devour_choice') {
          // Aggro nie poświęca ciał pod devour — stwory atakują.
          return byType(view, 'resolve_devour_choice').find((c) => c.done === true) ?? found;
        }
        if (type === 'resolve_endure_choice') {
          // Aggro woli drugie ciało (token Spirit) niż licznik — więcej ataków.
          return byType(view, 'resolve_endure_choice').find((c) => c.mode === 'token') ?? found;
        }
        if (type === 'resolve_delirium_target') {
          // Najsilniejszy stwór poszkodowanego przeciwnika jako cel.
          const variants = byType(view, 'resolve_delirium_target');
          return variants.reduce((best, cmd) => (powerOf(view, cmd.targetId) > powerOf(view, best.targetId) ? cmd : best));
        }
        if (type === 'resolve_mentor_target') {
          // Mentor: licznik na najsilniejszym kandydata-ciele (własny atakujący).
          const variants = byType(view, 'resolve_mentor_target');
          return variants.reduce((best, cmd) => (powerOf(view, cmd.targetId) > powerOf(view, best.targetId) ? cmd : best));
        }
        if (type === 'resolve_graveyard_top_choice') {
          // Aggro nie spowalnia dobrań — przewaga natychmiastowego ataku.
          return byType(view, 'resolve_graveyard_top_choice').find((c) => c.done === true) ?? found;
        }
        if (type === 'resolve_hand_creature') {
          // Położenie wielokolorowego stwora za darmo jest zawsze lepsze niż nic.
          return byType(view, 'resolve_hand_creature').find((c) => c.targetId != null) ?? found;
        }
        if (type === 'resolve_craft_exile') {
          // Lodestone Needle: aggro exile najsłabszy artefakt.
          const variants = byType(view, 'resolve_craft_exile');
          return variants.reduce((best, cmd) => (powerOf(view, cmd.targetId) < powerOf(view, best.targetId) ? cmd : best));
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
