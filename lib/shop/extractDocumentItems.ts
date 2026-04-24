import OpenAI from "openai";
import { z } from "zod";

const itemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  skuOrCode: z.string().nullable(),
  rawLine: z.string(),
});

const extractSchema = z.object({
  items: z.array(itemSchema).max(50),
});

export type ExtractedDocumentItem = z.infer<typeof itemSchema>;

export async function extractLineItemsFromDocument(input: {
  mode: "text" | "image";
  text?: string;
  imageBase64?: string;
  imageMime?: string;
}): Promise<ExtractedDocumentItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_DOCUMENT_MODEL?.trim() || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });

  const system = `You extract product line items from quotations, invoices, packing lists, or shopping lists (including messy handwriting-style text).
Respond with JSON only: an object with key "items" (array, max 50 entries).
Each item must have: "description" (product name or main text), "quantity" (number or null), "unit" (string or null), "skuOrCode" (code/SKU if visible, else null), "rawLine" (best-effort verbatim source line).
Omit section headers, totals-only rows, delivery notes, and blank lines.`;

  const userMessage: OpenAI.Chat.ChatCompletionMessageParam =
    input.mode === "image" &&
    input.imageBase64 &&
    input.imageMime?.startsWith("image/")
      ? {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract product line items from this image.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.imageMime};base64,${input.imageBase64}`,
              },
            },
          ],
        }
      : {
          role: "user",
          content: `Extract product line items from this document text:\n\n${input.text ?? ""}`,
        };

  const completion = await openai.chat.completions.create({
    model,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, userMessage],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty model response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Model returned invalid JSON");
  }

  const result = extractSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Could not parse extracted items");
  }

  return result.data.items.filter(
    (it) => it.description.trim().length > 0 || it.rawLine.trim().length > 0
  );
}
