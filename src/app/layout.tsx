import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { Toaster } from "@/components/toast";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Shiftly", template: "%s · Shiftly" },
  description: "Book the crew. Run the job. Pay everyone the same day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
