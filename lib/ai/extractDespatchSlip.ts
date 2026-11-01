import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { RawSlipLine } from "@/lib/pos/despatchLines";

export const DESPATCH_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageMime = (typeof DESPATCH_IMAGE_MIMES)[number];

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

const slipSchema = z.object({
  slip_number: nullableString,
  customer_name: nullableString,
  customer_tin: nullableString,
  customer_email: nullableString,
  currency: z.enum(["USD", "ZWG"]).nullable().optional(),
  prices_include_vat: z.boolean().nullable().optional(),
  items: z.array(
    z.object({
      code: nullableString,
      description: nullableString,
      qty: nullableNumber,
      unit_price: nullableNumber,
      total: nullableNumber,
    })
  ),
  grand_total: nullableNumber,
});

export type ExtractedDespatchSlip = {
  slipNumber: string | null;
  customerName: string | null;
  customerTin: string | null;
  customerEmail: string | null;
  currency: "USD" | "ZWG" | null;
  pricesIncludeVat: boolean | null;
  grandTotal: number | null;
  items: RawSlipLine[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const TOOL_NAME = "record_despatch_slip";

const SYSTEM = `You read photographs and scans of a Stores Despatch Slip: the delivery/despatch/dispatch note, invoice, quotation, waybill or pick list that lists the goods a customer is collecting from a hardware and lighting shop in Zimbabwe.
The layout is NOT fixed. Slips come from different systems and people: printed tables, dot-matrix, handwritten, stamped, photographed at an angle, rotated, creased, with columns in any order (code, description, qty, unit, price, discount, total can appear in any sequence), with or without prices, with or without codes, and sometimes in another language.
Always answer by calling the ${TOOL_NAME} tool exactly once, with no other text. If the image has no readable goods, return an empty items list and nulls. Rules:
- Work out each column from its heading or from the values themselves (a short alphanumeric token is a code, a small number is a quantity, a decimal with cents is a price or total). Do not assume a column order.
- items: one entry per product line, in slip order. Include every line that lists goods or a charge, even if the quantity or price is not shown. Skip table headers, page headers/footers, subtotals, VAT rows, carriage notes, signatures and blank rows. A description that wraps onto two lines is one item. If the slip continues over several pages in one photo, include all lines.
- Copy values as written; never invent or "fix" them, never calculate a missing value. Use null for anything not on the slip or not legible.
- code is the product/stock code on the line (string, keep leading zeros and letters). description is the product text without the code. qty is a number (the quantity despatched, not the quantity ordered, if both are shown). unit_price is the price per unit and total the amount for the line, as plain numbers with no currency symbol or thousands separator; read "1 234,50" and "1,234.50" as 1234.5.
- grand_total is the final amount due for the whole slip, if printed (the figure after VAT if VAT is added). slip_number is the slip/document/delivery note number if printed.
- prices_include_vat: true if the slip says prices include VAT, false if it says they exclude VAT or adds VAT at the bottom, null if it does not say.
- currency: "USD" or "ZWG" only if the slip shows it clearly (US$, $, USD, ZWG, ZiG), otherwise null.
- customer_name / customer_tin / customer_email: the customer the goods are for, only if printed.`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Record the contents of the despatch slip photograph.",
  input_schema: {
    type: "object",
    properties: {
      slip_number: { type: ["string", "null"] },
      customer_name: { type: ["string", "null"] },
      customer_tin: { type: ["string", "null"] },
      customer_email: { type: ["string", "null"] },
      currency: { type: ["string", "null"], enum: ["USD", "ZWG", null] },
      prices_include_vat: { type: ["boolean", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            qty: { type: ["number", "null"] },
            unit_price: { type: ["number", "null"] },
            total: { type: ["number", "null"] },
          },
          required: ["code", "description", "qty", "unit_price", "total"],
        },
      },
      grand_total: { type: ["number", "null"] },
    },
    required: ["slip_number", "items", "grand_total"],
  },
};

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

/** Send the slip photo to Claude and return its contents as typed data. Throws on any failure. */
export async function extractDespatchSlip(input: { image: Buffer; mime: string }): Promise<ExtractedDespatchSlip> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!(DESPATCH_IMAGE_MIMES as readonly string[]).includes(input.mime)) {
    throw new Error("Unsupported image type");
  }

  const model = process.env.DESPATCH_SCAN_MODEL?.trim() || "claude-sonnet-5-5";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    // Newer models refuse a forced tool_choice; the system prompt makes the call mandatory instead.
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mime as ImageMime, data: input.image.toString("base64") },
          },
          { type: "text", text: "Extract this despatch slip." },
        ],
      },
    ],
  });

  if (response.stop_reason === "max_tokens") throw new Error("The slip is too long to read in one go");
  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The model did not return slip data");

  const parsed = slipSchema.safeParse(block.input);
  if (!parsed.success) throw new Error("Could not understand the model's reply");
  const d = parsed.data;

  return {
    slipNumber: clean(d.slip_number),
    customerName: clean(d.customer_name),
    customerTin: clean(d.customer_tin),
    customerEmail: clean(d.customer_email),
    currency: d.currency ?? null,
    pricesIncludeVat: d.prices_include_vat ?? null,
    grandTotal: d.grand_total ?? null,
    items: d.items,
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
