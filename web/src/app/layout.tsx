import type { Metadata } from "next";
import {
  Instrument_Sans,
  Work_Sans,
  Pixelify_Sans
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { DashboardLayout } from "@/layouts/DashboardLayout";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work",
});

const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "Davy | High-Fidelity Trading",
  description: "Advanced Sui DeFi Trading Interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${workSans.variable} ${pixelifySans.variable} antialiased bg-background text-foreground font-sans`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
