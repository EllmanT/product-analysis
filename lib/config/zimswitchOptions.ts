export const ZIMSWITCH_PAYMENT_OPTIONS = {
  visa_master_usd: {
    label: "Visa / Mastercard (USD)",
    entityId: process.env.ZIMSWITCH_ENTITY_VISA_MASTER_USD!,
    dataBrands: "VISA MASTER",
    currency: "USD",
  },
  zimswitch_usd: {
    label: "ZimSwitch (USD)",
    entityId: process.env.ZIMSWITCH_ENTITY_ZIMSWITCH_USD!,
    dataBrands: "PRIVATE_LABEL",
    currency: "USD",
  },
  zimswitch_zig: {
    label: "ZimSwitch (ZIG)",
    entityId: process.env.ZIMSWITCH_ENTITY_ZIMSWITCH_ZIG!,
    dataBrands: "PRIVATE_LABEL",
    currency: "ZIG",
  },
} as const;

export type ZimswitchPaymentOptionKey = keyof typeof ZIMSWITCH_PAYMENT_OPTIONS;

export function isValidPaymentOption(key: string): key is ZimswitchPaymentOptionKey {
  return key in ZIMSWITCH_PAYMENT_OPTIONS;
}
