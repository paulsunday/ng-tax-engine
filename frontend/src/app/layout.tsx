import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Nav } from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Netwave Books",
  description: "Built for accountants, auditors, and tax professionals — accounting, audit support, and tax filing made fast and reliable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border">
            <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-muted">Netwave Books · by Netwave Tech Labs</div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
