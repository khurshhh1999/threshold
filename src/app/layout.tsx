import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-mono",
});
const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

const title = "Threshold — DC energy program eligibility";
const description =
  "Review household facts and see which DC energy programs may fit.";
const image = { url: "/og.png", width: 1200, height: 630, alt: "Threshold" };

export const metadata: Metadata = {
  metadataBase: new URL("https://threshold-hazel.vercel.app"),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Threshold",
    type: "website",
    images: [image],
  },
  twitter: { card: "summary_large_image", title, description, images: [image] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
