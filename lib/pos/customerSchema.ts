import { z } from "zod";

const optional = (max: number) => z.string().trim().max(max).optional();

export const CustomerFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  tradeName: optional(200),
  tin: optional(40),
  vatNumber: optional(40),
  address: optional(300),
  city: optional(100),
  phone: optional(40),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
};

export const CustomerCreateSchema = z.object(CustomerFields).strict();
export const CustomerPatchSchema = z.object({ ...CustomerFields, name: CustomerFields.name.optional(), isActive: z.boolean().optional() }).strict();
