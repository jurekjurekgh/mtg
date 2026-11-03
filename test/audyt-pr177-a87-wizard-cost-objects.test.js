// Test kontraktu planowanego solvera: źródła są zbudowane z rzeczywistych
// legalnych aktywacji Holdouta i Wardena, natomiast pole tapCostChoices jest
// syntetycznym opisem wyborów, którego produkcyjna lista A85 jeszcze nie niesie.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {countPaymentVariants} from '../src/table/mana-wizard.js';
const reg=createCardRegistry();
function put(s,id,card){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:'p1',registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone:'battlefield',controllerId:'p1'});s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));}
function sources(extra=false){const s=createGameState({seed:17787,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'hold','holdout-settlement');put(s,'warden','warden-of-geometries');if(extra)put(s,'ally','goblin-piker');const cmds=playerView(s,'p1').legalCommands;const hold=cmds.filter(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1);const warden=cmds.find(c=>c.type==='activate_ability'&&c.objectId==='warden'&&c.abilityIndex===0);assert.ok(warden);assert.ok(hold.some(c=>c.tapCreatureId==='warden'));const a=s.objects.get('hold').abilities[1].effect;return [{id:'hold',kind:'ability',colors:a.colors,amount:a.amount,tapCostChoices:hold.map(c=>c.tapCreatureId)},{id:'warden',kind:'ability',colors:[],amount:1}];}
test('A87: Warden tapnięty do kosztu Holdouta nie daje drugiej many',()=>{const src=sources();assert.deepEqual(src[0].tapCostChoices,['warden']);assert.equal(countPaymentVariants(src,0,2,[['R']]),0);});
test('A87: inny stwór pozwala zapłacić kosztem Holdouta i użyć Wardena',()=>{const src=sources(true);assert.deepEqual(new Set(src[0].tapCostChoices),new Set(['warden','ally']));assert.equal(countPaymentVariants(src,0,2,[['R']]),1);});
test('A87: płatność {R} może tapnąć Wardena jeśli nie korzysta z jego many',()=>{const src=sources();assert.equal(countPaymentVariants(src,0,1,[['R']]),1);});
