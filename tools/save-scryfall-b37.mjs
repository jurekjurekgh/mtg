import { writeFileSync } from 'node:fs';
const path = 'docs/cards/scryfall-';
const cards = [
  ['returned-centaur', 'Returned Centaur', 'ori', '{3}{B}', 4, 'Creature - Zombie Centaur', 'When this creature enters, target player mills four cards.', '2', '4', ['B'], ['B'], ['Mill'], '116', 'https://cards.scryfall.io/large/front/1/0/103b369c-da58-40e7-98aa-5a5471434bca.jpg'],
  ['static-net', 'Static Net', 'bro', '{3}{W}', 4, 'Enchantment', 'When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.\nWhen this enchantment enters, you gain 2 life and create a tapped Powerstone token. (It\\\'s an artifact with \"{T}: Add {C}. This mana can\\\'t be spent to cast a nonartifact spell.\")', null, null, ['W'], ['W'], [], '27', 'https://cards.scryfall.io/large/front/5/a/5ab5cb30-3ced-4450-a3c4-b519f3762620.jpg']
];
for (const [slug, name, set, mana, cmc, type, oracle, p, t, colors, ci, keywords, col, img] of cards) {
  const data = { source: `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&set=${set}`, print: `${name} (${set.toUpperCase()})`, name, mana_cost: mana, cmc, type_line: type, oracle_text: oracle, power: p, toughness: t, colors, color_identity: ci, keywords, set, set_name: '', collector_number: col, rarity: 'common', image_uris: { large: img, normal: img.replace('/large/', '/normal/') }, pobrano: '2026-08-19' };
  writeFileSync(`${path}${slug}.json`, JSON.stringify(data, null, 2));
  console.log(slug);
}