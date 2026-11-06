import RoleMenu from "@/database/roleMenu.model";
import { CONFIGURABLE_ROLE, configurableUrls } from "@/lib/auth/menu-access";
import dbConnect from "@/lib/mongoose";

/** Pages hidden from branch managers. Unknown or retired urls are ignored so a renamed page never breaks the menu. */
export async function getHiddenUrls(): Promise<string[]> {
  await dbConnect();
  const doc = await RoleMenu.findOne({ role: CONFIGURABLE_ROLE }).lean<{ hiddenUrls?: string[] } | null>();
  return (doc?.hiddenUrls ?? []).filter((u) => configurableUrls.has(u));
}

export async function setHiddenUrls(urls: string[], userId: string): Promise<string[]> {
  await dbConnect();
  const clean = [...new Set(urls)].filter((u) => configurableUrls.has(u));
  await RoleMenu.updateOne({ role: CONFIGURABLE_ROLE }, { $set: { hiddenUrls: clean, updatedBy: userId } }, { upsert: true });
  return clean;
}
