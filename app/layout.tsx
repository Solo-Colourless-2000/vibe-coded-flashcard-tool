import type { Metadata } from "next";
import "./globals.css";

const title = "TOTAL RECALL";
const description =
  "フラッシュカードを作成・インポートや複数行コード入力に対応したローカル学習ツール。";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title,
  description,
  applicationName: "TOTAL RECALL",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ja_JP",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "TOTAL RECALL",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
