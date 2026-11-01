// Audyt PR #176 (sesja 2026-10-27c), O-1: ponowna oferta osiodłania.
//
// Żywy Tester (`tools/table-tester/out/a4.txt:440-455`) pokazał, że gracz
// ośiodłał ten sam `Gila Courser` DWA razy pod rząd — drugie osiodłanie
// wytapowało kolejny stwór i nie zmieniało NIC. Silnik jest tu zgodny z CR:
// CR 702.171a mówi wyłącznie „Saddle only as a sorcery”, a CR 702.171a trzyma
// stan „saddled” do końca tury — ponowna aktywacja jest LEGALNA, więc oferta
// musi istnieć (pin `m219-bot-resaddle-noop` wprost tego broni wobec bota).
// Brakiem była WARSTWA OPISU: etykieta wyglądała identycznie jak pierwsze
// osiodłanie, więc człowiek nie miał jak poznać, że koszt przepadnie (klasa
// L24/L84 — widoczna zmiana stanu bez wpisu w opisie oferty).
//
// Naprawa: `activationAlreadyAppliedWarning` (deskryptor efektu + flaga stanu
// z PlayerView — ADR 0017, zero nazw kart — ADR 0002) dokłada do etykiety
// „UWAGA: … już osiodłany do końca tury — ponowna aktywacja nic nie zmieni”.
// To ta sama klasa co ostrzeżenia M126 (pusta biblioteka, brak karty w ręce):
// nie blokujemy legalnej akcji, mówimy wprost o skutku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

const NAMES = { mount: 'Gila Courser', veh: 'Irontread Crusher', crew1: 'Fear of Abduction' };

const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => NAMES[o?.id] ?? o?.cardId ?? '?',
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
};

function viewWith(mountState = {}, vehicleState = {}) {
  return {
    playerId: 'p1',
    turn: { number: 5, step: 'precombat_main' },
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
    zones: {
      battlefield: [
        { id: 'mount', cardId: 'gila-courser', ...mountState },
        { id: 'veh', cardId: 'irontread-crusher', ...vehicleState },
        { id: 'crew1', cardId: 'arlinns-wolf', kind: 'creature', power: 3, toughness: 2 },
      ],
      hand: [], graveyard: [], exile: [], stack: [], library: [],
    },
    legalCommands: [],
  };
}

// Indeks 1 = zdolność wydrukowana jako DRUGA (trigger ataku jest pierwszy).
const saddleCmd = { type: 'activate_ability', playerId: 'p1', objectId: 'mount', abilityIndex: 1, crewCreatureIds: ['crew1'] };
const crewCmd = { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['crew1'] };

test('O-1: Mount JUŻ osiodłany → etykieta ostrzega, że ponowna aktywacja nic nie zmieni', () => {
  const label = commandLabel(saddleCmd, SESSION, viewWith({ saddled: true }));
  assert.match(label, /UWAGA/, `brak ostrzeżenia o powtórzeniu: ${label}`);
  assert.match(label, /już osiodłany/i, `ostrzeżenie nie nazywa stanu: ${label}`);
  assert.match(label, /nic nie zmieni/i, `ostrzeżenie nie mówi o skutku: ${label}`);
});

test('O-1 anty-over-fix: pierwsze osiodłanie zostaje BEZ ostrzeżenia (akcja legalna)', () => {
  const label = commandLabel(saddleCmd, SESSION, viewWith({ saddled: false }));
  assert.doesNotMatch(label, /UWAGA/, `pierwsze osiodłanie nie może straszyć: ${label}`);
  assert.match(label, /siodł/i, `etykieta nadal nazywa akcję: ${label}`);
});

test('O-1: to samo dla crew (pojazd już animowany do końca tury — CR 702.122e)', () => {
  const label = commandLabel(crewCmd, SESSION, viewWith({}, { animatedUntilEOT: true }));
  assert.match(label, /UWAGA/, `brak ostrzeżenia przy powtórnym obsadzeniu: ${label}`);
  assert.match(label, /już obsadzony/i, `ostrzeżenie nie nazywa stanu: ${label}`);
});

test('O-1 anty-over-fix: świeży pojazd bez ostrzeżenia', () => {
  const label = commandLabel(crewCmd, SESSION, viewWith({}, { animatedUntilEOT: false }));
  assert.doesNotMatch(label, /UWAGA/, `pierwsze obsadzenie nie może straszyć: ${label}`);
});

test('O-1: ostrzeżenie nie zjada etykiety — akcja i próg mocy nadal widoczne', () => {
  const label = commandLabel(saddleCmd, SESSION, viewWith({ saddled: true }));
  assert.match(label, /Osiodłaj/, `brak nazwy akcji: ${label}`);
  assert.match(label, /moc ≥ 1/, `brak progu mocy saddle: ${label}`);
});
