// Site chrome — navbar, footer, and page scaffolding for every route
// except the cinematic landing at "/", which owns the full viewport.
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ScrollProgress } from "@/components/scroll-progress";
import { CookieConsent } from "@/components/cookie-consent";
import { ChatWidget } from "@/components/chat-widget";
import { getSession } from "@/lib/auth";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <ScrollProgress />
      <Navbar sessionName={session?.name ?? null} />
      <main className="min-h-screen pt-16">{children}</main>
      <Footer />
      <CookieConsent />
      <ChatWidget />
    </>
  );
}
