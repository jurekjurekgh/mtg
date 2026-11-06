import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,spendMana,producibleMana,canPayColoredCost,expandManaPool} from '../src/engine/resources.js';
import {paymentDescriptorOf,shouldOpenManaWizard} from '../src/table/mana-wizard.js';
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
function scene(){const s=createGameState({seed:17786,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';for(const [id,card,zone,p] of [['bomb','panic-spellbomb','battlefield','p1'],['hold','holdout-settlement','battlefield','p1'],['ally','goblin-piker','battlefield','p1'],['enemy','highland-game','battlefield','p2'],['top','basic-forest','library','p1']])put(s,id,card,zone,p);addMana(s,'p1',1,{colors:['R']});const run=c=>assert.ok(execute(s,c).ok);run(playerView(s,'p1').legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));for(let i=0;i<2;i++)run({type:'pass_priority',playerId:s.turn.priorityPlayerId});assert.ok(s.pendingOptionalPay);const cmd=playerView(s,'p1').legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay);assert.ok(cmd);spendMana(s,'p1',1,[['R']]);return {s,cmd};}
function input(){const {s,cmd}=scene(),view=playerView(s,'p1'),d=paymentDescriptorOf(cmd,view),activation=view.legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally');assert.ok(activation);const effect=s.objects.get('hold').abilities[activation.abilityIndex].effect;const source={id:'hold',kind:'ability',colors:effect.colors,amount:effect.amount,command:activation},requirements=cmd.costColors.map(color=>[color]);return {sources:[source],poolMana:0,poolUnits:[],totalNeeded:d.totalNeeded,requirements,autoPayableMana:producibleMana(s,'p1',null,{},[]),autoPayableColors:canPayColoredCost(s,'p1',requirements)};}
test('A86: liczba bez koloru nie zamyka kreatora dla ręcznie osiągalnego {R}',()=>{const args=input();assert.equal(args.autoPayableMana,1);assert.equal(args.autoPayableColors,false);assert.equal(shouldOpenManaWizard(args),true);});
test('A86: gdy automat potrafi pokryć kolor i jest tylko jeden wariant, kreator pozostaje zamknięty',()=>{const args=input();assert.equal(shouldOpenManaWizard({...args,autoPayableColors:true}),false);});
test('A86: bez źródła pokrywającego kolor bramka nie otwiera pustego kreatora',()=>{const args=input();assert.equal(shouldOpenManaWizard({...args,sources:[]}),false);});

// Prawdziwy router main.js; źródło podane jawnie, aby izolować bramkę od routera źródeł.
test('A86: router stołu przekazuje kolorową zdolność automatu do bramki',()=>{const {s,cmd}=scene(),args=input(),source=args.sources[0];const main=readFileSync(new URL('../src/table/main.js',import.meta.url),'utf8');const start=main.indexOf('  function manaWizardFor('),end=main.indexOf('\n  }',start);assert.ok(start>=0&&end>start);const ctx=createContext({session:{state:s,view:()=>playerView(s,'p1')},HUMAN_ID:'p1',paymentDescriptorOf,shouldOpenManaWizard,expandManaPool,producibleMana,canPayColoredCost,restrictedSpellBlockedFor:()=>false,selfTapExclusionFor:()=>null,manaSourcesForPlayer:()=>[source]});runInContext(main.slice(start,end+4),ctx);assert.ok(ctx.manaWizardFor(cmd),'router musi otworzyć kreator przy osiągalnym ręcznym kolorze');});
