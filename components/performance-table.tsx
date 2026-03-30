"use client";

export type UserPerformance = {
  userId: string;
  userName: string;
  rounds: number;
  itemsValidated: number;
  closedRounds: number;
  savings: number;
  savingsPercent: number;
  trend: number[];
};

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBadgeClass(value: number, avg: number): string {
  if (value >= avg * 1.1) return "bg-green-100 text-green-700";
  if (value < avg * 0.9) return "bg-red-100 text-red-600";
  return "bg-amber-100 text-amber-700";
}

export function PerformanceTable({ data }: { data: UserPerformance[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-brand-muted">
        Sem dados para o periodo
      </div>
    );
  }

  const avgPercent =
    data.reduce((sum, u) => sum + u.savingsPercent, 0) / data.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-brand-muted">
            <th className="pb-3 pr-4">Comprador</th>
            <th className="pb-3 pr-4 text-right">Cotacoes</th>
            <th className="pb-3 pr-4 text-right">Itens</th>
            <th className="pb-3 pr-4 text-right">Fechadas</th>
            <th className="pb-3 pr-4 text-right">Economia (R$)</th>
            <th className="pb-3 text-right">Economia (%)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user) => (
            <tr
              key={user.userId}
              className="border-b border-slate-100 transition hover:bg-slate-50"
            >
              <td className="py-3 pr-4 font-medium text-brand-ink">
                {user.userName}
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
              <td className="py-3 pr-4 text-right text-slate-600">
                {fmtCurrency(user.savings)}
              </td>
              <td className="py-3 text-right">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getBadgeClass(user.savingsPercent, avgPercent)}`}
                >
                  {user.savingsPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
