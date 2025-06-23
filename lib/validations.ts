import { z } from "zod";

export const SignInSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Please provide a valid email address." }),

  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long. " })
    .max(100, { message: "Password cannot exceed 100 characters." }),
});

export const SignUpSchema = z.object({
  surname: z
    .string()
    .min(3, { message: "Surnname must be at least 3 characters long." })
    .max(30, { message: "Surname cannot exceed 30 characters." })
    .regex(/^[a-zA-Z0-9_]+$/, {
      message: "Surname can only contain letters, numbers, and underscores.",
    })
        ,

  name: z
    .string()
    .min(1, { message: "Name is required." })
    .max(50, { message: "Name cannot exceed 50 characters." })
    .regex(/^[a-zA-Z\s]+$/, {
      message: "Name can only contain letters and spaces.",
    }),
  store: z
    .string()
    .min(1, { message: "Store Name is required." })
    .max(50, { message: "Store Name cannot exceed 50 characters." })
    .regex(/^[a-zA-Z\s]+$/, {
      message: "Name can only contain letters and spaces.",
    }).optional(),

  email: z
    .string()
    .min(1, { message: "Email is required." })
    .email({ message: "Please provide a valid email address." }),

  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long." })
    .max(100, { message: "Password cannot exceed 100 characters." })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter.",
    })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter.",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number." })
    .regex(/[^a-zA-Z0-9]/, {
      message: "Password must contain at least one special character.",
    }),
  branchId: z.string().min(1, { message: "Branch ID is required" }).optional(),
  storeId: z.string().min(1, { message: "Store ID is required" }).optional(),

});

export const UserSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Name is required." })
    .max(50, { message: "Name cannot exceed 50 characters." })
    .regex(/^[a-zA-Z\s]+$/, {
      message: "Name can only contain letters and spaces.",
    }),
  surname: z
    .string()
    .min(3, { message: "Surname must be at least 3 characters long." })
    .max(30, { message: "Surname cannot exceed 30 characters." })
    .regex(/^[a-zA-Z0-9_]+$/, {
      message: "Surname can only contain letters, numbers, and underscores.",
    }),
  email: z
    .string()
    .min(1, { message: "Email is required." })
    .email({ message: "Please provide a valid email address." }),
  branchId: z.string().min(1, { message: "Branch ID is required" }).optional(),
  storeId: z.string().min(1, { message: "Store ID is required" }).optional(),

  image: z.string().url({ message: "Please provide a valid URL" }).optional(),
  location: z.string().optional(),
});

export const AccountSchema = z.object({
  userId: z.string().min(1, { message: "User ID is required." }),
  name: z.string().min(1, { message: "Name is required." }),
  image: z.string().url({ message: "Please provide a valid URL." }).optional(),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long." })
    .max(100, { message: "Password cannot exceed 100 characters." })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter.",
    })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter.",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number." })
    .regex(/[^a-zA-Z0-9]/, {
      message: "Password must contain at least one special character.",
    })
    .optional(),
  provider: z.string().min(1, { message: "Provider is required." }),
  providerAccountId: z
    .string()
    .min(1, { message: "Provider Account ID is required." }),
});

export const SignWithOauthSchema = z.object({
  provider: z.enum(["google", "github"]),
  providerAccountId: z
    .string()
    .min(1, { message: "Provider Account ID is required." }),
  user: z.object({
    name: z.string().min(1, { message: "Name is required." }),
    // username: z
    //   .string()
    //   .min(3, { message: "Username must be at least 3 characters long." }),
    email: z
      .string()
      .email({ message: "Please provide a valid email address." }),
    image: z
      .string()
      .url({ message: "Please provide a valid URL." })
      .optional(),
  }),
});

export const PaginatedSearchParamsSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().default(10),
  query: z.string().optional(),
  filter: z.string().optional(),
  sort: z.string().optional(),
});

export const GetTagQuestionsSchema = PaginatedSearchParamsSchema.extend({
  tagId: z.string().min(1, { message: "Tag ID is required" }),
});

const fileSizeLimit = 100 * 1024 * 1024; // 100MB
// Document Schema
export const uploadProductsSchema = z.object({
  file:
  z
.instanceof(File)
  .refine((file) => file.type === "text/plain", {
    message: "Only .txt files are allowed",
  })
  .refine((file) => file.size <= fileSizeLimit, {
    message: "File size should not exceed 100MB",
  })
})


export const AddBranchSchema = z.object({
  name: z
    .string()
    .min(3, { message: "Branch name must be at least 3 characters long." })
    .max(30, { message: "Branch name cannot exceed 30 characters." })
    .regex(/^[a-zA-Z\s]+$/, {
      message: "Branch name can only contain letters and spaces.",
    }),

  location: z
    .string()
    .min(1, { message: "Location is required." })
    .max(50, { message: "Location cannot exceed 50 characters." })
    .regex(/^[a-zA-Z\s]+$/, {
      message: "Location can only contain letters and spaces.",
    }),




});

export const GetBranchesByStoreSchema = z.object({
  storeId: z.string().min(1, "Question ID is required"),
});


export const GetUserSchema = z.object({
  userId: z.string().min(1, { message: "User ID is required" }),
});


export const CreateUserSchema = z.object({
  surname: z
    .string()
    .min(3, { message: "Surnname must be at least 3 characters long." })
    .max(30, { message: "Surname cannot exceed 30 characters." })
    .regex(/^[a-zA-Z0-9_]+$/, {
      message: "Surname can only contain letters, numbers, and underscores.",
    })
        ,

  name: z
    .string()
    .min(1, { message: "Name is required." })
    .max(50, { message: "Name cannot exceed 50 characters." })
    .regex(/^[a-zA-Z\s]+$/, {
      message: "Name can only contain letters and spaces.",
    }),

  email: z
    .string()
    .min(1, { message: "Email is required." })
    .email({ message: "Please provide a valid email address." }),

  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long." })
    .max(100, { message: "Password cannot exceed 100 characters." })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter.",
    })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter.",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number." })
    .regex(/[^a-zA-Z0-9]/, {
      message: "Password must contain at least one special character.",
    }),

  branchId: z.string().min(1, { message: "Branch ID is required" }),
  storeId: z.string().min(1, { message: "Store ID is required" }).optional(),

});


export const GlobalSearchSchema = z.object({
  query: z.string(),
  type: z.string().nullable().optional(),
});