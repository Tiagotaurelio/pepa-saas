"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

export function UserRankingChart({
  data,
  selectedUserId,
  onSelectUser,
}: {
  data: UserPerformance[];
  selectedUserId?: string;
  onSelectUser?: (userId: string | undefined) => void;
}) {
  // Show only buyers with savings > 0, sorted descending
  const buyers = data
    .filter((u) => u.role === "buyer" && u.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 10);

  if (buyers.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-brand-muted">
        Sem dados para o periodo
      </div>
    );
  }

  const handleClick = (entry: { userId: string }) => {
    if (!onSelectUser) return;
    onSelectUser(selectedUserId === entry.userId ? undefined : entry.userId);
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={buyers}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        onClick={(e) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = (e as any)?.activePayload?.[0]?.payload;
          if (payload) handleClick(payload as { userId: string });
        }}
      >
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
          width={80}
        />
        <Tooltip
          formatter={(value) => [fmtCurrency(Number(value)), "Economia"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
          cursor={{ fill: "rgba(11,98,164,0.06)" }}
        />
        <Bar dataKey="savings" radius={[0, 6, 6, 0]} style={{ cursor: onSelectUser ? "pointer" : "default" }}>
          {buyers.map((entry) => (
            <Cell
              key={entry.userId}
              fill={
                !selectedUserId || selectedUserId === entry.userId
                  ? "#0B62A4"
                  : "#cbd5e1"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
