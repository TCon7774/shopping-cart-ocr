export const OPENAI_MODEL_ENV = "OPENAI_MODEL";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const SEARCH_TERM_CORRECTIONS = new Map([
  ["sugor", "sugar"],
  ["milh", "milk"],
  ["chedder", "cheddar"],
  ["oreas", "oreos"],
]);

const INVALID_ATTRIBUTE_WORDS = new Set(["gamma"]);

const VALID_ATTRIBUTE_PHRASES = new Set([
  "bbq",
  "barbecue",
  "block",
  "boneless",
  "buffalo",
  "caffeine free",
  "cherry",
  "cheddar",
  "chocolate",
  "classic",
  "cool ranch",
  "creamy",
  "crunchy",
  "decaf",
  "diet",
  "diced",
  "extra virgin",
  "fat free",
  "fresh",
  "frozen",
  "garlic",
  "gluten free",
  "grated",
  "green",
  "ground",
  "honey",
  "hot",
  "italian",
  "lean",
  "light",
  "lite",
  "low sodium",
  "maple",
  "medium",
  "mild",
  "minced",
  "natural",
  "no pulp",
  "organic",
  "original",
  "peeled",
  "pitted",
  "plain",
  "ranch",
  "raw",
  "red",
  "reduced fat",
  "roasted",
  "seedless",
  "shredded",
  "skinless",
  "sliced",
  "smoked",
  "smooth",
  "sour cream and onion",
  "spicy",
  "strawberry",
  "sugar free",
  "salt and vinegar",
  "sweet",
  "sweetened",
  "teriyaki",
  "toasted",
  "unsalted",
  "unsweetened",
  "vanilla",
  "white",
  "whole grain",
  "whole wheat",
  "yellow",
  "zero sugar",
]);

const groceryListSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add_to_cart"],
            description: 'Always "add_to_cart" for each parsed grocery item.',
          },
          item: {
            type: "string",
            description:
              "The simple, normalized grocery item name in lowercase, with brand names removed.",
          },
          quantity: {
            type: "integer",
            description: "How many of this grocery item the shopper wants to buy.",
          },
          descriptors: {
            type: "object",
            description: "Controlled descriptors extracted only from the OCR text.",
            properties: {
              brand: {
                type: ["string", "null"],
                description: "A brand name only when it is clearly present in the OCR text.",
              },
              unit: {
                type: ["string", "null"],
                description:
                  "A standardized measurement or count unit such as 2 L, 500 ml, 250 g, 1 kg, 12 oz, 2 lb, or count. Null when absent or unclear.",
              },
              package: {
                type: ["string", "null"],
                description:
                  "Packaging such as 12-pack, 6-pack, or multi-pack. Keep this separate from unit.",
              },
              attributes: {
                type: "array",
                description:
                  "Meaningful non-brand descriptors from the OCR text, such as frozen, 2%, boneless, cherry, organic, low sodium, or unsalted.",
                items: {
                  type: "string",
                },
              },
            },
            required: ["brand", "unit", "package", "attributes"],
            additionalProperties: false,
          },
          confidence: {
            type: "number",
            description:
              "Confidence from 0 to 1. Lower this when OCR is messy, spelling was corrected, or quantity/unit meaning is unclear.",
          },
          needs_review: {
            type: "boolean",
            description:
              "True when confidence is low, quantity is ambiguous, OCR correction was significant, or a human should verify before cart automation.",
          },
          search_query: {
            type: "string",
            description:
              "A concise store-search phrase using item, important attributes, package, unit, and brand when present.",
          },
          original_text: {
            type: "string",
            description:
              "The exact original OCR line this item came from. Do not clean, lowercase, or rewrite it.",
          },
        },
        required: [
          "action",
          "item",
          "quantity",
          "descriptors",
          "confidence",
          "needs_review",
          "search_query",
          "original_text",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function getOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const chunks = [];
  for (const outputItem of data.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (typeof contentItem.text === "string") {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks.join("");
}

function normalizeWhitespace(value) {
  return String(value ?? "").trim().replaceAll(/\s+/g, " ");
}

function roundConfidence(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, Math.round(numericValue * 100) / 100));
}

