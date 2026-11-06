"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createManagedUser } from "@/lib/actions/user-admin.action";
import { CreateManagedUserSchema } from "@/lib/validations";

type FormValues = z.infer<typeof CreateManagedUserSchema>;

const ROLE_HINT: Record<FormValues["role"], string> = {
  cashier: "Can only use the till of their branch.",
  branch_user: "Sees their own branch's data and can issue credit notes.",
  admin: "Full access to every branch and all settings.",
};

export function AddUserDialog({ branches, onCreated }: { branches: Branch[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(CreateManagedUserSchema),
    defaultValues: { email: "", password: "", name: "", surname: "", role: "cashier", branchId: "" },
  });
  const role = form.watch("role");

  async function submit(values: FormValues) {
    const res = await createManagedUser({ ...values, branchId: values.branchId || undefined });
    if (!res.success) {
      const fields = res.error?.details as Record<string, string[]> | undefined;
      if (fields) {
        for (const [k, msgs] of Object.entries(fields)) {
          if (k in values && msgs?.[0]) form.setError(k as keyof FormValues, { message: msgs[0] });
        }
      }
      toast.error(res.error?.message ?? "Could not add the user.");
      return;
    }
    toast.success("User added", { description: `${values.email} can now sign in.` });
    form.reset();
    setOpen(false);
    onCreated();
  }

  const text = (name: "name" | "surname" | "email" | "password", label: string, type = "text") => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete={name === "password" ? "new-password" : "off"} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add User</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogTitle>Add a user</DialogTitle>
        <DialogDescription>They sign in with this email and password. You can change their role or branch later.</DialogDescription>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            {text("email", "Email Address")}
            {text("password", "Password", "password")}
            <div className="grid grid-cols-2 gap-3">
              {text("name", "Name")}
              {text("surname", "Surname")}
            </div>
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cashier">Cashier (POS)</SelectItem>
                      <SelectItem value="branch_user">Branch user</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="branchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch{role === "admin" ? " (optional)" : ""}</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Branch">
                        <SelectValue placeholder="Select a branch" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b._id} value={b._id}>
                          {b.name}
                          {b.location ? `, ${b.location}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Adding…" : "Add user"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
