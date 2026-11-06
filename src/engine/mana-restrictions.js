import { manaUnitKey } from './mana-sources.js';

const KNOWN = new Set(['enchantment_spell', 'unlock_door', 'turn_face_up']);

export function normalizeSpendOnly(value) {
  if (value == null) return null;
  if (value === 'artifact') return 'artifact';
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.some((item) => !KNOWN.has(item))) return null;
  return [...new Set(values)].sort();
}

export function spendOnlyPurposeKey(spendOnly, colors) {
  const normalized = normalizeSpendOnly(spendOnly);
  if (!Array.isArray(normalized)) return null;
  // JSON gives unambiguous encoding even when future purpose names grow.
  return JSON.stringify([normalized, manaUnitKey(colors)]);
}

function purposeForKey(key) {
  try {
    const parsed = JSON.parse(key);
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Array.isArray(parsed[0])
      || typeof parsed[1] !== 'string' || parsed[0].some((v) => !KNOWN.has(v))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function purposeAllowsSpendOnly(spendOnly, purpose = {}) {
  const normalized = normalizeSpendOnly(spendOnly);
  if (normalized == null) return spendOnly == null;
  if (normalized === 'artifact') {
    return purpose?.castingSpell !== true || purpose?.artifactSpell === true;
  }
  return normalized.some((restriction) => {
    if (restriction === 'enchantment_spell') return purpose?.castingSpell === true && purpose?.enchantmentSpell === true;
    if (restriction === 'unlock_door') return purpose?.unlockDoor === true;
    if (restriction === 'turn_face_up') return purpose?.turnFaceUp === true;
    return false;
  });
}

/** Expand only purpose-restricted pool units legal for this specific payment. */
export function availablePurposeRestrictedUnits(pool, purpose = {}) {
  const units = [];
  for (const [key, count] of Object.entries(pool ?? {})) {
    const parsed = purposeForKey(key);
    if (!parsed || !purposeAllowsSpendOnly(parsed[0], purpose)) continue;
    const colors = parsed[1] === '' ? [] : parsed[1].split('');
    for (let i = 0; i < count; i += 1) units.push({ colors, key });
  }
  return units;
}

export function blockedPurposeRestrictedCount(pool, purpose = {}) {
  let count = 0;
  for (const [key, amount] of Object.entries(pool ?? {})) {
    const parsed = purposeForKey(key);
    if (!parsed || !purposeAllowsSpendOnly(parsed[0], purpose)) count += amount;
  }
  return count;
}
