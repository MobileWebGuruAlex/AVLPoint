import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Aurora } from "@/components/aurora";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-16">
      <Aurora />
      <div className="bg-grid bg-radial-fade absolute inset-0" aria-hidden="true" />
      <AuthForm mode="signup" />
    </div>
  );
}
