import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import PrivyProviderWrapper from "@/components/PrivyProviderWrapper";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AutoAllocator — AI DeFi Capital Router",
  description:
    "Chat your goal. AI allocates USDC across reputation-verified ERC-8004 agents on Base Sepolia — you approve every move.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", geistSans.variable, geistMono.variable)}>
      <body className="antialiased">
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}
