import { createRng } from '../engine/rng.js';
import { createCardRegistry } from '../cards/card-data.js';
import { probAtLeastOne } from '../engine/hypergeom.js';
import { normalizeHeuristicWeights } from './heuristic-weights.js';

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

export function createHeuristicBot({ seed, randomness = 0, lookahead = 0, opponentDeck = null, weights = undefined, registry: registryOverride = undefined }) {
  if (!Number.isInteger(seed)) throw new TypeError('Bot wymaga całkowitego seeda');
  if (typeof randomness !== 'number' || randomness < 0 || randomness > 1) throw new RangeError('randomness ma być w [0, 1]');
  const rng = createRng(seed);
  const registry = registryOverride ?? createCardRegistry();
  const history = [];
  const enabled = lookahead > 0;
  const scoreWeights = normalizeHeuristicWeights(weights);

  // B3 — modelowanie przeciwnika: znana talia przeciwnika (decks/*.txt) +
  // hipergeometria. Klasyfikujemy karty przeciwnika generycznie po efektach
  // (damage = removal, pump = combat trick), zero nazw kart (ADR 0002).
  const opponentCounts = new Map();
  for (const id of (Array.isArray(opponentDeck) ? opponentDeck : [])) {
    opponentCounts.set(id, (opponentCounts.get(id) ?? 0) + 1);
  }
  const removalSpells = new Map(); // cardId → { cost, amount, copies }
  const pumpSpells = new Map();    // cardId → { cost, copies }
  for (const [id, copies] of opponentCounts) {
    const def = registry.get(id);
    // Kind liczy materialize z linii typów — na definicji sprawdzamy types.
    const isSpell = (def?.types ?? []).includes('Instant') || (def?.types ?? []).includes('Sorcery');
    if (!def || !isSpell) continue;
    const spell = def.spell;
    if (!spell || spell.timing !== 'instant') continue; // tylko instant zagra w nasz atak/blok
    const effects = spell.effects ?? [];
    const damage = effects.find((e) => e.type === 'damage');
    if (damage) removalSpells.set(id, { cost: def.manaCost ?? 0, amount: damage.amount ?? 0, copies });
    if (effects.some((e) => e.type === 'pump')) pumpSpells.set(id, { cost: def.manaCost ?? 0, copies });
  }
  const minRemovalCost = removalSpells.size ? Math.min(...[...removalSpells.values()].map((r) => r.cost)) : Number.POSITIVE_INFINITY;
  const minPumpCost = pumpSpells.size ? Math.min(...[...pumpSpells.values()].map((p) => p.cost)) : Number.POSITIVE_INFINITY;

  // B2 — lookahead: ograniczony koszt symulacji i waga poprawy ewaluacji.
  const LOOKAHEAD_TOP_K = 3;
  const LOOKAHEAD_MAX_COMMANDS = 12;
  const LOOKAHEAD_WEIGHT = 3;
  // Lookahead koryguje tylko przy wyraźnej różnicy ewaluacji (|delta| >= próg)
  // — neutralne wymiany (delta ~0) zostawiają decyzję heurystyce B1.
  const LOOKAHEAD_EVAL_THRESHOLD = 2;
  const LOOKAHEAD_TYPES = ['play_land', 'cast_permanent', 'cast_spell', 'cast_cleave', 'activate_ability', 'declare_attackers'];

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

  /**
   * Kara za rzucenie czaru/zagranie permanentu, gdy kontroler ma na bitwisku
   * stwora z triggerem „when you cast a spell" (Illusory Demon — poświęcenie
   * źródła). Wartość stracimy przy każdym czarze — generyczny deskryptor.
   */
  function castSacrificePenalty(view) {
    let penalty = 0;
    for (const object of myCreatures(view)) {
      const def = cardDef(object.cardId);
      const hasTrigger = (def?.abilities ?? []).some((a) => a?.trigger?.event === 'when_you_cast_spell');
      if (hasTrigger) penalty += 4 + 2 * (object.power ?? 0) + (object.toughness ?? 0);
    }
    return penalty;
  }

  function enemyAttackPower(view) {
    // Podczas własnego okna bloków przeciwnik ma już zadeklarowanych atakujących
    // na planszy jako tapped — przybliżamy zagrożenie sumą siły wrogich stworów.
    return enemyCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  }

  /** Otwarta mana przeciwnika: pula + nietapnięte landy (land creatures też). */
  function opponentOpenMana(view) {
    const foe = enemy(view);
    const untapped = view.zones.battlefield.filter((o) => o.controllerId !== view.playerId
      && (o.kind === 'land' || (o.types ?? []).includes('Land')) && !o.tapped).length;
    return (foe?.mana ?? 0) + untapped;
  }

  /**
   * P(przeciwnik trzyma w ręce ≥1 karty z mapy czarów). Model hipergeometryczny
   * (B3): N = nieznane karty przeciwnika (biblioteka + ręka), K = kopie
   * „odpowiedzi" jeszcze niewidziane (tal − kopie w strefach publicznych:
   * bitwisko, grób, exile, stos — adaptacja do obserwowanego zachowania),
   * n = ręka przeciwnika.
   */
  function probOpponentHolds(view, spellMap) {
    if (!spellMap.size) return 0;
    const foeHand = view.zones.hand.filter((o) => o.controllerId !== view.playerId).length;
    const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
    const N = foeLib + foeHand;
    if (N <= 0 || foeHand <= 0) return 0;
    let totalCopies = 0;
    let visible = 0;
    for (const [id, info] of spellMap) {
      totalCopies += info.copies;
      for (const zone of ['battlefield', 'graveyard', 'exile', 'stack']) {
        visible += view.zones[zone]?.filter((o) => o.controllerId !== view.playerId && o.cardId === id).length ?? 0;
      }
    }
    return probAtLeastOne(N, Math.max(0, totalCopies - visible), foeHand);
  }

  const commandFamily = (type) => {
    if (type === 'play_land') return 'land';
    if (type === 'tap_for_mana') return 'mana';
    if (type === 'cast_permanent') return 'permanent';
    if (type === 'cast_spell' || type === 'cast_cleave' || type === 'plot_card' || type === 'draw_card') return 'spell';
    if (type === 'activate_ability' || type === 'resolve_backup' || type === 'resolve_scry' || type === 'resolve_surveil' || type === 'resolve_clash_choice' || type === 'resolve_room_target' || type === 'resolve_sacrifice_choice' || type === 'resolve_food_choice' || type === 'resolve_discover_choice' || type === 'resolve_explore_choice' || type === 'resolve_craft_exile') return 'ability';
    if (type === 'declare_attackers' || type === 'resolve_combat') return 'attack';
    if (type === 'declare_blockers') return 'block';
    return null;
  };

  function weightedScore(commandType, score) {
    if (!Number.isFinite(score)) return score;
    const family = commandFamily(commandType);
    return family ? score * scoreWeights[family] : score;
  }

  function scoreCommand(view, cmd) {
    const finish = (score) => weightedScore(cmd.type, score);
    switch (cmd.type) {
      case 'concede': return finish(NEVER);
      case 'draw_card': return finish(100);
      case 'play_land': return finish(90);
      case 'tap_for_mana': {
        // Własne kroki początkowe/końcowe: mana wyparuje na końcu kroku,
        // a land zostaje zatapiany całą turę — gorzej niż pass.
        if (wastefulStep(view)) return finish(-15);
        // Tap ma sens tylko przy czymś do zagrania w ręce; inaczej zostaw priorytet.
        const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
        return finish(hasPlayable ? 80 : 1);
      }
      case 'plot_card': {
        const card = handCard(view, cmd.objectId);
        if (!card?.plot) return finish(-20);
        // Plot to odroczenie czaru: wartość bazowa jest niższa niż natychmiastowe
        // zagranie, ale dodatnia, gdy karta ma efekt tokenowy/board-building.
        let score = 55;
        for (const effect of card.spell?.effects ?? []) {
          if (effect.type === 'create_token') score += 12;
          if (effect.type === 'mill_cards') score += 2;
        }
        return finish(score);
      }
      case 'cast_permanent': {
        const card = handCard(view, cmd.objectId);
        if (cmd.bestow || cmd.targets?.length) {
          // Czar aury (bestow albo czysta aura): +N/+N i keywordy na stworze.
          // Opłaca się tym bardziej, im większy gospodarz; stwór PRZECIWNIKA
          // wzmacniany własnym zaczarowaniem jest błędem — wariant odrzucany.
          const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
          if (!target || target.controllerId !== view.playerId) return finish(-50);
          const descriptor = cmd.bestow ? card?.bestow : card?.aura;
          const pump = descriptor?.pump ?? { power: 0, toughness: 0 };
          return finish(66 + 2 * ((target.power ?? 0) + pump.power) + ((target.toughness ?? 0) + pump.toughness));
        }
        const def = card ? cardDef(card.cardId) : undefined;
        let score = 70 + (card?.power ?? 0) * 2 + (card?.toughness ?? 0);
        // Stwór, który wraca po śmierci (persist) albo reanimuje z grobu
        // przeciwnika, jest wart więcej niż same statystyki — deskryptory
        // generyczne (keyword/trigger), zero nazw kart.
        if (hasKeyword(def, 'persist')) score += 5;
        const reanimates = (def?.abilities ?? []).some((a) => a?.trigger?.event === 'enter_battlefield'
          && (Array.isArray(a.effect) ? a.effect : [a.effect]).some((e) => e?.type === 'reanimate_under_your_control'));
        if (reanimates) {
          const bestInFoeGraveyard = view.zones.graveyard
            .map((o) => o)
            .filter((o) => o.controllerId !== view.playerId && o.kind === 'creature')
            .reduce((max, o) => Math.max(max, (o.power ?? 0)), 0);
          score += 2 * bestInFoeGraveyard;
        }
        // Evasion (flying) realnie zwiększa szanse zadania obrażeń.
        if (hasKeyword(def, 'flying')) score += 3;
        // Rozwój do parytetu liczby stworów — obrona przed aggro.
        if (myCreatures(view).length < enemyCreatures(view).length) score += 4;
        // Zagranie kolejnego permanentu poświęci własnego demona (Illusory
        // Demon: „when you cast a spell" obejmuje też stwory) — kara.
        score -= castSacrificePenalty(view);
        // Phyrexian mana (CR 118.9): każdy symbol opłacony życiem kosztuje
        // 2 życia — bot woli manę (wariant k=0 jest najtańszy), a warianty
        // życiowe w ogóle nie są oferowane, gdy życie ich nie wytrzymuje.
        if (cmd.phyrexianPayWithLife != null && cmd.phyrexianPayWithLife > 0) {
          score -= 2 * cmd.phyrexianPayWithLife;
        }
        return finish(score);
      }
      case 'cast_spell':
      case 'cast_cleave': {
        const card = handCard(view, cmd.objectId);
        const spell = card?.spell;
        if (!spell) return finish(60);
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        const effects = (cmd.type === 'cast_cleave' && spell.cleave ? spell.cleave.effects : spell.effects) ?? [];
        let score = 50;
        score -= castSacrificePenalty(view);
        for (const effect of effects) {
          if (effect.type === 'return_to_hand' && target && target.controllerId !== view.playerId) {
            score += 25 + (target.power ?? 0) * 2;
          }
          if (effect.type === 'damage' && target && target.controllerId !== view.playerId) {
            const lethal = (effect.amount ?? 0) >= (target.toughness ?? 0) - (target.damage ?? 0);
            score += 10 + 3 * (target.power ?? 0) + (lethal ? 15 : 0);
          } else if (effect.type === 'damage') {
            score -= 60; // lanie we własne stwory bez powodu jest marnotrawstwem
          }
          if (effect.type === 'create_token') {
            // Tokeny to realny przyrost planszy (Gather the Townsfolk).
            // Warunek „fateful hour" (ifLifeAtMost) podnosi liczbę tokenów,
            // gdy naprawdę zachodzi — deskryptor generyczny, zero nazw kart.
            let count = Number.isInteger(effect.amount) ? effect.amount : 1;
            if (effect.ifLifeAtMost != null && myLife(view) <= effect.ifLifeAtMost) {
              count = effect.amountIfCondition ?? count;
            }
            const greatestPower = myCreatures(view).reduce((max, object) => Math.max(max, object.power ?? 0), 0);
            const tokenPower = effect.power === 'greatest_power_you_control' ? greatestPower : (effect.power ?? 1);
            const tokenToughness = effect.toughness === 'greatest_power_you_control' ? greatestPower : (effect.toughness ?? 1);
            score += 10 * count * (2 * tokenPower + tokenToughness) / 3;
          }
          // Dobranie kart z czaru to przewaga kartowa.
          if (effect.type === 'draw_cards' || effect.type === 'draw_cards_both_players') score += 6 * (effect.amount ?? 1);
          if (effect.type === 'pump' && target && target.controllerId === view.playerId) {
            const trick = view.turn.phase === 'combat' ? 18 : 2;
            score += trick + (target.power ?? 0);
          } else if (effect.type === 'pump') {
            score -= 60; // wzmacnianie przeciwnika bez powodu jest błędem
          }
        }
        return finish(score);
      }
      case 'activate_ability': {
        // Ninjutsu (z ręki, zwraca nieblokowanego atakującego): wartość =
        // ile lepszy nowy stwór od zastępowanego, plus evasion.
        if (cmd.attackerId != null) {
          const hand = handCard(view, cmd.objectId);
          const oldAttacker = objectOnBoard(view, cmd.attackerId);
          if (!hand || !oldAttacker) return finish(0);
          let score = 25;
          score += ((hand.power ?? 0) - (oldAttacker.power ?? 0)) * 2;
          score += (hand.toughness ?? 0) - (oldAttacker.toughness ?? 0);
          if (hasKeyword(hand, 'flying') && untappedEnemyBlockers(view).every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 8;
          return finish(score);
        }
        const source = cmd.objectId ? objectOnBoard(view, cmd.objectId) : null;
        const abilityObject = source ?? handCard(view, cmd.objectId);
        const def = abilityObject ? cardDef(abilityObject.cardId) : undefined;
        const ability = def?.abilities?.[cmd.abilityIndex ?? 0];
        const taps = Boolean(ability?.cost?.tap);
        const tapsCreature = Boolean(ability?.cost?.tapCreature);
        const effects = Array.isArray(ability?.effect) ? ability.effect : ability?.effect ? [ability.effect] : [];
        // Patologia B1: aktywacja kosztem tapu we własnym untap zostawiłaby
        // stwora zatapianego całą turę (bot stał w miejscu i deck-outował).
        if (wastefulStep(view)) return finish(taps || tapsCreature ? -30 : -5);
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
            // Dodatkowa mana (Holdout Settlement, Apprentice Wizard, Treasure):
            // cenna tylko, gdy jest co zagrać. Liczy się BILANS: produkcja
            // minus koszt many zdolności (Wizard: 3 − 1 = +2).
            const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
            const net = (effect.amount ?? 0) - (ability?.cost?.mana ?? 0);
            score += hasPlayable ? 4 * Math.max(0, net) : 0;
            if (tapsCreature) score -= 3;
            // Poświęcenie źródła jako koszt (Treasure) jest jednorazowe —
            // trzymamy token, dopóki mana nie jest realnie potrzebna.
            if (ability?.cost?.sacrificeSelf && !hasPlayable) score -= 6;
          }
          if (effect.type === 'create_token') {
            // Zdolność produkująca token (np. Dragonbroods' Relic) jest
            // oceniana tym samym generycznym deskryptorem co czar-token.
            const amount = Number.isInteger(effect.amount) ? effect.amount : 1;
            const tokenPower = effect.power === 'source_power' ? (source?.power ?? 0) : (effect.power ?? 1);
            const tokenToughness = effect.toughness === 'source_power' ? (source?.power ?? 0) : (effect.toughness ?? 1);
            score += 10 * amount * (2 * tokenPower + tokenToughness) / 3;
            if (ability?.cost?.sacrificeSelf) score -= source?.kind === 'creature' ? 4 : 1;
          }
          if (effect.type === 'become_basic_land_type') {
            // Zmiana typu podstawowego landa nie zmienia produkcji many w tym
            // engine (pula bezbarwna) — wartość marginalna, a koszt to tap.
            score -= 2;
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
          // Zwykły cycling landa (np. Secluded Steppe) jest generyczną
          // zamianą niepotrzebnego land dropu na kartę — nie stosujemy do niego
          // kary „tanią kartę da się rzucić", bo land nie jest czarem.
          if (ability?.cycling?.drawCards != null) {
            score += cycled.kind === 'land' ? 8 : 2;
          } else {
            if ((cycled.manaCost ?? 0) <= myLandCount(view) + 1) return finish(-5);
            score += 2;
          }
        }
        return finish(score);
      }
      case 'declare_attackers': {
        const attackers = cmd.attackerIds;
        const blockers = untappedEnemyBlockers(view);
        // Trigger „attacks" z drenażem (Delta Bloodflies): bezwarunkowe
        // obrażenia poza walką, o ile spełniony jest warunek deskryptora.
        const drainOnAttack = (id) => {
          const object = objectOnBoard(view, id);
          const def = cardDef(object?.cardId);
          let drain = 0;
          for (const ability of def?.abilities ?? []) {
            if (ability?.trigger?.event !== 'attacks') continue;
            const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
            const lose = effects.find((e) => e?.type === 'lose_life');
            if (!lose) continue;
            if (ability.trigger.condition?.controlsCreatureWithCounter) {
              const hasCounter = myCreatures(view).some((o) => Object.values(o.counters ?? {}).some((c) => c > 0));
              if (!hasCounter) continue;
            }
            drain += lose.amount ?? 0;
          }
          return drain;
        };
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
          // Drenaż z triggera ataku przechodzi niezależnie od bloków.
          score += 3 * drainOnAttack(id);
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
        // B3 — EV ataku: gdy przeciwnik może mieć removal (instant z damage)
        // i ma otwartą manę, atak wartościowym stworem traci na wartości —
        // kara proporcjonalna do prawdopodobieństwa i wartości stwora.
        // W wyścigu presja jest ważniejsza od ryzyka (lekcja B2: zbyt
        // ostrożny bot przegrywa deck-outem).
        if (!racing && removalSpells.size && opponentOpenMana(view) >= minRemovalCost) {
          const removalProb = probOpponentHolds(view, removalSpells);
          // Selektywność: kara tylko przy realnym zagrożeniu (>45%) — drobne
          // prawdopodobieństwo nie powinno gasić presji (lekcja B2).
          if (removalProb > 0.45) {
            for (const id of attackers) {
              const object = objectOnBoard(view, id);
              if (!object) continue;
              const killable = [...removalSpells.values()].some((r) => r.amount >= (object.toughness ?? 0) - (object.damage ?? 0));
              // Kara ~ wartość stwora × prawdopodobieństwo: atak 2/2 przy 70%
              // ryzyka removalu to strata (0 obrażeń i stwór w grobie).
              if (killable) score -= removalProb * (14 + 2 * (object.power ?? 0) + (object.toughness ?? 0));
            }
          }
        }
        return finish(score);
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
            // B3 — combat trick: gdy nasz blok ZABIJA atakującego, a przeciwnik
            // może mieć pump-instant i otwartą manę, blok jest ryzykowny (pump
            // ratuje atakującego i zabija nasz bloker). Pod presją śmiertelną
            // blokujemy mimo ryzyka.
            if (killsAttacker && !lethalThreat && pumpSpells.size && opponentOpenMana(view) >= minPumpCost) {
              const pumpProb = probOpponentHolds(view, pumpSpells);
              // Kara ~ 2× premia za zabicie atakującego: przy wysokim ryzyku
              // pumpa blok jest stratą (pump ratuje atakującego i zabija
              // nasz bloker), więc wchodzimy tylko, gdy to się opłaca.
              if (pumpProb > 0) score -= pumpProb * 12;
            }
            // Bloker z flying/reach łapie latającego atakującego.
            if (hasKeyword(attackerObj, 'flying') && (hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach'))) score += 4;
            // Bez presji śmiertelnej nie chumpujemy cennymi atakującymi —
            // ich siła przyda się w naszym ataku.
            if (!lethalThreat && blockerDies && !killsAttacker && canAttackNow(blocker)) score -= 3;
          }
        }
        // Pod presją śmiertelną warto blokować nawet kosztem stwora.
        if (!blockingSomething && lethalThreat) score -= 40;
        return finish(score);
      }
      case 'resolve_combat': return finish(50);
      case 'resolve_backup': {
        // Backup: liczniki + grant keywordów idą na najsilniejszego WŁASnego
        // stwora (wzmocnienie przeciwnika tylko, gdy brak własnych — wybór
        // wymuszony, bierzemy najsłabszy cel obcy). Samo źródło też jest
        // legalne (wtedy bez grantu) — traktowane jak każdy własny stwór.
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        if (target.controllerId === view.playerId) return finish(40 + 2 * (target.power ?? 0) + (target.toughness ?? 0));
        return finish(5 - (target.power ?? 0));
      }
      case 'resolve_scry': {
        // Scry: na spód kładziemy wyłącznie to, co raczej zbędne — land przy
        // przesycie landów (≥3 w ręce albo ≥6 na stole). W przeciwnym razie
        // zostawiamy na wierzchu. Generyczne deskryptory (kind), zero nazw kart.
        const bottoms = cmd.bottomIds ?? [];
        if (bottoms.length === 0) return finish(20); // wariant „zostaw na wierzchu"
        const looked = (view.pendingScry?.cards ?? []).filter((card) => bottoms.includes(card.id));
        const landsInHand = view.zones.hand.filter((o) => o.kind === 'land').length;
        const allUnwanted = looked.length > 0 && looked.every((card) => (card.kind ?? '') === 'land' && (landsInHand >= 3 || myLandCount(view) >= 6));
        return finish(allUnwanted ? 25 : 20);
      }
      case 'resolve_surveil': {
        // Surveil (Curate): jak scry — mielimy tylko zbędne lądy przy
        // przesycie, resztę zostawiamy na wierzchu do dobrania. Kolejność
        // reszty („in any order") bot trzyma pierwotną — zero powodów do
        // przetasowania, więc wariant z topOrder != oryginał punktujemy niżej.
        const milled = cmd.millIds ?? [];
        const looked = (view.pendingSurveil?.cards ?? []).filter((card) => milled.includes(card.id));
        const landsInHand = view.zones.hand.filter((o) => o.kind === 'land').length;
        const allUnwanted = looked.length > 0 && looked.every((card) => (card.kind ?? '') === 'land' && (landsInHand >= 3 || myLandCount(view) >= 6));
        const originalOrder = (view.pendingSurveil?.cards ?? [])
          .filter((card) => !milled.includes(card.id))
          .map((card) => card.id);
        const keepsOrder = JSON.stringify(cmd.topOrder ?? originalOrder) === JSON.stringify(originalOrder);
        return finish((allUnwanted ? 25 : 20) + (keepsOrder ? 1 : 0));
      }
      case 'resolve_clash_choice': {
        // Clash (CR 701.40): odsłoniętą kartę kładziemy na spód tylko, gdy
        // to zbędny land przy przesycie — jak scry; wierzch lekko preferowany.
        const cardId = view.pendingClash?.cards?.[view.playerId] ?? null;
        const def = cardId ? cardDef(cardId) : undefined;
        const isLand = (def?.types ?? []).includes('Land');
        const landsInHand = view.zones.hand.filter((o) => o.kind === 'land').length;
        const unwantedBottom = isLand && (landsInHand >= 3 || myLandCount(view) >= 6);
        if (cmd.putOnBottom) return finish(unwantedBottom ? 25 : 19);
        return finish(22);
      }
      case 'resolve_room_target': {
        // Wybór celu pokoju lochu (M24): Trap! → przeciwnik; Throne →
        // najsilniejszy odsłonięty stwór; Forge/Arena → własny najsilniejszy
        // (goad własnego = gwarantowany atak; goad wroga w 1v1 zmusza go do
        // ataku na nas — szkodliwy).
        const pending = view.pendingRoomTarget;
        if (!pending) return finish(20);
        if (pending.kind === 'player') {
          return finish(cmd.targetId === view.playerId ? -40 : 30);
        }
        if (pending.kind === 'revealed_creature') {
          const card = (pending.cards ?? []).find((c) => c.id === cmd.targetId);
          if (!card) return finish(0);
          return finish(10 + (card.power ?? 0) * 2 + (card.toughness ?? 0));
        }
        const target = objectOnBoard(view, cmd.targetId);
        if (!target) return finish(0);
        const isOwn = target.controllerId === view.playerId;
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0);
        return finish(isOwn ? 30 + value : 0);
      }
      case 'resolve_sacrifice_choice': {
        // Grave Exchange: cel poświęca stwora WŁASNEGO wyboru. Minimalizujemy
        // stratę — najsłabszy własny stwór (najniższa wartość) punktujemy
        // najwyżej; gwarantowana odpowiedź, by partia nie stanęła.
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0);
        return finish(40 - value);
      }
      case 'resolve_food_choice': {
        // Insatiable Appetite: poświęć Food (+5/+5) albo nie (+3/+3).
        // Bot poświęca Food, jeśli ma (większy buff).
        return finish(cmd.sacrifice ? 50 : 30);
      }
      case 'resolve_discover_choice': {
        // Geological Appraiser: rzuć bez kosztu albo weź do ręki.
        // Bot rzuca bez kosztu (darmowa karta na stole).
        return finish(cmd.castFree ? 60 : 20);
      }
      case 'resolve_explore_choice': {
        // Guidestone Compass: karta na wierzch albo do grobu.
        // Bot odkłada na wierzch (zachowuje kartę).
        return finish(cmd.putInGraveyard ? 10 : 40);
      }
      case 'resolve_craft_exile': {
        // Lodestone Needle: exile artifact do craft. Bot wybiera
        // najsłabszy artefakt (minimalizuje stratę).
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0) + (target.manaCost ?? 0);
        return finish(40 - value);
      }
      case 'pass_priority': return finish(0);
      default: return finish(0);
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
    if (cmd.type === 'cast_spell' || cmd.type === 'cast_cleave' || cmd.type === 'cast_permanent') return `${cmd.type}(${cmd.objectId}${cmd.targets ? '->' + cmd.targets.join('+') : ''})`;
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
