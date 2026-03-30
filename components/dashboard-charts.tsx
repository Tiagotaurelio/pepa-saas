"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TimelinePoint = {
  date: string;
  savings: number;
  rounds: number;
};

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

function formatDatePtBR(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${day} ${months[d.getMonth()]}`;
}

export function SavingsTimeline({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-brand-muted">
        Sem dados para o periodo
      </div>
    );
  }

  const chartData = data.map((p) => ({
    ...p,
    label: formatDatePtBR(p.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(v: number) => `R$${Math.round(v)}`}
        />
        <Tooltip
          formatter={(value) => [fmtCurrency(Number(value)), "Economia"]}
          labelFormatter={(label) => String(label)}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
        />
        <Area
          type="monotone"
          dataKey="savings"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#savingsGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function UserRankingChart({ data }: { data: UserPerformance[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-brand-muted">
        Sem dados para o periodo
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.savings - a.savings).slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(v: number) => `R$${Math.round(v)}`}
        />
        <YAxis
          type="category"
          dataKey="userName"
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={100}
        />
        <Tooltip
          formatter={(value) => [fmtCurrency(Number(value)), "Economia"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="savings" fill="#0B62A4" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
