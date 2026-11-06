import { readFileSync, writeFileSync } from "fs";

const sample = JSON.parse(readFileSync(new URL("./products-all.json", import.meta.url), "utf-8"));
const catalog = JSON.parse(readFileSync(new URL("./electrosales-catalog.json", import.meta.url), "utf-8"));

// --- abbreviation expansion dictionary, built from tokens actually observed in Data.txt ---
const ABBR = [
  [/\bS\/C\b/gi, "single core"],
  [/\bF\/T\b/gi, "flat twin"],
  [/\bD\/L\b/gi, "downlight"],
  [/\bC\/FERULE\b/gi, "crimping ferrule"],
  [/\bFERULE\b/gi, "ferrule"],
  [/\bW\/S\b/gi, ""], // packaging qualifier (whole sleeve/pack) - not part of product identity
  [/\bOF\b/gi, ""], // offcut/remnant stock qualifier - noise for matching
  [/\bDC\b/gi, "double core"],
  [/\bSQ\b/gi, "square"],
  [/\bBX\b/gi, "box"],
  [/\bMT\b/gi, "meter"],
  [/\bB\/O\b/gi, "blackout"],
  [/\bPLUGTOP\b/gi, "plug top"],
  [/\bMULTI ADAPTOR\b/gi, "multi adaptor"],
  [/\bIMMERSION\b/gi, "immersion heater"],
  [/\bEXT\b/gi, "extension"],
  [/\bCUF\b/gi, "uf capacitor"],
  [/\bMCB\b/gi, "circuit breaker"],
  [/\bDB\b/gi, "distribution board"],
  [/\(\d+\)/g, ""], // pack-size qualifiers like (10)
];

function normalize(text) {
  let t = (text || "").toUpperCase();
  for (const [re, rep] of ABBR) t = t.replace(re, rep.toUpperCase());
  t = t.replace(/[^A-Z0-9 ]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function tokenize(text) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((t) => t.length > 1)
  );
}

// pull out spec tokens like "100UF", "10MM", "15A", "5M", "60W" so we can require
// the matched product to actually share the same rating/size, not just the same category words
const SPEC_RE = /\b(\d+(?:\.\d+)?)\s*(UF|MM|MF|A|AMP|W|KW|V|M|MT|KVA|KVAR)\b/gi;
function specTokens(text) {
  const specs = new Set();
  for (const m of (text || "").toUpperCase().matchAll(SPEC_RE)) {
    let unit = m[2];
    if (unit === "MT") unit = "M";
    if (unit === "AMP") unit = "A";
    specs.add(`${parseFloat(m[1])}${unit}`);
  }
  return specs;
}

// build catalog token index once
const catalogIndexed = catalog.map((p) => {
  const specText = (p.specifications || []).map((s) => `${s.value}${s.name}`).join(" ");
  const text = [p.name, p.st_ldesc, p.brand?.name, specText].filter(Boolean).join(" ");
  return { product: p, tokens: tokenize(text), specs: specTokens(text) };
});

function jaccardScore(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersect = 0;
  for (const t of setA) if (setB.has(t)) intersect++;
  const union = setA.size + setB.size - intersect;
  return intersect / union;
}

function bestMatch(sampleTokens, sampleSpecs) {
  // track the best candidate overall, and separately the best candidate whose specs agree
  let bestOverall = null;
  let bestOverallScore = 0;
  let bestSpecMatch = null;
  let bestSpecScore = 0;
  for (const entry of catalogIndexed) {
    const score = jaccardScore(sampleTokens, entry.tokens);
    if (score > bestOverallScore) {
      bestOverallScore = score;
      bestOverall = entry.product;
    }
    if (sampleSpecs.size > 0 && [...sampleSpecs].some((s) => entry.specs.has(s)) && score > bestSpecScore) {
      bestSpecScore = score;
      bestSpecMatch = entry.product;
    }
  }
  if (sampleSpecs.size === 0) {
    return { best: bestOverall, score: bestOverallScore, specOk: true };
  }
  if (bestSpecMatch) {
    return { best: bestSpecMatch, score: bestSpecScore, specOk: true };
  }
  // no candidate agreed on spec - surface the best text match anyway but mark it unverified
  return { best: bestOverall, score: bestOverallScore, specOk: false };
}

function tier(score, hasSpec, specOk) {
  if (hasSpec && !specOk) return "low"; // spec mismatch caps confidence regardless of text score
  if (score >= 0.45) return "high";
  if (score >= 0.25) return "medium";
  if (score > 0) return "low";
  return "none";
}

const results = sample.map((p) => {
  const combinedText = p.description;
  const sampleTokens = tokenize(combinedText);
  const sampleSpecs = specTokens(combinedText);
  const { best, score, specOk } = bestMatch(sampleTokens, sampleSpecs);
  return {
    code: p.code,
    description: p.description,
    category: p.category,
    normalized: normalize(combinedText),
    specs: [...sampleSpecs],
    match: best
      ? {
          name: best.name,
          st_ldesc: best.st_ldesc,
          sku: best.sku,
          image: best.images?.[0] || null,
          price: best.price,
          brand: best.brand?.name,
          department: best._department,
          score: Number(score.toFixed(3)),
        }
      : null,
    confidence: tier(score, sampleSpecs.size > 0, specOk),
  };
});

const counts = { high: 0, medium: 0, low: 0, none: 0 };
for (const r of results) counts[r.confidence]++;

console.log("Match confidence breakdown (sample of", results.length, "):");
console.log(counts);
console.log(
  `Usable (high+medium): ${counts.high + counts.medium} / ${results.length} = ${(
    ((counts.high + counts.medium) / results.length) *
    100
  ).toFixed(1)}%`
);

writeFileSync(new URL("./match-results-full.json", import.meta.url), JSON.stringify(results, null, 2));
