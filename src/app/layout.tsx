import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/components/auth/AuthGuard";
import {
  APP_ESTOQUE_APPLE_ICON,
  APP_ESTOQUE_MANIFEST,
  APP_ESTOQUE_NOME,
  APP_ESTOQUE_NOME_PWA,
} from "@/lib/app-estoque-branding";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: APP_ESTOQUE_NOME_PWA,
    template: `%s — ${APP_ESTOQUE_NOME}`,
  },
  description: "Controle de estoque por unidade com QR e auditoria — Açaí do Kim",
  applicationName: APP_ESTOQUE_NOME_PWA,
  manifest: APP_ESTOQUE_MANIFEST,
  appleWebApp: {
    capable: true,
    title: APP_ESTOQUE_NOME_PWA,
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-title": APP_ESTOQUE_NOME_PWA,
  },
  icons: {
    apple: [{ url: APP_ESTOQUE_APPLE_ICON, type: "image/png", sizes: "180x180" }],
    icon: [
      { url: "/branding/estoque-app/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/branding/estoque-app/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
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
