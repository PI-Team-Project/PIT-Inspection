import type { Metadata } from "next";
import Image from "next/image";
import { Inter, Geist_Mono } from "next/font/google";
import ScrollPreserver from "./ScrollPreserver";
import "./globals.css";

// Inter over the previous (unused — body{} was hardcoded to Arial) Geist
// Sans: built for UI legibility at small sizes, with tighter horizontal
// metrics than Geist so dense screens like the dashboard don't run out of
// room as quickly.
const inter = Inter({
  variable: "--font-inter",
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

// Runs in <head> before first paint, so night mode never flashes light
// first. A saved Day/Night choice (ThemeToggle) wins; otherwise it follows
// the device setting, live.
const THEME_SCRIPT = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("theme")}catch(e){}document.documentElement.setAttribute("data-theme",t==="dark"||t==="light"?t:m.matches?"dark":"light")}a();m.addEventListener("change",a)}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden">
        {/* Setting only overflow-y (not overflow-x) makes the x-axis
            compute to "auto" per spec, not "visible" — any content that's
            even 1px too wide turns this into a horizontally pannable div
            despite html's overflow-x-hidden, which only guards the root.
            overscroll-none kills the iOS rubber-band bounce past the top/
            bottom edge — scrolling stops exactly where the content ends
            instead of springing past it. */}
        <div id="app-scroll-container" className="flex-1 overflow-x-hidden overflow-y-auto overscroll-none">
          <ScrollPreserver />
          {children}
        </div>
        <footer className="flex shrink-0 justify-center border-t border-gray-100 bg-white py-0.5">
          <Image
            src="/lx-pantos-logo.png"
            alt="LX Pantos"
            width={100}
            height={28}
            // The grey wordmark disappears on the dark footer; inverting
            // lightens it, and the hue turn puts the red mark back near red.
            className="opacity-70 dark:invert dark:hue-rotate-180"
          />
        </footer>
      </body>
    </html>
  );
}
