import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GroundedReply",
  description: "Generate grounded support replies with retrieval and evaluation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
