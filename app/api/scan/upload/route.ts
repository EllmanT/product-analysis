import { NextResponse, after } from "next/server";

import { DESPATCH_IMAGE_MIMES } from "@/lib/ai/extractDespatchSlip";
import { checkPairing, MAX_PAIRED_UPLOADS_PER_HOUR, pairedUploadsLastHour } from "@/lib/pos/despatchPairingAccess";
import { createDespatchScan, DespatchScanError, MAX_SLIP_IMAGE_BYTES, processDespatchScan } from "@/lib/services/despatchScan.service";
import { TillError } from "@/lib/services/posTill.service";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (message: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, message, ...extra }, { status });

/** Public: a paired phone uploads a slip photo. Authorised by the pairing token in the form, not a session. */
export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return fail("Send the photo as form data", 400);

    const token = form.get("token");
    const paired = await checkPairing(typeof token === "string" ? token : null);
    if (!paired.ok) return fail(paired.message, paired.status);
    const { claims } = paired;

    const file = form.get("image");
    if (!(file instanceof File)) return fail("Take a photo first", 400);
    if (!(DESPATCH_IMAGE_MIMES as readonly string[]).includes(file.type)) return fail("Use a JPEG, PNG or WebP photo", 415);
    if (file.size > MAX_SLIP_IMAGE_BYTES) return fail("The photo is too large. Try again.", 413);

    if ((await pairedUploadsLastHour(claims)) >= MAX_PAIRED_UPLOADS_PER_HOUR) {
      return fail("Too many photos in the last hour. Ask the cashier to scan the slips at the till.", 429);
    }

    const { scanId } = await createDespatchScan({
      branchId: claims.branchId,
      tillId: claims.tillId,
      userId: claims.userId,
      image: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
    });
    after(async () => {
      await processDespatchScan(scanId);
    });
    return NextResponse.json({ success: true, data: { id: scanId, status: "processing" } }, { status: 202 });
  } catch (error) {
    if (error instanceof DespatchScanError) {
      return fail(error.message, error.status, error.existingScanId ? { existingScanId: error.existingScanId } : undefined);
    }
    if (error instanceof TillError) return fail(error.message, error.status);
    return fail("Could not upload the photo. Try again.", 500);
  }
}
