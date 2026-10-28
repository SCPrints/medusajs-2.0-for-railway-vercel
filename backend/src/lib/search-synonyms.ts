/**
 * Words customers use for the same garment. Every word in a group finds the
 * others ("tshirt" finds "Staple Tee"). Meili doesn't stem, so plurals go in
 * too. Add a group when the search log (Reports → Catalog & supply) shows a
 * zero-result or poor query. Changing this changes the index declaration, so
 * the next backend deploy rebuilds the index on its own.
 */
const GROUPS: string[][] = [
  ["tee", "tees", "t-shirt", "t-shirts", "tshirt", "tshirts", "t shirt", "t shirts"],
  ["hoodie", "hoodies", "hoody", "hood", "hoods", "hooded", "hoodys"],
  ["jumper", "jumpers", "sweatshirt", "sweatshirts", "sweater", "sweaters", "pullover", "crewneck", "crewnecks", "fleece"],
  ["hi vis", "hi-vis", "hivis", "hi viz", "hi-viz", "hiviz", "high vis", "high viz", "high visibility", "hv"],
  ["polo", "polos", "polo shirt", "polo shirts"],
  ["singlet", "singlets", "tank", "tanks", "tank top", "tank tops"],
  ["cap", "caps", "hat", "hats"],
  ["beanie", "beanies"],
  ["tote", "totes", "tote bag", "tote bags"],
  ["bag", "bags"],
  ["jacket", "jackets"],
  ["vest", "vests", "gilet"],
  ["apron", "aprons"],
  ["scrub", "scrubs"],
  ["pants", "pant", "trousers"],
  ["trackpants", "track pants", "trackies", "joggers", "jogger", "sweatpants"],
  ["long sleeve", "long sleeved", "longsleeve", "l/s"],
  ["short sleeve", "short sleeved", "s/s"],
  ["quarter zip", "1/4 zip", "half zip", "1/2 zip"],
  ["work shirt", "work shirts", "drill shirt", "drill shirts"],
  ["mens", "men", "men's", "male"],
  ["womens", "women", "women's", "ladies", "lady", "female", "wo's"],
  ["kids", "kid", "kids'", "youth", "children", "childrens", "child"],
  ["baby", "babies", "infant", "toddler"],
  ["grey", "gray"],
  ["colour", "color"],
]

export const SEARCH_SYNONYMS: Record<string, string[]> = Object.fromEntries(
  GROUPS.flatMap((group) => group.map((word) => [word, group.filter((w) => w !== word)]))
)
