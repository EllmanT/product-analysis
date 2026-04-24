import { extractLineItemsFromDocument } from "@/lib/shop/extractDocumentItems";
import { matchExtractedLine } from "@/lib/shop/matchExtractedLine";
import type {
  DocumentMatchRow,
  DocumentMatchSuccessResponse,
} from "@/types/shop-document-match";
import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_PDF_TEXT_CHARS = 12;

function isImageMime(m: string): boolean {
  return /^image\/(jpeg|png|webp|gif)$/i.test(m);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Document matching is not configured. Set OPENAI_API_KEY on the server.",
        },
        { status: 503 }
      );
    }

    await dbConnect();

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing file field (multipart form)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "File is too large (max 8 MB)." },
        { status: 413 }
      );
    }

    const mime = (file.type || "application/octet-stream").toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let items: Awaited<ReturnType<typeof extractLineItemsFromDocument>>;

    if (mime === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      let pdfText = "";
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const textResult = await parser.getText();
        pdfText = typeof textResult.text === "string" ? textResult.text : "";
      } catch {
        return NextResponse.json(
          {
            success: false,
            error:
              "Could not read this PDF. Try another file or upload a clear photo of the page.",
          },
          { status: 422 }
        );
      } finally {
        await parser.destroy().catch(() => undefined);
      }

      const trimmed = pdfText.replace(/\s+/g, " ").trim();
      if (trimmed.length < MIN_PDF_TEXT_CHARS) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This PDF has very little readable text (it may be scanned). Upload a photo of the page or use a text-based PDF.",
          },
          { status: 422 }
        );
      }

      items = await extractLineItemsFromDocument({
        mode: "text",
        text: trimmed.slice(0, 48_000),
      });
    } else if (isImageMime(mime)) {
      const b64 = buffer.toString("base64");
      items = await extractLineItemsFromDocument({
        mode: "image",
        imageBase64: b64,
        imageMime: mime,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported file type. Use an image (JPEG, PNG, WebP, GIF) or PDF.",
        },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not find a product list in this file. Try a clearer image or a simpler layout.",
        },
        { status: 422 }
      );
    }

    const rows: DocumentMatchRow[] = [];

    for (let i = 0; i < items.length; i++) {
      const extracted = {
        description: items[i].description.trim() || items[i].rawLine.trim(),
        quantity:
          typeof items[i].quantity === "number" && Number.isFinite(items[i].quantity)
            ? Math.max(1, Math.round(items[i].quantity as number))
            : null,
        unit: items[i].unit?.trim() || null,
        skuOrCode: items[i].skuOrCode?.trim() || null,
        rawLine: items[i].rawLine.trim(),
      };

      const m = await matchExtractedLine(extracted);
      rows.push({
        index: i,
        extracted,
        status: m.status,
        confidence: m.confidence,
        reason: m.reason,
        match: m.match,
        alternates: m.alternates,
      });
    }

    const body: DocumentMatchSuccessResponse = { success: true, rows };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "Document processing failed.";
    const safe =
      /api\s*key|401|403|invalid[_\s]?key|authentication/i.test(raw) ||
      raw.length > 280
        ? "Document processing failed. Try again in a moment."
        : raw;
    return NextResponse.json({ success: false, error: safe }, { status: 500 });
  }
}
