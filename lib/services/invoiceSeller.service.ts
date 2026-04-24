import type { Session } from "next-auth";
import type { Types } from "mongoose";

import Store, { type IStore } from "@/database/store.model";
import User, { type IUser } from "@/database/user.model";
import dbConnect from "@/lib/mongoose";

type UserLean = IUser & { _id: Types.ObjectId };
type StoreLean = Pick<IStore, "name"> & { _id: Types.ObjectId };

export type InvoiceSeller = {
  legalName: string;
  tradeName: string;
  tin: string;
  vatNumber: string;
  address: string;
  phone: string;
  email: string;
  region: string;
  city: string;
};

function sellerFromEnv(): InvoiceSeller {
  return {
    legalName: process.env.INVOICE_COMPANY_LEGAL_NAME ?? "",
    tradeName: process.env.INVOICE_COMPANY_TRADE_NAME ?? "",
    tin: process.env.INVOICE_COMPANY_TIN ?? "",
    vatNumber: process.env.INVOICE_COMPANY_VAT_NUMBER ?? "",
    address: process.env.INVOICE_COMPANY_ADDRESS ?? "",
    phone: process.env.INVOICE_COMPANY_PHONE ?? "",
    email: process.env.INVOICE_COMPANY_EMAIL ?? "",
    region: process.env.INVOICE_COMPANY_REGION ?? "",
    city: process.env.INVOICE_COMPANY_CITY ?? "",
  };
}

/**
 * Seller block for admin invoice views: logged-in user's store + profile, with env filling tax/address gaps.
 */
export async function getSellerForAdminSession(
  session: Session | null
): Promise<InvoiceSeller> {
  const env = sellerFromEnv();
  const userId = session?.user?.id;
  if (!userId) return env;

  await dbConnect();
  const user = await User.findById(userId).lean<UserLean | null>();
  if (!user) return env;

  const person = `${user.name} ${user.surname}`.trim();
  let storeName = "";
  if (user.storeId) {
    const store = await Store.findById(user.storeId)
      .select("name")
      .lean<StoreLean | null>();
    storeName = store?.name?.trim() ?? "";
  }

  const tradeName = (env.tradeName?.trim() || "") || storeName || person;
  const legalName = (env.legalName?.trim() || "") || storeName || person;

  return {
    legalName,
    tradeName,
    tin: env.tin,
    vatNumber: env.vatNumber,
    address: env.address,
    phone: env.phone,
    email: (env.email?.trim() || "") || user.email?.trim() || "",
    region: env.region,
    city: env.city,
  };
}

/**
 * Customer-facing invoice: prefer first admin user linked to a store (same business), else env-only.
 */
export async function getSellerForPublicInvoice(): Promise<InvoiceSeller> {
  const env = sellerFromEnv();
  await dbConnect();
  const admin = await User.findOne({
    role: "admin",
    storeId: { $exists: true, $ne: null },
  })
    .select("storeId email name surname")
    .lean<UserLean | null>();

  if (!admin?.storeId) return env;

  const store = await Store.findById(admin.storeId)
    .select("name")
    .lean<StoreLean | null>();
  const storeName = store?.name?.trim() ?? "";
  const person = `${admin.name} ${admin.surname}`.trim();
  const tradeName = (env.tradeName?.trim() || "") || storeName || person;
  const legalName = (env.legalName?.trim() || "") || storeName || person;

  return {
    legalName,
    tradeName,
    tin: env.tin,
    vatNumber: env.vatNumber,
    address: env.address,
    phone: env.phone,
    email: (env.email?.trim() || "") || admin.email?.trim() || "",
    region: env.region,
    city: env.city,
  };
}
