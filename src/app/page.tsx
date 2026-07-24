// The front door: a cinematic, scroll-driven introduction to AVLpoint.
// Everything beyond "Enter AVLpoint" lives in the (site) route group.
import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: { absolute: "AVLpoint — Intelligent Vendor Management" },
  description:
    "A cinematic introduction to AVLpoint: vendor qualification, compliance, and asset verification unified in one intelligent platform — for enterprises, vendors, and inspectors.",
};

export default function Page() {
  return <Landing />;
}
