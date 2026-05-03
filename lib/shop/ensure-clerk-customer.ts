import { currentUser, auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";

import Customer from "@/database/customer.model";
import dbConnect from "@/lib/mongoose";

/**
 * Resolves the Mongo `Customer` id for the current Clerk session, creating or
 * linking a row (including legacy match by email) when needed.
 */
export async function getCustomerIdForClerkUser(): Promise<{
  customerId: string;
} | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }
  const u = await currentUser();
  if (!u) {
    return null;
  }

  await dbConnect();

  const byId = await Customer.findOne({ clerkUserId: userId });
  if (byId) {
    return { customerId: byId._id.toString() };
  }

  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
    ?.emailAddress;
  const email = (
    primary ??
    u.emailAddresses[0]?.emailAddress ??
    ""
  ).toLowerCase();

  if (email) {
    const legacy = await Customer.findOne({ email });
    if (legacy) {
      if (!legacy.clerkUserId) {
        legacy.clerkUserId = userId;
      }
      const fn = (u.firstName ?? "").trim();
      const ln = (u.lastName ?? "").trim();
      if (fn && !legacy.firstName) legacy.firstName = fn;
      if (ln && !legacy.lastName) legacy.lastName = ln;
      if (!legacy.buyerType) {
        legacy.buyerType = "individual";
      }
      await legacy.save();
      return { customerId: legacy._id.toString() };
    }
  }

  const firstName = (u.firstName ?? "").trim() || "Customer";
  const lastName = (u.lastName ?? "").trim() || " ";
  const uniqueEmail = email
    ? email
    : `clerk_${userId.replace(/[^a-zA-Z0-9]+/g, "_")}@clerk.user`;

  const created = await Customer.create({
    clerkUserId: userId,
    firstName,
    lastName,
    email: uniqueEmail,
    phone: "",
    tradeName: "",
    tinNumber: "",
    vatNumber: "",
    address: "",
    buyerType: "individual",
  });
  return { customerId: (created._id as Types.ObjectId).toString() };
}
