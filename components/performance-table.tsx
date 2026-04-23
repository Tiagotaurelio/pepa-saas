"use client";

import { useState } from "react";

export type BrandBreakdown = {
  brand: string;
  savings: number;
};

export type UserPerformance = {
  userId: string;
  userName: string;
  role: string;
  rounds: number;
  itemsValidated: number;
  closedRounds: number;
  savings: number;
  savingsPercent: number;
  trend: number[];
  brands: string[];
  brandBreakdown: BrandBreakdown[];
};

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBadgeClass(value: number, avg: number): string {
  if (value >= avg * 1.1) return "bg-green-100 text-green-700";
  if (value < avg * 0.9) return "bg-red-100 text-red-600";
  return "bg-amber-100 text-amber-700";
}

export function PerformanceTable({
  data,
  selectedUserId,
  onSelectUser,
}: {
  data: UserPerformance[];
  selectedUserId?: string;
  onSelectUser?: (userId: string | undefined) => void;
}) {
  const [expandedEconomia, setExpandedEconomia] = useState<string | null>(null);

  // Show only buyers
  const buyers = data.filter((u) => u.role === "buyer");

  if (buyers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-brand-muted">
        Sem dados para o periodo
      </div>
    );
  }

  const avgPercent =
    buyers.reduce((sum, u) => sum + u.savingsPercent, 0) / buyers.length;

  const handleSelectUser = (userId: string) => {
    if (!onSelectUser) return;
    onSelectUser(selectedUserId === userId ? undefined : userId);
  };

  const toggleEconomia = (userId: string) => {
    setExpandedEconomia(expandedEconomia === userId ? null : userId);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-brand-muted">
            <th className="pb-3 pr-4">Comprador</th>
            <th className="pb-3 pr-4 text-right">Cotacoes</th>
            <th className="pb-3 pr-4 text-right">Itens</th>
            <th className="pb-3 pr-4 text-right">Fechadas</th>
            <th className="pb-3 pr-4">Marcas</th>
            <th className="pb-3 pr-4 text-right">Economia (R$)</th>
            <th className="pb-3 text-right">Economia (%)</th>
          </tr>
        </thead>
        <tbody>
          {buyers.map((user) => {
            const isSelected = selectedUserId === user.userId;
            const isExpanded = expandedEconomia === user.userId;

            return (
              <>
                <tr
                  key={user.userId}
                  className={[
                    "border-b border-slate-100 transition",
                    isSelected ? "bg-blue-50" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  {/* Comprador — clicável para filtrar gráfico */}
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => handleSelectUser(user.userId)}
                      className={[
                        "font-medium transition hover:underline",
                        isSelected ? "text-brand-blue" : "text-brand-ink",
                      ].join(" ")}
                      title={isSelected ? "Clique para ver todos" : "Clique para filtrar gráfico"}
                    >
                      {user.userName}
                      {isSelected && (
                        <span className="ml-1.5 text-xs font-normal text-brand-blue opacity-70">●</span>
                      )}
                    </button>
                  </td>

                  <td className="py-3 pr-4 text-right text-slate-600">
                    {user.rounds.toLocaleString("pt-BR")}
                  </td>

                  <td className="py-3 pr-4 text-right text-slate-600">
                    {user.itemsValidated.toLocaleString("pt-BR")}
                  </td>

                  <td className="py-3 pr-4 text-right text-slate-600">
                    {user.closedRounds.toLocaleString("pt-BR")}
                  </td>

                  {/* Marcas */}
                  <td className="py-3 pr-4">
                    {user.brands.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.brands.map((b) => (
                          <span
                            key={b}
                            className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Economia (R$) — clicável para expandir detalhamento */}
                  <td className="py-3 pr-4 text-right">
                    <button
                      onClick={() => toggleEconomia(user.userId)}
                      disabled={user.brandBreakdown.length === 0}
                      className={[
                        "tabular-nums transition",
                        user.brandBreakdown.length > 0
                          ? "cursor-pointer text-brand-blue underline decoration-dotted hover:decoration-solid"
                          : "cursor-default text-slate-600",
                      ].join(" ")}
                      title={user.brandBreakdown.length > 0 ? "Clique para ver detalhamento por marca" : undefined}
                    >
                      {fmtCurrency(user.savings)}
                      {user.brandBreakdown.length > 0 && (
                        <span className="ml-1 text-xs">{isExpanded ? "▲" : "▼"}</span>
                      )}
                    </button>
                  </td>

                  <td className="py-3 text-right">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getBadgeClass(user.savingsPercent, avgPercent)}`}
                    >
                      {user.savingsPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%
                    </span>
                  </td>
                </tr>

                {/* Linha expandida — detalhamento por marca */}
                {isExpanded && user.brandBreakdown.length > 0 && (
                  <tr key={`${user.userId}-breakdown`} className="bg-blue-50/60">
                    <td colSpan={7} className="px-4 pb-4 pt-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-muted">
                        Economia por marca — {user.userName}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {user.brandBreakdown.map((bd) => (
                          <div
                            key={bd.brand}
                            className="rounded-xl border border-blue-100 bg-white px-4 py-2 shadow-sm"
                          >
                            <p className="text-xs font-semibold text-slate-500">{bd.brand}</p>
                            <p className="text-sm font-bold text-green-600">{fmtCurrency(bd.savings)}</p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
