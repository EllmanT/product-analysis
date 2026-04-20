import { shopInvoicesListGET } from "@/lib/shop/shop-invoices-list-get";

export async function GET(request: Request) {
  return shopInvoicesListGET(request);
}
