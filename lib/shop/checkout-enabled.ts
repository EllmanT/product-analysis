export function isShopCheckoutEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED === "true";
}
