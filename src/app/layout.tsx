// AVLpoint root layout — fonts, theme, and global metadata only.
// Site chrome (navbar/footer) lives in (site)/layout.tsx so the cinematic
// landing at "/" can own the entire viewport.
import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL("https://avlpoint.com"),
  title: {
    default: "AVLpoint — AI-powered industrial vendor discovery",
    template: "%s · AVLpoint",
  },
  description:
    "Find the right industrial vendor in seconds. 85,000+ fabricators, machine shops, and manufacturers — verified against 14 authoritative sources and enriched by AI.",
  keywords: [
    "vendor discovery",
    "supplier search",
    "approved vendor list",
    "metal fabrication",
    "industrial procurement",
    "AI vendor search",
  ],
  openGraph: {
    title: "AVLpoint — AI-powered industrial vendor discovery",
    description:
      "85,000+ industrial vendors, verified against 14 authoritative sources and enriched by AI.",
    url: "https://avlpoint.com",
    siteName: "AVLpoint",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AVLpoint — AI-powered industrial vendor discovery",
    description: "Precision vendor intelligence for industrial procurement.",
  },
};

// Applies the stored theme before first paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem("avl-theme");if(t==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
