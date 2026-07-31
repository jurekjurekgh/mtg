import { createRng } from '../engine/rng.js';

/** Prosty kontroler testowy: wybiera wyłącznie spośród legalnych komend widoku. */
export function createRandomBot({ seed }) {
  const rng = createRng(seed);
  return Object.freeze({
    chooseCommand(view) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      const index = Math.floor(rng() * view.legalCommands.length);
      return view.legalCommands[index];
    },
  });
}
