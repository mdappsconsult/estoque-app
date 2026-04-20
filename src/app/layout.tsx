import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/components/auth/AuthGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "controle de estoque",
    template: "%s — controle de estoque",
  },
  description: "Controle de estoque por unidade com QR e auditoria — Açaí do Kim",
  applicationName: "controle de estoque",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "controle de estoque",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/branding/acai-do-kim-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-50`} suppressHydrationWarning>
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
