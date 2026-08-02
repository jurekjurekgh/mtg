import { createRng } from '../engine/rng.js';
import { createCardRegistry } from '../cards/card-data.js';

/**
 * Bot heurystyczny (Etap 4, B1): punktuje wszystkie legalne komendy z PlayerView
 * prostymi regułami i wybiera najlepszą; `randomness` steruje odchyleniem
 * od optimum przez seedowane RNG (ADR 0005 — brak Math.random).
 *
 * Ślad decyzji jest dostępny przez `trace()` — do debugowania i benchmarków.
 * Bot nie widzi nic poza PlayerView; deskryptory zdolności czyta z rejestru
 * kart po `cardId` (koszty tap/mana, typ efektu) — to wciąż OGÓLNE deskryptory
 * (abilities/keywords/typy), zero znajomości nazw kart (ADR 0002).
 *
 * B1 (2026-08-02) dodał względem pierwotnej heurystyki:
 * - świadomość kroków: w własnym untap/upkeep/draw/end/cleanup nie tapuje się
 *   many ani nie aktywuje zdolności kosztem tapu (mana wyparuje na końcu
 *   kroku, stwór zostaje zatapiany całą turę) — likwiduje patologię
 *   „wypalania własnej biblioteki\" przez stanie w miejscu;
 * - zegar (tury do zabicia / do śmierci): bonusy za bliskość lethal,
 *   groźbę śmierci w następnej turze (wyścig) i pustą bibliotekę (deck-out);
 * - ocenę planszy: evasion (flying), parytet liczby stworów;
 * - wycenę zdolności wg efektu (pump = przyrost siły minus koszt tapu,
 *   neutralizacja Liry = wartość celu, equip/evasion, cycling jak dotąd);
 * - blokowanie świadome ceny: nie chumpuje cennymi atakującymi bez presji.
 */

const NEVER = Number.NEGATIVE_INFINITY;

