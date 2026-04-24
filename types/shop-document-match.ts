/** Shop catalog row returned from document-match API (matches ProductCard shape). */
export type ShopProductMatchRow = {
  _id: string;
  name: string;
  standardCode: string;
  price: string | null;
  quantityAvailable: number;
  imageUrl?: string | null;
};

export type DocumentMatchConfidence = "high" | "medium" | "low";

export type ExtractedLine = {
  description: string;
  quantity: number | null;
  unit: string | null;
  skuOrCode: string | null;
  rawLine: string;
};

export type DocumentMatchRow = {
  index: number;
  extracted: ExtractedLine;
  status: "matched" | "unavailable";
  confidence: DocumentMatchConfidence | null;
  reason?: string;
  match: ShopProductMatchRow | null;
  alternates: ShopProductMatchRow[];
};

export type DocumentMatchSuccessResponse = {
  success: true;
  rows: DocumentMatchRow[];
};

export type DocumentMatchErrorResponse = {
  success: false;
  error: string;
};
