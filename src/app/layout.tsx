import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PIT Inspection",
  description: "Warehouse vehicle pre-shift inspection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
        <footer className="flex shrink-0 justify-center border-t border-gray-100 bg-white py-3">
          <Image
            src="/lx-pantos-logo.png"
            alt="LX Pantos"
            width={100}
            height={28}
            className="opacity-70"
          />
        </footer>
      </body>
    </html>
  );
}
