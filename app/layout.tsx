import type { Metadata, Viewport } from "next";
import { Noto_Serif_JP } from "next/font/google";
import "./globals.css";

const serifJp = Noto_Serif_JP({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-serif-jp",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "yourinsight", template: "%s · yourinsight" },
  description: "答えによって次の質問が変わる、短い対話型アンケート",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a18" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${serifJp.variable} h-full antialiased`}>
      <body className="min-h-dvh flex flex-col">{children}</body>
    </html>
  );
}
