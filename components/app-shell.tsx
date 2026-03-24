"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { navigation } from "@/lib/navigation";

type AppShellProps = {
  children: ReactNode;
  tenantName: string | null;
  userName: string | null;
};

export function AppShell({ children, tenantName, userName }: AppShellProps) {
  const pathname = usePathname();
  const hideChrome = pathname === "/login";
  const [displayTenantName, setDisplayTenantName] = useState(tenantName);

  useEffect(() => {
    if (tenantName) setDisplayTenantName(tenantName);
  }, [tenantName]);

  useEffect(() => {
    function onNameUpdated(e: Event) {
      const detail = (e as CustomEvent<{ name: string }>).detail;
      if (detail?.name) setDisplayTenantName(detail.name);
    }
    window.addEventListener("company-name-updated", onNameUpdated);
    return () => window.removeEventListener("company-name-updated", onNameUpdated);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });
    window.location.href = "/login";
  }

  if (hideChrome) {
    return <div className="min-h-screen bg-brand-surface text-brand-ink">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-brand-surface text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white px-5 py-6 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">
              PEPA
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{displayTenantName ?? "Cotacao de Compras"}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Comparativo de fornecedores e gestao de pedidos de compra.
            </p>
          </div>

          <nav className="grid gap-2">
            {navigation.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "rounded-2xl px-4 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-brand-blue text-white shadow-panel"
                      : "text-slate-600 hover:bg-slate-100 hover:text-brand-ink"
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1">
          <div className="border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">
                  Operacao de compras
                </p>
                <p className="text-sm text-slate-500">
                  Comparativo de cotacoes, validacao e exportacao de pedido final.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {userName ? (
                  <span className="text-sm text-slate-600">{userName}</span>
                ) : null}
                <button
                  className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                  onClick={handleLogout}
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
          <div className="px-5 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