function cleanSearchText(value) {
  const tokens = normalizeWhitespace(value)
    .toLowerCase()
    .match(/[a-z0-9%]+(?:[-'][a-z0-9%]+)*/g) ?? [];

  return tokens
    .map((token) => SEARCH_TERM_CORRECTIONS.get(token) ?? token)
    .filter((token) => isSearchableToken(token))
    .join(" ")
    .trim();
}

function cleanAttributeText(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/\b/)
    .map((part) => SEARCH_TERM_CORRECTIONS.get(part) ?? part)
    .join("")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function isSearchableToken(token) {
  if (!token) {
    return false;
  }

  if (/^\d+(?:\.\d+)?%$/.test(token)) {
    return true;
  }

  if (/^\d+$/.test(token)) {
    return true;
  }

  if (/^[a-z]$/.test(token)) {
    return ["l", "g"].includes(token);
  }

  if (/[a-z]\d+[a-z]/i.test(token)) {
    return false;
  }

  const lettersOnly = token.replaceAll(/[^a-z]/g, "");
  if (lettersOnly.length >= 5 && !/[aeiouy]/.test(lettersOnly)) {
    return false;
  }

  return /^[a-z0-9%'-]+$/.test(token);
}

function normalizeBrand(value) {
  const brand = normalizeWhitespace(value);
  if (!brand) {
    return null;
  }

  if (brand === brand.toLowerCase()) {
    return brand.replaceAll(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  return brand;
}

function normalizeUnit(value) {
  let unit = normalizeWhitespace(value).toLowerCase();
  if (!unit) {
    return null;
  }

  const metricPatterns = [
    { pattern: /^(\d+(?:\.\d+)?)\s*(?:l|liter|liters|litre|litres)$/i, suffix: "L" },
    { pattern: /^(\d+(?:\.\d+)?)\s*(?:ml|milliliter|milliliters|millilitre|millilitres)$/i, suffix: "ml" },
    { pattern: /^(\d+(?:\.\d+)?)\s*(?:g|gram|grams)$/i, suffix: "g" },
    { pattern: /^(\d+(?:\.\d+)?)\s*(?:kg|kilogram|kilograms)$/i, suffix: "kg" },
  ];

  for (const { pattern, suffix } of metricPatterns) {
    const match = unit.match(pattern);
    if (match) {
      return `${match[1]} ${suffix}`;
    }
  }

  const unitOnlyMap = new Map([
    ["l", "L"],
    ["liter", "L"],
    ["liters", "L"],
    ["litre", "L"],
    ["litres", "L"],
    ["ml", "ml"],
    ["milliliter", "ml"],
    ["milliliters", "ml"],
    ["millilitre", "ml"],
    ["millilitres", "ml"],
    ["g", "g"],
    ["gram", "g"],
    ["grams", "g"],
    ["kg", "kg"],
    ["kilogram", "kg"],
    ["kilograms", "kg"],
    ["ct", "count"],
    ["count", "count"],
    ["each", "count"],
    ["piece", "count"],
    ["pieces", "count"],
  ]);

  if (unitOnlyMap.has(unit)) {
    return unitOnlyMap.get(unit);
  }

  unit = unit.replaceAll(/\bct\b/g, "count");
  return unit;
}

function normalizePackage(value) {
  const packageValue = normalizeWhitespace(value).toLowerCase();
  if (!packageValue) {
    return null;
  }

  const packMatch = packageValue.match(/^(\d+)\s*(?:-| )?\s*(?:pack|pk)$/i);
  if (packMatch) {
    return `${packMatch[1]}-pack`;
  }

  const multiPackMatch = packageValue.match(/^multi\s*(?:-| )?\s*pack$/i);
  if (multiPackMatch) {
    return "multi-pack";
  }

  return packageValue.replaceAll(/\s*-\s*/g, "-");
}

function normalizeAttributes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const attributes = [];
  for (const rawAttribute of value) {
    const attribute = cleanAttributeText(rawAttribute);
    if (!attribute || seen.has(attribute)) {
      continue;
    }

    if (!isValidAttribute(attribute)) {
      continue;
    }

    seen.add(attribute);
    attributes.push(attribute);
  }

  return attributes;
}

function addAttribute(attributes, attribute) {
  const normalizedAttribute = cleanAttributeText(attribute);
  if (!normalizedAttribute || attributes.includes(normalizedAttribute)) {
    return;
  }

  if (!isValidAttribute(normalizedAttribute)) {
    return;
  }

  attributes.push(normalizedAttribute);
}

function isValidAttribute(attribute) {
  const normalizedAttribute = normalizeWhitespace(attribute).toLowerCase();
  if (!normalizedAttribute) {
    return false;
  }

  if (INVALID_ATTRIBUTE_WORDS.has(normalizedAttribute)) {
    return false;
  }

  if (!/^[a-z0-9%&'\-\s]+$/.test(normalizedAttribute)) {
    return false;
  }

  if (/^[a-z]$/.test(normalizedAttribute) || /^\d+$/.test(normalizedAttribute)) {
    return false;
  }

  if (VALID_ATTRIBUTE_PHRASES.has(normalizedAttribute)) {
    return true;
  }

  if (/^\d+(?:\.\d+)?%$/.test(normalizedAttribute)) {
    return true;
  }

  if (/^(?:no|low|reduced|zero)\s+[a-z][a-z ]{2,}$/.test(normalizedAttribute)) {
    return true;
  }

  if (/^[a-z]+(?:\s+[a-z]+)*\s+free$/.test(normalizedAttribute)) {
    return true;
  }

  if (/^\d+\s*(?:-| )?\s*(?:pack|pk)$/.test(normalizedAttribute)) {
    return true;
  }

  if (/^[a-z0-9]+(?:[-\s][a-z0-9]+){0,3}$/.test(normalizedAttribute)) {
    return true;
  }

  return false;
}

function extractPackageFromText(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  const match = text.match(/\b(\d+)\s*(?:-| )?\s*(?:pack|pk)\b/i);
  return match ? `${match[1]}-pack` : null;
}

function normalizeConfidence(value) {
  return roundConfidence(value);
}

function hasExplicitQuantity(originalText) {
  return /\b(?:x\s*\d+|\d+\s*x|qty\s*\d+|quantity\s*\d+)\b/i.test(originalText);
}

function hasOcrNoise(originalText) {
  const text = String(originalText ?? "");
  if (!text.trim()) {
    return true;
  }

  return (
    /[,.;:|\\/]+$/.test(text.trim()) ||
    /[^\w\s%&'.\-/]+/.test(text) ||
    /\b[A-Za-z]\s*-\s*[A-Za-z]\b/.test(text) ||
    /\s{3,}/.test(text)
  );
}

function isLikelyProduce(itemName) {
  const produceItems = new Set([
    "apple",
    "apples",
    "banana",
    "bananas",
    "orange",
    "oranges",
    "lemon",
    "lemons",
    "lime",
    "limes",
    "avocado",
    "avocados",
    "tomato",
    "tomatoes",
    "potato",
    "potatoes",
    "onion",
    "onions",
    "pepper",
    "peppers",
    "cucumber",
    "cucumbers",
    "carrot",
    "carrots",
    "strawberries",
    "blueberries",
    "grapes",
  ]);

  return produceItems.has(itemName);
}

function removeBrandFromItemName(itemName, brand) {
  if (!brand) {
    return itemName;
  }

  const brandPattern = brand
    .toLowerCase()
    .replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll(/\s+/g, "\\s+");
  const cleanedItem = normalizeWhitespace(
    itemName.replace(new RegExp(`\\b${brandPattern}\\b`, "gi"), ""),
  ).toLowerCase();

  return cleanedItem || itemName;
}

function applyKnownBrandNormalization(item) {
  const normalizedItem = item.item.toLowerCase();
  const knownBrandItems = new Map([
    ["nutella", { item: "hazelnut spread", brand: "Nutella" }],
    ["coca cola", { item: "cola", brand: "Coca Cola" }],
    ["coca-cola", { item: "cola", brand: "Coca Cola" }],
  ]);

  const known = knownBrandItems.get(normalizedItem);
  if (!known) {
    return;
  }

  item.item = known.item;
  item.descriptors.brand = item.descriptors.brand ?? known.brand;
  item.confidence = Math.min(item.confidence, 0.9);
}

function moveItemFormsToAttributes(item) {
  const prefixAttributes = ["frozen"];
  for (const attribute of prefixAttributes) {
    if (item.item.startsWith(`${attribute} `)) {
      item.item = normalizeWhitespace(item.item.slice(attribute.length));
      addAttribute(item.descriptors.attributes, attribute);
      item.confidence = Math.min(item.confidence, 0.9);
    }
  }

  const suffixAttributes = ["block", "sliced", "shredded", "grated"];
  for (const attribute of suffixAttributes) {
    if (item.item.endsWith(` ${attribute}`)) {
      item.item = normalizeWhitespace(item.item.slice(0, -attribute.length));
      addAttribute(item.descriptors.attributes, attribute);
      item.confidence = Math.min(item.confidence, 0.9);
    }
  }
}

function normalizeDescriptors(item) {
  const packageFromUnit = extractPackageFromText(item.descriptors.unit);
  const packageFromAttributes = item.descriptors.attributes.map(extractPackageFromText).find(Boolean);
  item.descriptors.package = item.descriptors.package ?? packageFromUnit ?? packageFromAttributes;

  if (item.descriptors.package) {
    item.descriptors.package = normalizePackage(item.descriptors.package);
    item.descriptors.unit = item.descriptors.unit === item.descriptors.package ? null : item.descriptors.unit;
    item.descriptors.attributes = item.descriptors.attributes.filter(
      (attribute) => extractPackageFromText(attribute) !== item.descriptors.package,
    );
  }

  if (item.descriptors.package && !item.descriptors.unit) {
    item.descriptors.unit = "count";
  }

  if (isLikelyProduce(item.item) && !item.descriptors.package) {
    if (!item.descriptors.unit) {
      item.descriptors.unit = "count";
    }

    if (item.descriptors.unit === "count" && item.quantity > 1) {
      item.confidence = Math.min(item.confidence, 0.75);
      item.needs_review = true;
    }
  }
}

function applyConfidenceAdjustments(item) {
  const originalText = item.original_text;

  if (item.quantity === 1 && !hasExplicitQuantity(originalText)) {
    item.confidence = Math.min(item.confidence, 0.85);
  }

  if (hasOcrNoise(originalText)) {
    item.confidence = Math.max(0, Math.min(item.confidence, item.confidence - 0.05));
  }

  item.confidence = roundConfidence(item.confidence);

  if (item.confidence < 0.65) {
    item.needs_review = true;
  }
}

function buildSearchQuery(item) {
  const parts = [
    item.descriptors.brand,
    ...item.descriptors.attributes,
    item.descriptors.package,
    item.descriptors.unit,
    item.item,
  ].filter((part) => part && part !== "count");

  const seen = new Set();
  const dedupedParts = [];
  for (const part of parts) {
    const normalizedPart = cleanSearchText(part);
    const key = normalizedPart.toLowerCase();
    if (!normalizedPart || seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedParts.push(normalizedPart);
  }

  return dedupedParts.join(" ").trim().toLowerCase();
}

function getDedupKey(item) {
  return JSON.stringify({
    item: item.item,
    brand: item.descriptors.brand?.toLowerCase() ?? null,
    unit: item.descriptors.unit,
    package: item.descriptors.package,
    attributes: [...item.descriptors.attributes].sort(),
  });
}

function mergeDuplicateItems(items) {
  const mergedItems = [];
  const indexByKey = new Map();

  for (const item of items) {
    const key = getDedupKey(item);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, mergedItems.length);
      mergedItems.push(item);
      continue;
    }

    const existingItem = mergedItems[existingIndex];
    existingItem.quantity += item.quantity;
    existingItem.confidence = roundConfidence(Math.min(existingItem.confidence, item.confidence));
    existingItem.needs_review = existingItem.needs_review || item.needs_review;
    if (item.original_text && !existingItem.original_text.includes(item.original_text)) {
      existingItem.original_text = `${existingItem.original_text}\n${item.original_text}`;
    }
  }

  return mergedItems.map((item) => ({
    ...item,
    confidence: roundConfidence(item.confidence),
  }));
}

function cleanParsedItems(parsed) {
  const items = parsed.items.map((rawItem) => {
    const rawDescriptors = rawItem.descriptors ?? {};
    const item = {
      action: "add_to_cart",
      item: normalizeWhitespace(rawItem.item).toLowerCase(),
      quantity: Number.isInteger(rawItem.quantity) && rawItem.quantity > 0 ? rawItem.quantity : 1,
      descriptors: {
        brand: normalizeBrand(rawDescriptors.brand),
        unit: normalizeUnit(rawDescriptors.unit),
        package: normalizePackage(rawDescriptors.package),
        attributes: normalizeAttributes(rawDescriptors.attributes),
      },
      confidence: normalizeConfidence(rawItem.confidence),
      needs_review: Boolean(rawItem.needs_review),
      search_query: "",
      original_text: String(rawItem.original_text ?? ""),
    };

    applyKnownBrandNormalization(item);
    item.item = removeBrandFromItemName(item.item, item.descriptors.brand);
    moveItemFormsToAttributes(item);
    normalizeDescriptors(item);
    applyConfidenceAdjustments(item);
    item.search_query = buildSearchQuery(item);
    return item;
  });

  return mergeDuplicateItems(items.filter((item) => item.item));
}

export async function parseGroceryList({ apiKey, model = DEFAULT_OPENAI_MODEL, groceryText }) {
  const requestBody = {
    model,
    input: [
      {
        role: "system",
        content: `You convert OCR grocery list text into structured JSON instructions for a grocery cart system.

Rules:
- Each grocery line becomes one add_to_cart instruction unless the line is empty or clearly not a grocery item.
- Do NOT invent brands, quantities, units, or attributes. Use null or [] when a value is not clearly present in the OCR text.
- Only correct spelling when the intended grocery item is obvious, such as "Oreas" to "oreos". Lower confidence when you correct spelling.
- Normalize item names to lowercase, simple grocery names.
- Remove brand names from item and place them in descriptors.brand only when the brand is clearly present.
- Keep descriptors controlled. Use only descriptors.brand, descriptors.unit, descriptors.package, and descriptors.attributes.
- descriptors.brand is for brands only, or null.
- descriptors.unit is for standardized volume, weight, or count units only. Use consistent formatting such as 2 L, 500 ml, 250 g, 1 kg, 12 oz, 2 lb, or count. Use null if absent or unclear.
- descriptors.package is for packaging only, such as 12-pack, 6-pack, or multi-pack. Keep packaging separate from unit.
- descriptors.attributes is for meaningful non-brand descriptors, such as frozen, 2%, boneless, cherry, organic, low sodium, gluten free, block, shredded, or unsalted.
- Remove invalid attributes instead of keeping them, but do not be overly restrictive. Invalid attributes are OCR noise, broken words, obvious misspellings, or text that is clearly not useful for grocery product selection.
- Keep any recognizable grocery descriptor that could affect product matching, including flavor, form, preparation, fat/content, color, diet, texture, packaging style, variety, or product style. Examples include bbq, vanilla, cool ranch, cool blue, tall-boy, standard, shredded, block, frozen, boneless, 2%, no pulp, low sodium, organic, unsalted, and cherry.
- Do not create dynamic descriptor types.
- Remove redundant or unclear descriptors.
- Put purchase count in quantity. Read x2, x 2, 2x, qty 2, quantity 2, or "two" as quantity. Default quantity is 1.
- Do not treat pack counts, package sizes, percentages, carton counts, ounces, pounds, or gallons as quantity unless they clearly mean how many to buy.
- If quantity may be ambiguous, still include it but lower confidence.
- Use unit "count" for individual produce or individually counted items when no better unit is present, such as bananas x8 or apples x10. Reduce confidence for ambiguous produce counts.
- Keep item names generic and minimal. Move specific forms into attributes, such as "block" in "cheddar cheese block" and "frozen" in "frozen fries".
- Extract clear brands into descriptors.brand and remove brands from item. Normalize obvious branded products to generic item names when safe, such as "Nutella" -> item "hazelnut spread", brand "Nutella", and "Coca Cola" -> item "cola", brand "Coca Cola".
- If a generic item category is uncertain, keep the original item name but still separate the brand when the brand is clear.
- Confidence must be between 0 and 1. Use 0.95-1.0 for perfect matches, 0.75-0.9 for minor OCR fixes, 0.6-0.75 for moderate ambiguity, and below 0.6 for high uncertainty.
- Lower confidence when OCR spelling correction was required, OCR text is distorted, quantity is missing and assumed as 1, unit is inferred or unclear, the item required interpretation, or OCR noise such as trailing punctuation or stray characters was present.
- Set needs_review true when confidence is below 0.65, quantity is ambiguous, or OCR correction was significant.
- Build search_query from important attributes, package, unit, item, and brand when present. Keep it short, realistic, and cleanly spelled, exactly like a user would type into a grocery search box.
- If an OCR spelling mistake is obvious, correct it and include the corrected word in search_query, such as sugor -> sugar, milh -> milk, and chedder -> cheddar.
- If a word is too garbled to confidently correct, omit that word from search_query instead of passing the OCR error through.
- Preserve original_text exactly as copied from the OCR line. Do not clean, lowercase, correct, or rewrite original_text.
- Merge duplicate items only when they refer to the same item, same brand, same unit, same package, and same attributes. If merged, add quantities and put the exact original OCR lines in original_text separated by a newline.
- Keep separate items when brand, unit, package, or attributes differ.
- Keep descriptors that are part of the actual product identity in item when separating them would make the item wrong. For example, "hot dog bread" is the item, not bread with a hot dog attribute.
- For "2% Milk 2L", parse item "milk", quantity 1, descriptors.brand null, descriptors.unit "2 L", descriptors.package null, descriptors.attributes ["2%"], search_query "2% 2 L milk", and lower confidence slightly because quantity is assumed.
- For "Eggs 12-pack", parse item "eggs", quantity 1, descriptors.brand null, descriptors.unit "count", descriptors.package "12-pack", descriptors.attributes [], search_query "12-pack eggs", and lower confidence slightly because quantity is assumed.
- For "bananas x8", parse item "bananas", quantity 8, descriptors.unit "count", descriptors.package null, descriptors.attributes [], and reduce confidence because produce count may be ambiguous.
- For "cheddar cheese block", parse item "cheddar cheese", descriptors.attributes ["block"].
- For "frozen fries", parse item "fries", descriptors.attributes ["frozen"].
- For "Kraft Mac and Cheese x1", parse item "mac and cheese", descriptors.brand "Kraft", quantity 1, search_query "kraft mac and cheese".
- For "Nutella", parse item "hazelnut spread", descriptors.brand "Nutella", quantity 1.
- For "Unsalted Butter x1", parse item "butter", descriptors.brand null, descriptors.attributes ["unsalted"], quantity 1, search_query "unsalted butter".
- Return JSON matching the provided schema.`,
      },
      {
        role: "user",
        content: `Convert this grocery list into structured JSON cart instructions.

OCR text, preserving line breaks:
"""
${groceryText.trim()}
"""

Copy original_text from the matching OCR line exactly.`,
      },
    ],
    max_output_tokens: 2500,
    text: {
      format: {
        type: "json_schema",
        name: "grocery_cart_instructions",
        strict: true,
        schema: groceryListSchema,
      },
    },
  };

  const response = await fetch(RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`OpenAI returned a non-JSON response: ${responseText}`);
  }

  if (!response.ok) {
    const message = data.error?.message ?? responseText;
    throw new Error(`OpenAI request failed (${response.status}): ${message}`);
  }

  const outputText = getOutputText(data);
  if (!outputText.trim()) {
    throw new Error("OpenAI returned no parsed grocery-list text.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error(`OpenAI returned text that was not valid JSON: ${outputText}`);
  }

  if (!Array.isArray(parsed.items)) {
    throw new Error(`OpenAI response did not include an items array: ${outputText}`);
  }

  return cleanParsedItems(parsed);
}
