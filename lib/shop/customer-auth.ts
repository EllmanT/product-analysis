import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { getCustomerIdForClerkUser } from "./ensure-clerk-customer";
import { verifyShopJwt } from "./jwt";

const SHOP_COOKIE = "shop_token";

export async function getShopCustomerIdFromCookies(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SHOP_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyShopJwt(token);
  return payload?.sub ?? null;
}

/**
 * Prefers the signed-in Clerk user (and upserted/linked `Customer` row);
 * falls back to legacy `shop_token` JWT.
 */
export async function getShopCustomerIdForRequest(): Promise<string | null> {
  const { userId } = await auth();
  if (userId) {
    const r = await getCustomerIdForClerkUser();
    if (r) {
      return r.customerId;
    }
  }
  return getShopCustomerIdFromCookies();
}
