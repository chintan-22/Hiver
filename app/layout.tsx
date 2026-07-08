import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reply + Rubric",
  description: "Generate customer replies and score their quality."
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
