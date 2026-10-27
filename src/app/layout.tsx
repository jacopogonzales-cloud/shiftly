import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { Suspense } from "react";
import { CompanyName } from "@/components/company-name";
import { NavLinks } from "@/components/nav-links";
import { Wordmark } from "@/components/wordmark";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: { default: "Shiftly", template: "%s · Shiftly" },
  description: "Book the crew. Run the job. Pay everyone the same day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full md:grid md:grid-cols-[232px_1fr]">
        <aside className="border-line bg-bg flex flex-col border-b md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
          <div className="flex items-center justify-between px-5 py-4 md:py-6">
            <Wordmark />
          </div>
          <NavLinks />
          <div className="border-line mt-auto hidden border-t px-5 py-4 md:block">
            <p className="label">Company</p>
            <Suspense fallback={<div className="skeleton mt-2 h-4 w-36" />}>
              <CompanyName />
            </Suspense>
          </div>
        </aside>
        <main className="min-w-0">
          <div className="mx-auto max-w-[1440px] px-6 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
