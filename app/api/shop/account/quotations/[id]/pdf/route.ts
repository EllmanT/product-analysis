import { shopQuotationPdfGET } from "@/lib/shop/shop-quotation-pdf-get";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return shopQuotationPdfGET(request, context);
}
