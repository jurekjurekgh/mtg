import { createRng } from '../engine/rng.js';

/**
 * Bot heurystyczny (Etap 4): punktuje wszystkie legalne komendy z PlayerView
 * prostymi regułami i wybiera najlepszą; `randomness` steruje odchyleniem
 * od optimum przez seedowane RNG (ADR 0005 — brak Math.random).
 *
 * Ślad decyzji jest dostępny przez `trace()` — do debugowania i benchmarków.
 * Bot nie widzi nic poza PlayerView i nie potrzebuje wiedzy o konkretnych
 * kartach: operuje na ogólnych polach (kind, statystyki, deskryptory).
 */

const NEVER = Number.NEGATIVE_INFINITY;

export function createHeuristicBot({ seed, randomness = 0 }) {
  if (!Number.isInteger(seed)) throw new TypeError('Bot wymaga całkowitego seeda');
  if (typeof randomness !== 'number' || randomness < 0 || randomness > 1) throw new RangeError('randomness ma być w [0, 1]');
  const rng = createRng(seed);
  const history = [];

  const byType = (view, type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const objectOnBoard = (view, objectId) => view.zones.battlefield.find((o) => o.id === objectId);
  const handCard = (view, objectId) => view.zones.hand.find((o) => o.id === objectId);
  const myLife = (view) => view.players.find((p) => p.id === view.playerId)?.life ?? 0;
  const enemy = (view) => view.players.find((p) => p.id !== view.playerId);
  const myCreatures = (view) => view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'creature');
  const enemyCreatures = (view) => view.zones.battlefield.filter((o) => o.controllerId !== view.playerId && o.kind === 'creature');
  const untappedEnemyBlockers = (view) => enemyCreatures(view).filter((o) => !o.tapped);

  function scoreCommand(view, cmd) {
    switch (cmd.type) {
      case 'concede': return NEVER;
      case 'draw_card': return 100;
      case 'play_land': return 90;
      case 'tap_for_mana': {
        // Tap ma sens tylko przy czymś do zagrania w ręce; inaczej zostaw priorytet.
        const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
        return hasPlayable ? 80 : 1;
      }
      case 'cast_permanent': {
        const card = handCard(view, cmd.objectId);
        if (cmd.bestow || cmd.targets?.length) {
          // Czar aury (bestow albo czysta aura): +N/+N i keywordy na stworze.
          // Opłaca się tym bardziej, im większy gospodarz; stwór PRZECIWNIKA
          // wzmacniany własnym zaczarowaniem jest błędem — wariant odrzucany.
          const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
          if (!target || target.controllerId !== view.playerId) return -50;
          const descriptor = cmd.bestow ? card?.bestow : card?.aura;
          const pump = descriptor?.pump ?? { power: 0, toughness: 0 };
          return 66 + 2 * ((target.power ?? 0) + pump.power) + ((target.toughness ?? 0) + pump.toughness);
        }
        return 70 + (card?.power ?? 0) * 2 + (card?.toughness ?? 0);
      }
      case 'cast_spell': {
        const card = handCard(view, cmd.objectId);
        const spell = card?.spell;
        if (!spell) return 60;
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        const effects = spell.effects ?? [];
        let score = 50;
        for (const effect of effects) {
          if (effect.type === 'damage' && target && target.controllerId !== view.playerId) {
            const lethal = (effect.amount ?? 0) >= (target.toughness ?? 0) - (target.damage ?? 0);
            score += 10 + 3 * (target.power ?? 0) + (lethal ? 15 : 0);
          } else if (effect.type === 'damage') {
            score -= 60; // lanie we własne stwory bez powodu jest marnotrawstwem
          }
          if (effect.type === 'pump' && target && target.controllerId === view.playerId) {
            const trick = view.turn.phase === 'combat' ? 18 : 2;
            score += trick + (target.power ?? 0);
          } else if (effect.type === 'pump') {
            score -= 60; // wzmacnianie przeciwnika bez powodu jest błędem
          }
        }
        return score;
      }
      case 'activate_ability': {
        // Zdolności aktywowane (w tym {X} jak u Liry): neutralizacja wrogiego
        // stwora jest cenna, własne pumpy — umiarkowanie.
        let score = 30;
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        if (target && target.controllerId !== view.playerId) score += 6 + 2 * (target.power ?? 0);
        if (cmd.xValue != null) score += 4 - (cmd.xValue ?? 0);
        // Equip: załączenie na własnym stworze jest tym lepsze, im większy
        // nosiciel; evasion z grantowanych keywordów (flying) i haste dla
        // świeżych stworów mają realną cenę — bez tego bot nigdy nie wyposaża.
        const sourceEquip = cmd.attackerId === undefined && target && objectOnBoard(view, cmd.objectId)?.equipment;
        if (sourceEquip && target.controllerId === view.playerId) {
          const grants = sourceEquip.keywords ?? [];
          score += 10 + 2 * (target.power ?? 0);
          if (grants.includes('flying') && untappedEnemyBlockers(view).every((o) => !(o.keywords ?? []).includes('flying') && !(o.keywords ?? []).includes('reach'))) score += 8;
          if (grants.includes('haste') && target.summoningSickness) score += 6;
        }
        // Cycling: rotacja ma sens tylko dla kart, których nie da się
        // wkrótce wyrzucić (koszt > landy+1). Tanie cyklowanie karty, którą
        // za turę-dwie można rzucić, dewastuje grę — z taką wolimy poczekać
        // (wariant gorszy niż pass_priority, wygrywa dopiero przy braku planu).
        const cycled = handCard(view, cmd.objectId);
        if (cycled) {
          const myLands = view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'land').length;
          if ((cycled.manaCost ?? 0) <= myLands + 1) return -5;
          score += 2;
        }
        return score;
      }
      case 'declare_attackers': {
        const attackers = cmd.attackerIds;
        const blockers = untappedEnemyBlockers(view);
        const strongestBlocker = blockers.reduce((max, o) => Math.max(max, o.power ?? 0), 0);
        const enemyLife = enemy(view)?.life ?? 0;
        let score = 0;
        for (const id of attackers) {
          const object = objectOnBoard(view, id);
          if (!object) continue;
          const power = object.power ?? 0;
          const survivesTrade = blockers.length === 0 || (object.toughness ?? 0) > strongestBlocker;
          score += survivesTrade ? power + 3 : power - 2;
        }
        // Presja: atak w otwartego, lethal i przewaga liczebna premiowane.
        if (blockers.length === 0 && attackers.length > 0) score += 8;
        const totalPower = attackers.reduce((sum, id) => sum + (objectOnBoard(view, id)?.power ?? 0), 0);
        if (totalPower >= enemyLife && attackers.length > 0) score += 100;
        return score;
      }
      case 'declare_blockers': {
        const assignments = cmd.assignments ?? {};
        let score = 0;
        for (const [attackerId, blockerIds] of Object.entries(assignments)) {
          const attacker = objectOnBoard(view, attackerId);
          score += (attacker?.power ?? 0); // powstrzymane obrażenia
          for (const blockerId of blockerIds) {
            const blocker = objectOnBoard(view, blockerId);
            const attackerObj = objectOnBoard(view, attackerId);
            if (!blocker || !attackerObj) continue;
            const blockerDies = (attackerObj.power ?? 0) >= (blocker.toughness ?? 0) - (blocker.damage ?? 0);
            const killsAttacker = (blocker.power ?? 0) >= (attackerObj.toughness ?? 0) - (attackerObj.damage ?? 0);
            score += killsAttacker ? 6 : 0;
            score -= blockerDies ? (blocker.power ?? 0) + 2 : 0;
          }
        }
        // Pod presją śmiertelną warto blokować nawet kosztem stwora.
        const incoming = Object.keys(assignments).length === 0
          ? enemyAttackPower(view)
          : 0;
        if (incoming >= myLife(view)) score -= 40;
        return score;
      }
      case 'resolve_combat': return 50;
      case 'resolve_backup': {
        // Backup: liczniki + grant keywordów idą na najsilniejszego WŁASnego
        // stwora (wzmocnienie przeciwnika tylko, gdy brak własnych — wybór
        // wymuszony, bierzemy najsłabszy cel obcy). Samo źródło też jest
        // legalne (wtedy bez grantu) — traktowane jak każdy własny stwór.
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return 0;
        if (target.controllerId === view.playerId) return 40 + 2 * (target.power ?? 0) + (target.toughness ?? 0);
        return 5 - (target.power ?? 0);
      }
      case 'resolve_scry': {
        // Scry: na spód kładziemy wyłącznie to, co raczej zbędne — land przy
        // przesycie landów (≥3 w ręce albo ≥6 na stole). W przeciwnym razie
        // zostawiamy na wierzchu. Generyczne deskryptory (kind), zero nazw kart.
        const bottoms = cmd.bottomIds ?? [];
        if (bottoms.length === 0) return 20; // wariant „zostaw na wierzchu"
        const looked = (view.pendingScry?.cards ?? []).filter((card) => bottoms.includes(card.id));
        const landsInHand = view.zones.hand.filter((o) => o.kind === 'land').length;
        const myLands = view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'land').length;
        const allUnwanted = looked.length > 0 && looked.every((card) => (card.kind ?? '') === 'land' && (landsInHand >= 3 || myLands >= 6));
        return allUnwanted ? 25 : 20;
      }
      case 'pass_priority': return 0;
      default: return 0;
    }
  }

  function enemyAttackPower(view) {
    // Podczas własnego okna bloków przeciwnik ma już zadeklarowanych atakujących
    // na planszy jako tapped — przybliżamy zagrożenie sumą siły wrogich stworów.
    return enemyCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  }

  function summarize(cmd) {
    if (cmd.type === 'declare_attackers') return `attack[${cmd.attackerIds.join(',')}]`;
    if (cmd.type === 'declare_blockers') return `block[${Object.entries(cmd.assignments ?? {}).map(([a, b]) => `${a}<${b.join('+')}`).join(' ')}]`;
    if (cmd.type === 'cast_spell' || cmd.type === 'cast_permanent') return `${cmd.type}(${cmd.objectId}${cmd.targets ? '->' + cmd.targets.join('+') : ''})`;
    return cmd.type;
  }

  return Object.freeze({
    chooseCommand(view) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      const scored = view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
      scored.sort((a, b) => b.score - a.score);
      let pick = scored[0];
      if (randomness > 0 && scored.length > 1 && rng() < randomness) {
        const pool = scored.slice(0, Math.min(3, scored.length));
        pick = pool[Math.floor(rng() * pool.length)];
      }
      history.push({
        turn: view.turn.number, step: view.turn.step,
        chosen: summarize(pick.cmd), score: pick.score,
        options: scored.map((entry) => ({ cmd: summarize(entry.cmd), score: entry.score })),
      });
      return pick.cmd;
    },
    /** Ślad uzasadnień punktowych — diagnostyka decyzji bota. */
    trace() {
      return history.map((entry) => ({ ...entry, options: entry.options.map((o) => ({ ...o })) }));
    },
  });
}
