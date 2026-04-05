const DEFAULT_IMAGE_URL =
  "https://images.unsplash.com/photo-1553484771-371a605b060b?w=400";

const KEYWORD_RULES: { keywords: string[]; url: string }[] = [
  {
    keywords: ["cable", "wire", "conductor"],
    url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
  },
  {
    keywords: ["switch", "socket", "plug", "outlet"],
    url: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400",
  },
  {
    keywords: ["light", "lamp", "bulb", "led", "fluorescent"],
    url: "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=400",
  },
  {
    keywords: ["solar", "panel", "flood"],
    url: "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400",
  },
  {
    keywords: ["pump", "water"],
    url: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400",
  },
  {
    keywords: ["meter", "board"],
    url: "https://images.unsplash.com/photo-1558002038-1055907df827?w=400",
  },
  {
    keywords: ["conduit", "pipe", "fitting", "gland"],
    url: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400",
  },
  {
    keywords: ["screw", "nail", "bolt", "nut", "washer", "ferule"],
    url: "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400",
  },
  {
    keywords: [
      "tool",
      "drill",
      "hammer",
      "wrench",
      "plier",
      "spanner",
      "grinder",
      "saw",
    ],
    url: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400",
  },
  {
    keywords: [
      "capacitor",
      "contactor",
      "transformer",
      "breaker",
      "fuse",
    ],
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400",
  },
  {
    keywords: ["tape", "glue", "cement", "solvent"],
    url: "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400",
  },
  {
    keywords: ["lock", "padlock", "key"],
    url: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400",
  },
  {
    keywords: ["paint", "brush"],
    url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400",
  },
];

/**
 * Returns a placeholder image URL from product name and standard code (keyword match, first wins).
 */
export function assignProductImage(name: string, standardCode: string): string {
  const haystack = `${name} ${standardCode}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        return rule.url;
      }
    }
  }
  return DEFAULT_IMAGE_URL;
}
