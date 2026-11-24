import { normalizeCatalogSearch } from '$lib/i18n/catalogCategories';

/** Other words people use for a catalog id, English and Brazilian Portuguese together. */
export const catalogAliases: Record<string, string[]> = {
  sofa: ['couch', 'settee', 'estofado'],
  loveseat: ['couch', 'small sofa', 'namoradeira'],
  chair: ['easy chair', 'seat', 'poltrona'],
  coffee_table: ['low table', 'mesa de centro'],
  tv_stand: ['tv table', 'media console', 'rack'],
  television: ['tv', 'screen', 'tela'],
  bookshelf: ['shelf', 'shelves', 'bookcase', 'estante'],
  side_table: ['end table'],
  nightstand: ['bedside table', 'criado-mudo'],
  dresser: ['drawers', 'chest of drawers', 'comoda'],
  wardrobe: ['closet', 'armoire', 'guarda-roupa'],
  storage: ['cupboard', 'toy box', 'bin', 'armario'],
  stove: ['cooker', 'range'],
  fridge: ['refrigerator', 'freezer', 'geladeira'],
  counter: ['countertop', 'worktop', 'bancada'],
  washer_dryer: ['washing machine', 'laundry', 'lavadora'],
  rug: ['carpet', 'mat', 'play mat', 'tapete'],
  round_rug: ['carpet', 'mat'],
  runner_rug: ['carpet', 'hall rug'],
  curtain: ['drapes', 'cortina'],
  potted_plant: ['plant', 'flower pot'],
  floor_plant: ['plant'],
  floor_lamp: ['lamp', 'light'],
  table_lamp: ['lamp', 'light'],
  bench_outdoor: ['bench', 'bench seat', 'banco'],
  sandbox: ['sand pit', 'sandpit', 'play'],
  tent: ['play tent', 'fort', 'barraca'],
  shed: ['playhouse', 'hut'],
  bike: ['bike', 'trike'],
  car_sedan: ['car', 'carro'],
  car_suv: ['car', 'truck', 'carro'],
  person: ['people', 'man', 'woman', 'kid', 'child', 'pessoa'],
  'people-pair': ['people', 'couple', 'kids', 'pessoas'],
  'car-sedan': ['car', 'carro'],
  'car-suv': ['car', 'carro'],
  'car-pickup': ['truck', 'pickup truck', 'caminhonete'],
  'tree-deciduous': ['tree', 'arvore'],
  'tree-conifer': ['tree', 'pine', 'arvore'],
  shrub: ['bush', 'arbusto'],
  'potted-plant': ['plant', 'flower pot'],
  'grass-tuft': ['grass', 'grama'],
  'patio-umbrella': ['umbrella', 'parasol', 'guarda-sol'],
};

/** A query word is in a value as written, or, past three letters, without a final "es" or "s" ("couches" finds "couch"). */
function wordIn(word: string, value: string): boolean {
  if (value.includes(word)) return true;
  if (word.length <= 3) return false;
  if (word.endsWith('es') && value.includes(word.slice(0, -2))) return true;
  return word.endsWith('s') && value.includes(word.slice(0, -1));
}

/** True when every word of the query is found in one of the thing's names or other words. An empty query matches. */
export function matchesCatalogSearch(query: string, id: string, names: (string | undefined)[]): boolean {
  const words = normalizeCatalogSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const values = [...names, ...(Object.hasOwn(catalogAliases, id) ? catalogAliases[id] : [])]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normalizeCatalogSearch);
  return words.every(word => values.some(value => wordIn(word, value)));
}
