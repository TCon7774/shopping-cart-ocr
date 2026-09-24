const MATCH_THRESHOLD = 3;

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/[^a-z0-9%]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function getAiAttributes(aiItem) {
  const descriptors = aiItem.descriptors ?? {};
  return [
    ...(descriptors.attributes ?? aiItem.attributes ?? []),
    descriptors.package,
    descriptors.unit === "count" ? null : descriptors.unit,
  ].filter(Boolean);
}

function getAiBrand(aiItem) {
  return aiItem.descriptors?.brand ?? aiItem.brand ?? null;
}

function getNameMatch(aiName, productNames) {
  let matched = false;
  let exact = false;

  for (const productName of productNames) {
    if (productName === aiName) {
      return { matched: true, exact: true };
    }

    if (productName.includes(aiName) || aiName.includes(productName)) {
      matched = true;
    }
  }

  return { matched, exact };
}

function brandMatches(aiBrand, productBrand) {
  if (!aiBrand) {
    return false;
  }

  return productBrand.includes(aiBrand) || aiBrand.includes(productBrand);
}

function countAttributeMatches(aiAttributes, productAttributes) {
  return aiAttributes.filter((attribute) => {
    const normalizedAttribute = normalize(attribute);
    return productAttributes.some(
      (productAttribute) =>
        productAttribute.includes(normalizedAttribute) ||
        normalizedAttribute.includes(productAttribute),
    );
  }).length;
}

export function matchProduct(aiItem, products) {
  const aiName = normalize(aiItem.item);
  const aiBrand = normalize(getAiBrand(aiItem));
  const aiAttributes = getAiAttributes(aiItem).map(normalize).filter(Boolean);

  let bestProduct = null;
  let bestScore = 0;
  let bestTieBreaker = 0;

  for (const product of products) {
    let score = 0;
    let tieBreaker = 0;
    const productNames = [product.name, ...(product.aliases ?? [])].map(normalize);
    const productBrand = normalize(product.brand);
    const productAttributes = (product.attributes ?? []).map(normalize).filter(Boolean);
    const nameMatch = getNameMatch(aiName, productNames);

    if (nameMatch.matched) {
      score += 5;
      tieBreaker += nameMatch.exact ? 2 : 1;
    }

    if (brandMatches(aiBrand, productBrand)) {
      score += 3;
    }

    score += countAttributeMatches(aiAttributes, productAttributes);

    if (score > bestScore || (score === bestScore && tieBreaker > bestTieBreaker)) {
      bestScore = score;
      bestTieBreaker = tieBreaker;
      bestProduct = product;
    }
  }

  if (bestScore < MATCH_THRESHOLD) {
    return null;
  }

  return {
    product: bestProduct,
    score: bestScore,
  };
}
