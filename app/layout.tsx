import type { Metadata } from "next";

import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "PEPA",
  description: "Plataforma de cotacao e gestao de pedidos de compra."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();

  return (
    <html lang="pt-BR">
      <body>
        <AppShell tenantName={session?.tenantName ?? null} userName={session?.userName ?? null}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
