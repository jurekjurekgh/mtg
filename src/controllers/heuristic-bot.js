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
  const LOOKAHEAD_EVAL_THRESHOLD = 1;
  const LOOKAHEAD_TYPES = ['play_land', 'cast_permanent', 'cast_spell', 'cast_cleave', 'activate_ability', 'declare_attackers'];

  const byType = (view, type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const objectOnBoard = (view, objectId) => view.zones.battlefield.find((o) => o.id === objectId);
  const handCard = (view, objectId) => view.zones.hand.find((o) => o.id === objectId);
  // Karta w DOWOLNEJ strefie widoku (M103/D: Escape/Flashback grają z grobu —
  // handCard nie widział karty i czar spadał do wyceny 60 „na ślepo").
  // Indeks per widok (WeakMap): wycena iteruje setki wariantów jednego okna,
  // więc skan stref per id byłby kwadratowy.
  const zoneIndexByView = new WeakMap();
  const zoneCard = (view, objectId) => {
    let index = zoneIndexByView.get(view);
    if (!index) {
      index = new Map();
      for (const zone of ['hand', 'battlefield', 'graveyard', 'stack', 'exile', 'library']) {
        for (const o of view.zones?.[zone] ?? []) index.set(o.id, o);
      }
      zoneIndexByView.set(view, index);
    }
    return index.get(objectId) ?? null;
  };
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
  // M91 (A2): moc stworów przeciwnika, które JUŻ atakują — miara realnego
  // zagrożenia w tej turze (fog ratuje życie tylko wtedy, gdy coś nadlatuje).
  // M92 (audyt PlayerView): publiczne efekty prewencji/regeneracji z widoku.
  // Reguły generyczne (ADR 0002) — filtr typów jak w engine (permanents.js
  // isDamagePrevented), bez rozpoznawania kart po nazwie.
  const damageFullyPrevented = (view, object) => {
    if (!object) return false;
    for (const filter of view.preventDamageThisTurn ?? []) {
      const typesOk = (filter.typesInclude ?? []).every((type) => (object.types ?? []).includes(type));
      const kindOk = !filter.isCreature || object.kind === 'creature' || (object.types ?? []).includes('Creature');
      if (typesOk && kindOk) return true;
    }
    return false;
  };
  // Suma tarcz „prevent the next N damage" dla celu (Withstand).
  const shieldedAmount = (view, targetId) => (view.damageShields ?? [])
    .filter((shield) => shield.targetId === targetId)
    .reduce((sum, shield) => sum + (shield.remaining ?? 0), 0);
  // Cel przeżyje „destroy", bo ma tarczę regeneracji, której nic nie blokuje.
  const willRegenerate = (view, targetId) => (view.regenerationShields ?? []).includes(targetId)
    && !(view.cantBeRegeneratedThisTurn ?? []).includes(targetId);
  const attackingEnemyPower = (view) => enemyCreatures(view)
    .filter((o) => o.attacking)
    .reduce((sum, o) => sum + (o.power ?? 0), 0);
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
    if (type === 'cast_permanent' || type === 'cast_adventure_creature') return 'permanent';
    if (type === 'cast_spell' || type === 'cast_cleave' || type === 'cast_adventure' || type === 'plot_card' || type === 'draw_card') return 'spell';
    if (type === 'activate_ability' || type === 'resolve_backup' || type === 'resolve_scry' || type === 'resolve_surveil' || type === 'resolve_clash_choice' || type === 'resolve_room_target' || type === 'resolve_sacrifice_choice' || type === 'resolve_food_choice' || type === 'resolve_discover_choice' || type === 'resolve_explore_choice' || type === 'resolve_craft_exile' || type === 'resolve_hand_creature' || type === 'resolve_devour_choice' || type === 'resolve_endure_choice' || type === 'resolve_delirium_target' || type === 'resolve_mentor_target' || type === 'resolve_graveyard_top_choice' || type === 'resolve_legend_choice' || type === 'resolve_reveal_order' || type === 'resolve_proliferate' || type === 'resolve_damage_target' || type === 'resolve_modal_choice' || type === 'resolve_redirect_choice' || type === 'resolve_discard_choice' || type === 'resolve_hand_top_choice' || type === 'resolve_land_type_choice' || type === 'resolve_search_choice' || type === 'resolve_fertile_thicket' || type === 'resolve_springbloom' || type === 'resolve_pay_or_sacrifice' || type === 'resolve_optional_pay_choice' || type === 'resolve_trigger_target' || type === 'resolve_optional_trigger_choice' || type === 'resolve_moonlit_choice' || type === 'resolve_mulligan_choice' || type === 'resolve_mulligan_bottom_choice' || type === 'resolve_damage_assignment' || type === 'resolve_optional_draw' || type === 'resolve_exploit_choice' || type === 'resolve_reveal_exile_hand' || type === 'resolve_reveal_exile_grave' || type === 'resolve_look_top_choice' || type === 'resolve_epic_choice' || type === 'resolve_enter_as_copy' || type === 'resolve_destroy_equipment_choice') return 'ability';
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
        // M103/A (zgłoszenie właściciela): obowiązkowy ETB trigger „obrażenia
        // celowemu stworowi + obrażenia kontrolerowi" (Forge Devil) przy
        // PUSTYM stole ma jedyny legalny cel — samego wchodzącego stwora:
        // stwór ginie, kontroler traci życie, karta i mana zmarnowane.
        // Generycznie (ADR 0002): trigger wejścia z requiresTarget creature
        // i efektami damage + damage_to_controller.
        const etbPingAndSelfPain = (def?.abilities ?? []).some((a) => {
          if (a?.type !== 'triggered' || a.trigger?.event !== 'enter_battlefield') return false;
          if (a.trigger?.requiresTarget?.type !== 'creature') return false;
          const effs = Array.isArray(a.effect) ? a.effect : [a.effect];
          return effs.some((e) => e?.type === 'damage') && effs.some((e) => e?.type === 'damage_to_controller');
        });
        const anyCreatureOnBoard = [...myCreatures(view), ...enemyCreatures(view)].length > 0;
        if (etbPingAndSelfPain && !anyCreatureOnBoard) score -= 80;
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
      case 'cast_cleave':
      case 'cast_escape':
      case 'cast_flashback': {
        // M103/D: Escape/Flashback grają kartę z GROBU — handCard jej nie
        // widzi, a bez deskryptora czar dostawał 60 pkt „na ślepo" (bot
        // mielił samego siebie i wyganiał własne karty za darmo w wycenie).
        const card = handCard(view, cmd.objectId) ?? zoneCard(view, cmd.objectId);
        // Strefy „jawne" widoku (grób, wygnanie) potrafią nieść tylko id+cardId
        // — deskryptor czaru bierzemy wtedy wprost z rejestru (ADR 0002).
        const spell = card?.spell ?? (card?.cardId ? cardDef(card.cardId)?.spell : undefined);
        if (!spell) return finish(60);
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        const effects = (cmd.type === 'cast_cleave' && spell.cleave ? spell.cleave.effects : spell.effects) ?? [];
        let score = 50;
        score -= castSacrificePenalty(view);
        // M103/D: koszt Escape — wygnanie własnych kart z grobu to realna
        // strata (stworami więcej niż landami/innymi). Bez tego bot uciekał
        // wariantem niszczącym własny cmentarz, bo wszystkie warianty miały
        // ten sam wynik wyceny.
        if (cmd.type === 'cast_escape') {
          for (const exId of cmd.escapeExileIds ?? []) {
            const exiled = zoneCard(view, exId) ?? view.zones.graveyard.find((o) => o.id === exId);
            if (!exiled) continue;
            // Widok grobu redaguje pola — cechy wygnanej karty bierzemy
            // z rejestru po cardId (jak wyżej przy deskryptorze czaru).
            const def = exiled.cardId ? cardDef(exiled.cardId) : undefined;
            const isCreature = (def?.types ?? []).includes('Creature')
              || (def?.power != null && def?.toughness != null);
            if (isCreature) score -= 10 + 2 * (def.power ?? 0) + (def.toughness ?? 0);
            else score -= 6;
          }
        }
        if (spell.fireball) {
          const ids = cmd.targets ?? [];
          const foeId = enemy(view)?.id;
          const hitsSelf = ids.includes(view.playerId);
          const hitsFoe = foeId != null && ids.includes(foeId);
          if (hitsSelf && !hitsFoe) return finish(-80);
          if (hitsSelf) score -= 50;
          if (hitsFoe) score += 25 + (cmd.xValue ?? 0);
        }
        for (const effect of effects) {
          // M91 (uwaga C właściciela): efekty USUWAJĄCE permanent (destroy,
          // exile, bounce) nie miały ŻADNEJ wyceny — czar dostawał domyślne
          // 50 pkt niezależnie od tego, czyj jest cel, więc bot niszczył
          // Shatterem własny Great Furnace. Reguła generyczna (ADR 0002):
          // usunięcie WŁASNEGO permanentu to strata, usunięcie permanentu
          // PRZECIWNIKA — zysk skalowany jego wartością.
          const REMOVAL_EFFECTS = new Set([
            'destroy_permanent', 'exile_permanent', 'exile_target_creature',
            'bounce_permanent', 'bounce_to_library_top',
          ]);
          if (REMOVAL_EFFECTS.has(effect.type) && target) {
            // M92: „destroy" w cel z aktywną tarczą regeneracji tylko ją
            // zużyje — permanent zostaje na stole, a my tracimy kartę.
            if (effect.type === 'destroy_permanent' && willRegenerate(view, target.id)) {
              // Zagranie jałowe: tarcza regeneracji zostanie zużyta, permanent
              // zostaje na stole, a my tracimy kartę. Nie tylko karzemy, ale
              // POMIJAMY premię za „usunięcie permanentu wroga" — inaczej
              // premia przebijała karę i bot i tak rzucał czar.
              score -= 70;
              continue;
            }
            if (target.controllerId === view.playerId) {
              // Niszczenie własnego permanentu bez powodu to czysta strata
              // (karta + zasób ze stołu); kara musi przebić bazowe 50 pkt,
              // żeby „bo nie ma innego celu" nie wygrywało z passem.
              score -= 90;
            } else {
              const worth = (target.power ?? 0) + (target.toughness ?? 0);
              score += 22 + 2 * worth;
            }
          }
          // M91 (uwaga A2): globalna prewencja obrażeń bojowych („fog" —
          // Inspire Awe) działa na obrażenia OBU stron. We własnej turze
          // kasuje więc własny atak; wartość ma wyłącznie w turze przeciwnika,
          // kiedy to on atakuje. Zgłoszenie właściciela: bot rzucił Inspire
          // Awe w swojej turze, po czym zaatakował w tę prewencję.
          if (effect.type === 'prevent_combat_damage_except_enchanted') {
            const myTurn = view.turn.activePlayerId === view.playerId;
            if (myTurn) score -= 80;
            else score += attackingEnemyPower(view) > 0 ? 15 : -20;
          }
          if (effect.type === 'return_to_hand' && target && target.controllerId !== view.playerId) {
            score += 25 + (target.power ?? 0) * 2;
          }
          if (effect.type === 'damage' && target && target.controllerId !== view.playerId) {
            // M92 (audyt PlayerView): obrażenia w cel objęty pełną prewencją
            // (Ethersworn Shieldmage) albo pochłonięte w całości przez tarczę
            // (Withstand) to zmarnowana karta — 0 zadanych obrażeń.
            const amount = Number.isInteger(effect.amount) ? effect.amount : 0;
            const absorbed = shieldedAmount(view, target.id);
            if (damageFullyPrevented(view, target) || (amount > 0 && absorbed >= amount)) {
              score -= 70;
              continue;
            }
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
          // Mill (Sweet Oblivion / Cellar Door): cel to gracz. Mielenie
          // własnej biblioteki to deck-out — kara; mielenie przeciwnika to zysk.
          if (effect.type === 'mill_cards' || effect.type === 'mill_from_bottom') {
            const playerTargets = (cmd.targets ?? []).filter((id) => typeof id === 'string' && (id === view.playerId || id === enemy(view)?.id));
            const millsSelf = playerTargets.includes(view.playerId);
            const millsFoe = enemy(view)?.id != null && playerTargets.includes(enemy(view).id);
            if (millsSelf && !millsFoe) score -= 80;
            else if (millsSelf) score -= 50;
            else if (millsFoe) score += 20 + 3 * (effect.amount ?? 1);
          }
          // Dobranie kart z czaru to przewaga kartowa.
          if (effect.type === 'draw_cards' || effect.type === 'draw_cards_both_players') score += 6 * (effect.amount ?? 1);
          // M103/B (zgłoszenie właściciela): „cel nie może być blokowany"
          // (Enter the Enigma) — ewazja ma wartość WYŁĄCZNIE na własnym
          // atakującym; dana stworowi PRZECIWNIKA to realna strata (wróg
          // przechodzi przez nasze bloki). Dotąd efekt nie miał wyceny
          // i czar wyglądał na dobry niezależnie od celu.
          if (effect.type === 'cant_be_blocked') {
            if (target && target.controllerId !== view.playerId) score -= 60;
            else score += 10;
          }
          // Uwaga B (2026-08-12): pumpy (pump, pump_by_creature_count — Might of
          // the Masses, pump_enchanted_creature) wzmacniają stwora-CELU. Wzmacnianie
          // stwora PRZECIWNIKA to marnotrawstwo — kara, nie dotyczy własnych.
          const isPumpEffect = effect.type === 'pump'
            || effect.type === 'pump_by_creature_count'
            || effect.type === 'pump_enchanted_creature';
          if (isPumpEffect && target && target.controllerId === view.playerId) {
            const trick = view.turn.phase === 'combat' ? 18 : 2;
            score += trick + (target.power ?? 0);
          } else if (isPumpEffect) {
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
          // M96 (audyt Żywym Testerem): `pump_enchanted_creature`
          // (firebreathing — Shiv's Embrace) NIE wpadało do tej gałęzi, więc
          // zdolność dostawała gołe `score = 2` i bot pompował ją 10× w Głównej
          // 1, zanim zadeklarował atak. Efekt „until end of turn" wygasa
          // w cleanup, więc mana wydana przed combatem przepada.
          if (effect.type === 'pump' || effect.type === 'pump_enchanted_creature') {
            const pGain = effect.power ?? 0;
            const tGain = effect.toughness ?? 0;
            let value = pGain + (tGain > 0 ? 1 : 0);
            // Pump bez jawnych celów działa na samo źródło (np. Warboar);
            // aura firebreathing pompuje zaczarowanego stwora.
            const enchantedId = effect.type === 'pump_enchanted_creature' ? source?.attachedTo : null;
            const recipient = target ?? (enchantedId ? objectOnBoard(view, enchantedId) : null) ?? source;
            // Pump „do końca tury" ma sens dopiero, gdy obrażenia są przesądzone:
            // w combacie (po deklaracjach) albo w obronie. W main/upkeep to
            // wyrzucanie many — gracz i tak zdąży zareagować.
            const combatStep = ['declare_attackers', 'declare_blockers', 'combat_damage'].includes(view.turn.step);
            if (!combatStep) value -= 6;
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
          // M96 (audyt Żywym Testerem): zdolności celujące w GRACZA nie były
          // w ogóle wyceniane — każdy cel dostawał to samo `score = 2`, więc
          // bot 7× z rzędu zmielił WŁASNĄ bibliotekę Cellar Door („Target
          // player mills 1", token Zombie i tak dostaje kontroler). Ta sama
          // logika co w scoringu `cast_spell` (mill/damage per cel) — tu
          // brakowało jej dla ścieżki zdolności aktywowanych.
          const playerTarget = (cmd.targets ?? []).find((id) => id === view.playerId || id === enemy(view)?.id);
          if (playerTarget) {
            const hitsSelf = playerTarget === view.playerId;
            if (effect.type === 'mill_cards' || effect.type === 'mill_from_bottom') {
              // Mielenie siebie przybliża własny deck-out; mielenie wroga to zysk.
              score += hitsSelf ? -25 : 6 + 2 * (effect.amount ?? 1);
            }
            if (effect.type === 'damage' || effect.type === 'lose_life') {
              const amount = effect.amount ?? 0;
              score += hitsSelf ? -30 - 2 * amount : 10 + 3 * amount;
            }
          }
          if (effect.type === 'station_counters') {
            // Station (Wedgelight Rammer / Warmaker Gunship): cenne tylko do
            // osiągnięcia progu charge, po którym artefakt staje się stworem.
            // Dalej aktywacja jest bezwartościowa — bot pompował charge w kółko.
            const charge = (source?.counters?.charge ?? 0);
            const threshold = source?.station?.threshold ?? 9;
            if (charge >= threshold) {
              score -= 15;
            } else {
              score += 4 + Math.max(0, threshold - charge);
            }
            if (tapsCreature) score -= 3;
          }
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
          // Patologia M83 (żywy tester): re-equip do stwora, który JUŻ nosi ten
          // sprzęt, to bezczynny no-op — bot zapętlał się wyposażając ten sam
          // stwór w kółko (stos pęczniał, gra utykała). Equip do nowego nosiciela
          // premiujemy; do obecnego nosiciela — kara.
          if (target.attachedTo === cmd.objectId || source.attachedTo === target.id) {
            score -= 40;
          } else {
            // M100/E13 (zgłoszenie A właściciela, żywy log): straż M83 łapała
            // tylko no-op na TEN SAM obiekt — bot przestawiał sprzęt między
            // RÓWNYMI nosicielami (flat bonus ponosił pass), co wyglądało jak
            // „wyposaża Apprentice Wizard" po dwa razy z rzędu. Przepięcie
            // między SWOIMI nosicielami ma sens dopiero przy wyraźnym zysku
            // (≥2 siły różnicy); inaczej to wyrzucenie many.
            const wearer = source.attachedTo ? objectOnBoard(view, source.attachedTo) : null;
            const wornByMine = Boolean(wearer) && wearer.controllerId === view.playerId;
            if (wornByMine) {
              const delta = (target.power ?? 0) - (wearer.power ?? 0);
              if (delta >= 2) score += 4 + delta;
              else score -= 6;
            } else {
              score += 10 + 2 * (target.power ?? 0);
              if (grants.includes('flying') && untappedEnemyBlockers(view).every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 8;
              if (grants.includes('haste') && target.summoningSickness) score += 6;
            }
          }
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
        // M91 (uwaga A1): przy aktywnej prewencji obrażeń bojowych (Inspire
        // Awe) atakujący, który NIE jest zaczarowany ani nie jest
        // enchantment-creature, zada 0 obrażeń — a i tak zostanie tapnięty
        // i wystawiony na bloki. Taki atak nie ma wartości NIGDY (także
        // w wyścigu), więc zerujemy jego ocenę do wartości gorszej niż pass.
        // Reguła generyczna: warunek identyczny jak w engine (combat.js),
        // czytany z PlayerView — bez nazw kart (ADR 0002).
        if (view.preventCombatExceptEnchanted && attackers.length > 0) {
          const damageGetsThrough = attackers.some((id) => {
            const object = objectOnBoard(view, id);
            if (!object) return false;
            const isEnchantmentCreature = (object.types ?? []).includes('Enchantment');
            const isEnchanted = (view.zones.battlefield ?? []).some((other) => other?.attachedTo === id && other?.kind === 'aura');
            return isEnchantmentCreature || isEnchanted;
          });
          if (!damageGetsThrough) return finish(-100);
        }
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
          // M92 (audyt PlayerView): atakujący objęty pełną prewencją obrażeń
          // (np. Ethersworn Shieldmage chroni artefaktowe stwory) NIE MOŻE
          // zginąć w bloku w tej turze — atak jest darmowy niezależnie od
          // wielkości blockerów. Bez tej informacji bot chował 2/2 przed 5/5
          // i tracił pewne obrażenia.
          const attackerImmuneThisTurn = damageFullyPrevented(view, object);
          if (attackerImmuneThisTurn) {
            perAttacker = power + 3;
          } else if (blockers.length === 0) {
            perAttacker = power + 3; // otwarty — czysta presja
          } else if (toughness > strongestBlockerPower) {
            perAttacker = power + 3; // przeżyje wymianę
          } else if (power >= strongestBlockerToughness) {
            perAttacker = power - 1; // wymiana: obrażenia + usunięcie blockerów
          } else {
            // Chump do większego blokera: atakujący ginie, 0 obrażeń. Nawet
            // w wyścigu (racing) to strata — atak nie zada obrażeń i nie
            // zabija blokera, więc waga +8 z wyścigu nie wyrównuje wagi
            // -10. Bez tego bot atakował ⅔ w ⅚ w wyścigu (zgłoszenie
            // właściciela, 2026-08-14).
            perAttacker = -10;
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
      case 'resolve_devour_choice': {
        // Devour (Gorger Wurm): poświęcenie własnego stwora kupuje trwały
        // bonus na źródle — bot jest konserwatywny i zachowuje planszę:
        // domyślnie kończy (you may), poświęca tylko pozbawionego wartości
        // słabeusza (wartość 0–1: np. goły token 1/1 bez keywordów).
        if (cmd.done === true) return finish(40);
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0) + (target.keywords?.length ?? 0);
        return finish(value <= 3 ? 45 : 5 - value);
      }
      case 'resolve_endure_choice': {
        // Endure (Kin-Tree Nurturer): dwa ciała (token Spirit) są generycznie
        // nieco cenniejsze niż jeden licznik (drugi chump-blocker/atakujący).
        return finish(cmd.mode === 'token' ? 42 : 40);
      }
      case 'resolve_delirium_target': {
        // Delirium (Fear of Burning Alive): cel to stwór przeciwnika —
        // obieramy najsilniejszego kandydata (najwyższa wartość).
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        return finish(30 + (target.power ?? 0) * 2 + (target.toughness ?? 0));
      }
      case 'resolve_mentor_target': {
        // Mentor (CR 702.133): licznik +1/+1 na WŁASNYM atakującym o mniejszej
        // sile — najsilniejszy kandydat zyskuje najwięcej (twardszy napastnik).
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        return finish(30 + (target.power ?? 0) * 2 + (target.toughness ?? 0));
      }
      case 'resolve_trigger_target': {
        // Temat 2 — cel triggera (Forge Devil, Jill, Reclusive Artificer):
        // obrażenia / usunięcie na własnym stworze to błąd; na przeciwniku
        // premiujemy siłę. „Brak celu" (allowNone) = 0.
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) {
          const playerId = cmd.targetId;
          if (playerId === view.playerId) return finish(-40);
          if (playerId && playerId === enemy(view)?.id) return finish(25);
          return finish(0);
        }
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0);
        if (target.controllerId === view.playerId) return finish(-20 - value);
        return finish(30 + value);
      }
      case 'resolve_optional_trigger_choice': {
        // „You may" bez celu (Angel's Feather — +1 życie): „tak" jak dotąd.
        return finish(cmd.fire ? 50 : 0);
      }
      case 'resolve_mulligan_choice': {
        // Mulligan londyński (CR 103.4): bot zatrzymuje rękę (keep) —
        // pierwsza oferta; mulligan to decyzja strategiczna człowieka.
        return finish(cmd.keep ? 50 : 0);
      }
      case 'resolve_mulligan_bottom_choice': {
        // Odłożenie N kart na spód: pierwsza oferta (najtańsze karty).
        return finish(10);
      }
      case 'resolve_graveyard_top_choice': {
        // Forever Young: odkupienie stwora z grobu na wierzch biblioteki.
        // Bot bierze tylko naprawdę wartościowe stwory (i kończy, gdy reszta
        // nie jest warta zatykania dobrań). Widok grobu niesie statystyki
        // własnych kart — powerOf polega na polach widoku.
        if (cmd.done === true) return finish(15);
        const card = view.zones.graveyard.find((o) => o.id === cmd.targetId) ?? null;
        const def = card ? cardDef(card.cardId) : undefined;
        const value = (def?.power ?? 0) * 2 + (def?.toughness ?? 0);
        return finish(value >= 5 ? 10 + value : 5);
      }
      case 'resolve_legend_choice': {
        // Prawo legend (CR 704.5j): bot zostawia najsilniejszą kopię (ta
        // z licznikami może być mocniejsza niż sugeruje druk — wyceniamy
        // faktyczny obiekt widoku, nie definicję).
        const kept = cmd.keepId ? objectOnBoard(view, cmd.keepId) : null;
        if (!kept) return finish(0);
        return finish(30 + (kept.power ?? 0) * 2 + (kept.toughness ?? 0));
      }
      case 'resolve_fertile_thicket': {
        // Odkrycie basic landu na wierzch ≈ dojście do many; samo oglądanie
        // nic nie kosztuje, więc całkowity skip jest najsłabszą opcją.
        if (cmd.skip) return finish(2);
        return finish(cmd.chosenCardId != null ? 40 : 30);
      }
      case 'resolve_springbloom': {
        // Ramp: poświęcenie landa → 2 basic landy tapped (od M70 trigger żyje).
        return finish(cmd.sacrificeLandId != null ? 40 : 10);
      }
      case 'resolve_search_choice': {
        // Szukanie w bibliotece (Temat 6; Secret Entrance/cyclying/channel/
        // Kor Cartographer): znalezienie karty jest ZAWSZE lepsze niż
        // fail-to-find (found: null). Bez tego bot brał pierwszą ofertę
        // (rezygnację) i „skipował szukanie" — zgłoszenie właściciela B.
        if (cmd.found == null) return finish(-40);
        const card = view.zones.library.find((o) => o.id === cmd.found) ?? null;
        if (!card) return finish(0);
        let score = 25;
        // Land do ręki/na bitwisko = pewna mana; stwory wg statystyk.
        if (card.kind === 'land') score += 30;
        score += (card.power ?? 0) * 2 + (card.toughness ?? 0);
        return finish(score);
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
  // Simpler opponent policy for lookahead: plays lands, casts creatures,
  // blocks if can kill attacker, otherwise passes. More realistic than
  // full greedy (which blocks optimally and makes attacks look bad).
  function simpleChoice(view) {
    const ofType = (type) => view.legalCommands.filter((c) => c.type === type);
    const first = (type) => ofType(type)[0] ?? null;
    // Always play land if available
    const land = first('play_land');
    if (land) return land;
    // Cast creatures (first available)
    const perm = first('cast_permanent');
    if (perm) return perm;
    // Block if can kill attacker (simple: assign all blockers to first attacker)
    const blockers = ofType('declare_blockers');
    if (blockers.length > 0) return blockers[0];
    // Resolve combat
    const resolve = first('resolve_combat');
    if (resolve) return resolve;
    // Resolve pending decisions (take first option)
    const resolveAny = view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (resolveAny) return resolveAny;
    // Pass
    return first('pass_priority');
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
    const myLife = me?.life ?? 0;
    const foeLife = foe?.life ?? 0;
    const mine = view.zones.battlefield.filter((o) => o.controllerId === view.playerId);
    const foeBoard = view.zones.battlefield.filter((o) => o.controllerId !== view.playerId);
    const myCreatures = mine.filter((o) => o.kind === 'creature');
    const foeCreatures = foeBoard.filter((o) => o.kind === 'creature');
    const myPower = myCreatures.reduce((sum, o) => sum + Math.max(0, o.power ?? 0), 0);
    const foePower = foeCreatures.reduce((sum, o) => sum + Math.max(0, o.power ?? 0), 0);
    const myHand = view.zones.hand.filter((o) => o.controllerId === view.playerId).length;
    const foeHand = view.zones.hand.filter((o) => o.controllerId !== view.playerId).length;
    const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
    const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
    // Creature quality: keywords add value
    let myQuality = 0;
    let foeQuality = 0;
    for (const c of myCreatures) {
      if ((c.keywords ?? []).includes('flying')) myQuality += 2;
      if ((c.keywords ?? []).includes('deathtouch')) myQuality += 2;
      if ((c.keywords ?? []).includes('lifelink')) myQuality += 1;
      if ((c.keywords ?? []).includes('trample')) myQuality += 1;
      if ((c.keywords ?? []).includes('vigilance')) myQuality += 1;
      if ((c.keywords ?? []).includes('menace')) myQuality += 1;
      if ((c.keywords ?? []).includes('first_strike') || (c.keywords ?? []).includes('double_strike')) myQuality += 2;
    }
    for (const c of foeCreatures) {
      if ((c.keywords ?? []).includes('flying')) foeQuality += 2;
      if ((c.keywords ?? []).includes('deathtouch')) foeQuality += 2;
      if ((c.keywords ?? []).includes('lifelink')) foeQuality += 1;
      if ((c.keywords ?? []).includes('trample')) foeQuality += 1;
      if ((c.keywords ?? []).includes('vigilance')) foeQuality += 1;
      if ((c.keywords ?? []).includes('menace')) foeQuality += 1;
      if ((c.keywords ?? []).includes('first_strike') || (c.keywords ?? []).includes('double_strike')) foeQuality += 2;
    }
    // Evasion power: flying creatures are harder to block
    const myEvasion = myCreatures.filter((c) => (c.keywords ?? []).includes('flying')).reduce((s, c) => s + Math.max(0, c.power ?? 0), 0);
    const foeEvasion = foeCreatures.filter((c) => (c.keywords ?? []).includes('flying')).reduce((s, c) => s + Math.max(0, c.power ?? 0), 0);
    // Deck-out pressure: when library is small, every turn counts
    const myDeckPressure = myLib <= 5 ? (5 - myLib) * 3 : 0;
    const foeDeckPressure = foeLib <= 5 ? (5 - foeLib) * 3 : 0;
    // Life advantage (more weight when close to lethal)
    const lifeScore = (myLife - foeLife) * (foeLife <= 8 ? 1.5 : 1.0);
    // Board presence
    const boardScore = 2 * (myCreatures.length - foeCreatures.length);
    // Power advantage (include evasion bonus)
    const powerScore = 1.5 * (myPower - foePower) + 2 * (myEvasion - foeEvasion);
    // Creature quality
    const qualityScore = myQuality - foeQuality;
    // Card advantage
    const handScore = myHand - foeHand;
    // Library advantage (more important when low)
    const libScore = myLib - foeLib + myDeckPressure - foeDeckPressure;
    return lifeScore + powerScore + boardScore + qualityScore + handScore + libScore;
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
      const sim = simulate(entry.cmd, { policy: simpleChoice, maxCommands: LOOKAHEAD_MAX_COMMANDS, horizon });
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
    if (cmd.type === 'cast_spell' || cmd.type === 'cast_cleave' || cmd.type === 'cast_permanent' || cmd.type === 'cast_adventure' || cmd.type === 'cast_adventure_creature') return `${cmd.type}(${cmd.objectId}${cmd.targets ? '->' + cmd.targets.join('+') : ''})`;
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
