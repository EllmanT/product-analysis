import { cookies } from "next/headers";

import { verifyShopJwt } from "./jwt";

const SHOP_COOKIE = "shop_token";

export async function getShopCustomerIdFromCookies(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SHOP_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyShopJwt(token);
  return payload?.sub ?? null;
}
