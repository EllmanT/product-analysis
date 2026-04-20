import { shopQuotationsListGET } from "@/lib/shop/shop-quotations-list-get";

export async function GET(request: Request) {
  return shopQuotationsListGET(request);
}
