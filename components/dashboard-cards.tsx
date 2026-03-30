"use client";

import { motion } from "framer-motion";

export type DashboardSummary = {
  totalRounds: number;
  totalItemsValidated: number;
  totalSavings: number;
  avgSavingsPercent: number;
  previousPeriodComparison: {
    roundsDiff: string;
    savingsDiff: string;
  };
};

type CardDef = {
  label: string;
  value: string;
  comparison?: string;
  color: string;
  iconBg: string;
  icon: string;
};

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  const cards: CardDef[] = [
    {
      label: "Total cotacoes",
      value: summary.totalRounds.toLocaleString("pt-BR"),
      comparison: summary.previousPeriodComparison.roundsDiff + " vs periodo anterior",
      color: "text-blue-600",
      iconBg: "bg-blue-100",
      icon: "📋",
    },
    {
      label: "Itens validados",
      value: summary.totalItemsValidated.toLocaleString("pt-BR"),
      color: "text-indigo-600",
      iconBg: "bg-indigo-100",
      icon: "✅",
    },
    {
      label: "Economia total",
      value: fmtCurrency(summary.totalSavings),
      comparison: summary.previousPeriodComparison.savingsDiff + " vs periodo anterior",
      color: "text-green-600",
      iconBg: "bg-green-100",
      icon: "💰",
    },
    {
      label: "Media economia %",
      value: `${summary.avgSavingsPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`,
      color: "text-emerald-600",
      iconBg: "bg-emerald-100",
      icon: "📊",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.1 }}
          className="rounded-[24px] bg-white p-6 shadow-panel"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-brand-muted">{card.label}</p>
              <p className={`mt-2 text-3xl font-bold tracking-tight ${card.color}`}>
                {card.value}
              </p>
              {card.comparison ? (
                <p className="mt-2 text-xs text-slate-500">{card.comparison}</p>
              ) : null}
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-lg ${card.iconBg}`}>
              {card.icon}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