export function createHeuristicBot({ seed, randomness = 0, lookahead = 0 }) {
  if (!Number.isInteger(seed)) throw new TypeError('Bot wymaga całkowitego seeda');
  if (typeof randomness !== 'number' || randomness < 0 || randomness > 1) throw new RangeError('randomness ma być w [0, 1]');
  const rng = createRng(seed);
  const registry = createCardRegistry();
  const history = [];
  const enabled = lookahead > 0;

  // B2 — lookahead: ograniczony koszt symulacji i waga poprawy ewaluacji.
  const LOOKAHEAD_TOP_K = 3;
  const LOOKAHEAD_MAX_COMMANDS = 12;
  const LOOKAHEAD_WEIGHT = 3;
  // Lookahead koryguje tylko przy wyraźnej różnicy ewaluacji (|delta| >= próg)
  // — neutralne wymiany (delta ~0) zostawiają decyzję heurystyce B1.
  const LOOKAHEAD_EVAL_THRESHOLD = 2;
  const LOOKAHEAD_TYPES = ['play_land', 'cast_permanent', 'cast_spell', 'activate_ability', 'declare_attackers'];

  const byType = (view, type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const objectOnBoard = (view, objectId) => view.zones.battlefield.find((o) => o.id === objectId);
  const handCard = (view, objectId) => view.zones.hand.find((o) => o.id === objectId);
  const myLife = (view) => view.players.find((p) => p.id === view.playerId)?.life ?? 0;
  const enemy = (view) => view.players.find((p) => p.id !== view.playerId);
  const myCreatures = (view) => view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'creature');
  const enemyCreatures = (view) => view.zones.battlefield.filter((o) => o.controllerId !== view.playerId && o.kind === 'creature');
  const untappedEnemyBlockers = (view) => enemyCreatures(view).filter((o) => !o.tapped);
  const myTurn = (view) => view.turn.activePlayerId === view.playerId;
  // Kroki własnej tury, w których tapowanie (many albo stworów) nie ma sensu:
  // mana wyparuje na końcu kroku, a stwór zostaje zatapiany całą turę.
  const wastefulStep = (view) => myTurn(view) && ['untap', 'upkeep', 'draw', 'end', 'cleanup'].includes(view.turn.step);
  const myLibraryCount = (view) => view.zones.library.filter((o) => o.controllerId === view.playerId).length;
  const myLandCount = (view) => view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'land').length;
  const myBoardPower = (view) => myCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  const enemyBoardPower = (view) => enemyCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  const cardDef = (cardId) => (cardId ? registry.get(cardId) : undefined);
  const hasKeyword = (object, keyword) => (object?.keywords ?? []).includes(keyword);
  const canAttackNow = (object) => Boolean(object) && !object.tapped && !object.summoningSickness;

  function enemyAttackPower(view) {
    // Podczas własnego okna bloków przeciwnik ma już zadeklarowanych atakujących
    // na planszy jako tapped — przybliżamy zagrożenie sumą siły wrogich stworów.
    return enemyCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  }

  function scoreCommand(view, cmd) {
    switch (cmd.type) {
      case 'concede': return NEVER;
      case 'draw_card': return 100;
      case 'play_land': return 90;
      case 'tap_for_mana': {
        // Własne kroki początkowe/końcowe: mana wyparuje na końcu kroku,
        // a land zostaje zatapiany całą turę — gorzej niż pass.
        if (wastefulStep(view)) return -15;
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
        const def = card ? cardDef(card.cardId) : undefined;
        let score = 70 + (card?.power ?? 0) * 2 + (card?.toughness ?? 0);
        // Evasion (flying) realnie zwiększa szanse zadania obrażeń.
        if (hasKeyword(def, 'flying')) score += 3;
        // Rozwój do parytetu liczby stworów — obrona przed aggro.
        if (myCreatures(view).length < enemyCreatures(view).length) score += 4;
        return score;
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
        // Ninjutsu (z ręki, zwraca nieblokowanego atakującego): wartość =
        // ile lepszy nowy stwór od zastępowanego, plus evasion.
        if (cmd.attackerId != null) {
          const hand = handCard(view, cmd.objectId);
          const oldAttacker = objectOnBoard(view, cmd.attackerId);
          if (!hand || !oldAttacker) return 0;
          let score = 25;
          score += ((hand.power ?? 0) - (oldAttacker.power ?? 0)) * 2;
          score += (hand.toughness ?? 0) - (oldAttacker.toughness ?? 0);
          if (hasKeyword(hand, 'flying') && untappedEnemyBlockers(view).every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 8;
          return score;
        }
        const source = cmd.objectId ? objectOnBoard(view, cmd.objectId) : null;
        const def = source ? cardDef(source.cardId) : undefined;
        const ability = def?.abilities?.[cmd.abilityIndex ?? 0];
        const taps = Boolean(ability?.cost?.tap);
        const tapsCreature = Boolean(ability?.cost?.tapCreature);
        const effects = Array.isArray(ability?.effect) ? ability.effect : ability?.effect ? [ability.effect] : [];
        // Patologia B1: aktywacja kosztem tapu we własnym untap zostawiłaby
        // stwora zatapianego całą turę (bot stał w miejscu i deck-outował).
        if (wastefulStep(view)) return taps || tapsCreature ? -30 : -5;
        let score = 2; // drobna wartość za legalne zagranie rozwijające planszę
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        for (const effect of effects) {
          if (effect.type === 'pump') {
            const pGain = effect.power ?? 0;
            const tGain = effect.toughness ?? 0;
            let value = pGain + (tGain > 0 ? 1 : 0);
            // Pump bez jawnych celów działa na samo źródło (np. Warboar).
            const recipient = target ?? source;
            if (recipient && recipient.controllerId === view.playerId) {
              // Combat trick tylko przy OBRONIE (declare_blockers w turze
              // przeciwnika): tam zatapiany bloker wciąż blokuje. W NASZYM
              // combacie pump kosztem tapu przed deklaracją odbiera atak —
              // patologia B1: bot pumpował w beginning_of_combat i stał
              // z zatapianymi stworem, przegrywając deck-outem.
              if (view.turn.step === 'declare_blockers' && !myTurn(view)) value += 2 * pGain;
              // Pump kosztem tapu na stworze gotowym do ataku (main/combat
              // własnej tury) kosztuje utratę tego ataku — zwykle się nie opłaca.
              if (source?.kind === 'creature' && taps && canAttackNow(recipient)) value -= (recipient.power ?? 0) + 3;
            } else {
              value -= 4; // pump na wrogu bez powodu
            }
            score += value;
          }
          if (effect.type === 'tap_permanent' || effect.type === 'lock_untap') {
            // Neutralizacja wrogiego stwora (Lira): im większy cel, tym cenniej.
            if (target && target.controllerId !== view.playerId) score += 8 + 2 * (target.power ?? 0);
          }
          if (effect.type === 'gain_life') score += 2 + (effect.amount ?? 0);
          if (effect.type === 'add_mana') {
            // Dodatkowa mana (Holdout Settlement): cenna tylko, gdy jest co
            // zagrać; tapnięcie własnego stwora kosztuje jego atak.
            const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
            score += hasPlayable ? 4 : 0;
            if (tapsCreature) score -= 3;
          }
        }
        if (cmd.xValue != null) score -= Math.min(cmd.xValue ?? 0, 2) * 0.5; // koszt {X} — drobna kara
        // Equip: załączenie na własnym stworze jest tym lepsze, im większy
        // nosiciel; evasion z grantowanych keywordów (flying) i haste dla
        // świeżych stworów mają realną cenę — bez tego bot nigdy nie wyposaża.
        const sourceEquip = source?.equipment && target && target.controllerId === view.playerId;
        if (sourceEquip) {
          const grants = source.equipment.keywords ?? [];
          score += 10 + 2 * (target.power ?? 0);
          if (grants.includes('flying') && untappedEnemyBlockers(view).every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 8;
          if (grants.includes('haste') && target.summoningSickness) score += 6;
        }
        // Cycling: rotacja ma sens tylko dla kart, których nie da się
        // wkrótce wyrzucić (koszt > landy+1). Tanie cyklowanie karty, którą
        // za turę-dwie można rzucić, dewastuje grę — z taką wolimy poczekać.
        const cycled = handCard(view, cmd.objectId);
        if (cycled) {
          if ((cycled.manaCost ?? 0) <= myLandCount(view) + 1) return -5;
          score += 2;
        }
        return score;
      }
      case 'declare_attackers': {
        const attackers = cmd.attackerIds;
        const blockers = untappedEnemyBlockers(view);
        const strongestBlockerPower = blockers.reduce((max, o) => Math.max(max, o.power ?? 0), 0);
        const strongestBlockerToughness = blockers.reduce((max, o) => Math.max(max, o.toughness ?? 0), 0);
        const enemyLife = enemy(view)?.life ?? 0;
        let score = 0;
        for (const id of attackers) {
          const object = objectOnBoard(view, id);
          if (!object) continue;
          const power = object.power ?? 0;
          const toughness = object.toughness ?? 0;
          // Wartość ataku jednym stworem: obrażenia, które przejdą, minus
          // strata stwora. Wymiana (power ≥ wytrzymałość blockerów) to
          // realny zysk — bez tego bot nigdy nie atakuje w równą planszę
          // i przegrywa długie gry deck-outem.
          let perAttacker;
          if (blockers.length === 0) {
            perAttacker = power + 3; // otwarty — czysta presja
          } else if (toughness > strongestBlockerPower) {
            perAttacker = power + 3; // przeżyje wymianę
          } else if (power >= strongestBlockerToughness) {
            perAttacker = power - 1; // wymiana: obrażenia + usunięcie blockerów
          } else {
            perAttacker = power - 3; // chump do większego — tylko w wyścigu
          }
          score += perAttacker;
          // Evasion: latający atakujący omija blockerów bez flying/reach.
          if (hasKeyword(object, 'flying') && blockers.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 3;
        }
        // Presja: atak w otwartego, lethal i przewaga liczebna premiowane.
        if (blockers.length === 0 && attackers.length > 0) score += 8;
        const totalPower = attackers.reduce((sum, id) => sum + (objectOnBoard(view, id)?.power ?? 0), 0);
        if (totalPower >= enemyLife && attackers.length > 0) score += 100;
        // Zegar (B1): gramy o czas, gdy wróg jest blisko śmierci, może nas
        // zabić w następnej turze albo nasza biblioteka się kończy — wtedy
        // atakujemy nawet kosztem wymiany. (strażnik „> 0" odróżnia realną
        // partię od stanów testowych bez biblioteki)
        const libraryExists = view.zones.library.length > 0;
        const racing = enemyLife <= 10
          || enemyBoardPower(view) >= myLife(view)
          || (libraryExists && myLibraryCount(view) <= 4);
        if (racing && attackers.length > 0) {
          score += totalPower >= enemyLife - 5 ? 20 : 8;
          if (libraryExists && myLibraryCount(view) <= 2) score += 15;
        }
        return score;
      }
      case 'declare_blockers': {
        const assignments = cmd.assignments ?? {};
        const blockingSomething = Object.keys(assignments).length > 0;
        // Zagrożenie (suma siły wrogich stworów) — kara za NIEblokowanie pod
        // presją śmiertelną dotyczy wyłącznie wariantu pustego; warianty
        // blokujące oceniamy bez tej kary.
        const threat = enemyAttackPower(view);
        const lethalThreat = threat >= myLife(view);
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
            // Bloker z flying/reach łapie latającego atakującego.
            if (hasKeyword(attackerObj, 'flying') && (hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach'))) score += 4;
            // Bez presji śmiertelnej nie chumpujemy cennymi atakującymi —
            // ich siła przyda się w naszym ataku.
            if (!lethalThreat && blockerDies && !killsAttacker && canAttackNow(blocker)) score -= 3;
          }
        }
        // Pod presją śmiertelną warto blokować nawet kosztem stwora.
        if (!blockingSomething && lethalThreat) score -= 40;
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
        const allUnwanted = looked.length > 0 && looked.every((card) => (card.kind ?? '') === 'land' && (landsInHand >= 3 || myLandCount(view) >= 6));
        return allUnwanted ? 25 : 20;
      }
      case 'pass_priority': return 0;
      default: return 0;
    }
  }

  /** Czysty, zachłanny wybór (bez side effectów) — używany też jako polityka symulacji B2. */
  function greedyChoice(view) {
    const scored = view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].cmd;
  }

  /**
   * Ewaluacja liścia symulacji (B2): wygrana/przegrana dominuje, dalej życie,
   * siła i liczba stworów na planszy, przewaga kart i biblioteki. Działa na
   * PlayerView — czysta funkcja widoku, zero wiedzy o ukrytych kartach (FoW).
   */
  function evalView(view) {
    if (view.winnerId === view.playerId) return 10000;
    if (view.winnerId) return -10000;
    const me = view.players.find((p) => p.id === view.playerId);
    const foe = view.players.find((p) => p.id !== view.playerId);
    const mine = view.zones.battlefield.filter((o) => o.controllerId === view.playerId);
    const foeBoard = view.zones.battlefield.filter((o) => o.controllerId !== view.playerId);
    const myPower = mine.reduce((sum, o) => sum + (o.power ?? 0), 0);
    const foePower = foeBoard.reduce((sum, o) => sum + (o.power ?? 0), 0);
    const myHand = view.zones.hand.filter((o) => o.controllerId === view.playerId).length;
    const foeHand = view.zones.hand.filter((o) => o.controllerId !== view.playerId).length;
    const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
    const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
    return (me.life - foe.life)
      + 2 * (myPower - foePower)
      + 2 * (mine.length - foeBoard.length)
      + (myHand - foeHand)
      + (myLib - foeLib);
  }

  /**
   * Punktacja z lookahead (B2): top-K kandydatów strategicznych (wg B1) jest
   * dogrywana na klonie stanu przez `simulate` (helper engine). Wynik kandydata
   * = ocena B1 + waga × (ewaluacja liścia − ewaluacja obecna). „Zrobienie nic"
   * jest naturalnym punktem odniesienia (pusty atak / pass w innych typach).
   * Deterministyczne: klon + polityka greedyChoice, zero losowości.
   */
  function scoredWithLookahead(view, simulate) {
    const scored = view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
    scored.sort((a, b) => b.score - a.score);
    const base = evalView(view);
    // W wyścigu (mała biblioteka / bliski lethal wroga) atak jest presją, nie
    // „opcją do ewaluacji" — lookahead pokazał, że ostrożna ewaluacja zbyt
    // często rezygnuje z ataku i przegrywa deck-outem (małe talie benchmarku).
    const racing = view.zones.library.length > 0 && myLibraryCount(view) <= 4
      || (enemy(view)?.life ?? 20) <= 8;
    const candidates = scored
      .filter((s) => LOOKAHEAD_TYPES.includes(s.cmd.type) && !(racing && s.cmd.type === 'declare_attackers'))
      .slice(0, LOOKAHEAD_TOP_K);
    for (const entry of candidates) {
      // Horyzont wg typu decyzji: atak — do rozstrzygnięcia walki; zagrania
      // w main — do końca własnej fazy main (sekwencjonowanie).
      const horizon = entry.cmd.type === 'declare_attackers' ? 'combat' : 'main_phase';
      const sim = simulate(entry.cmd, { policy: greedyChoice, maxCommands: LOOKAHEAD_MAX_COMMANDS, horizon });
      if (sim.rejected) continue;
      const delta = evalView(sim.view) - base;
      if (Math.abs(delta) < LOOKAHEAD_EVAL_THRESHOLD) continue;
      entry.score += LOOKAHEAD_WEIGHT * delta;
    }
    return scored;
  }

  function summarize(cmd) {
    if (cmd.type === 'declare_attackers') return `attack[${cmd.attackerIds.join(',')}]`;
    if (cmd.type === 'declare_blockers') return `block[${Object.entries(cmd.assignments ?? {}).map(([a, b]) => `${a}<${b.join('+')}`).join(' ')}]`;
    if (cmd.type === 'cast_spell' || cmd.type === 'cast_permanent') return `${cmd.type}(${cmd.objectId}${cmd.targets ? '->' + cmd.targets.join('+') : ''})`;
    return cmd.type;
  }

  return Object.freeze({
    chooseCommand(view, helpers) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      const scored = enabled && helpers?.simulate
        ? scoredWithLookahead(view, helpers.simulate)
        : view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
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
