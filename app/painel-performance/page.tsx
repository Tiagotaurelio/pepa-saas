"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { DashboardCards } from "@/components/dashboard-cards";
import type { DashboardSummary } from "@/components/dashboard-cards";
import { SavingsTimeline, UserRankingChart } from "@/components/dashboard-charts";
import type { TimelinePoint, UserPerformance } from "@/components/dashboard-charts";
import { PerformanceTable } from "@/components/performance-table";

type DashboardData = {
  summary: DashboardSummary;
  byUser: UserPerformance[];
  timeline: TimelinePoint[];
};

type UserOption = {
  id: string;
  name: string;
};

const QUICK_FILTERS = [
  { label: "Hoje", days: 0 },
  { label: "Esta semana", days: 7 },
  { label: "Este mes", days: 30 },
  { label: "3 meses", days: 90 },
  { label: "Este ano", days: 365 },
] as const;

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (days > 0) {
    start.setDate(start.getDate() - days);
  } else {
    start.setHours(0, 0, 0, 0);
  }
  return { start: toDateStr(start), end: toDateStr(end) };
}

export default function PainelPerformancePage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Check admin role on mount
  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then((d: { session?: { role?: string } }) => {
      if (d.session?.role !== "admin") {
        window.location.href = "/cotacoes-pepa";
      } else {
        setAuthorized(true);
      }
    }).catch(() => { window.location.href = "/login"; });
  }, []);

  const [activeDays, setActiveDays] = useState<number>(30);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | undefined>(undefined);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load users list
  useEffect(() => {
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then((json) => {
        if (json.users) {
          setUsers(json.users.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let start: string;
      let end: string;
      if (customStart && customEnd) {
        start = customStart;
        end = customEnd;
      } else {
        const range = getDateRange(activeDays);
        start = range.start;
        end = range.end;
      }
      const params = new URLSearchParams({ startDate: start, endDate: end });
      if (selectedUser) params.set("userId", selectedUser);

      const res = await fetch(`/api/pepa/dashboard?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      const json: DashboardData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [activeDays, customStart, customEnd, selectedUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleQuickFilter(days: number) {
    setCustomStart("");
    setCustomEnd("");
    setActiveDays(days);
  }

  function handleCustomDate(type: "start" | "end", value: string) {
    if (type === "start") setCustomStart(value);
    else setCustomEnd(value);
    setActiveDays(-1);
  }

  if (!authorized) {
    return <div className="flex items-center justify-center py-20 text-sm text-slate-400">Carregando...</div>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Gestao"
        title="Painel de Performance"
        description="Acompanhe a performance de compras e economia da sua equipe."
      />

      {/* Filters */}
      <div className="mb-8 rounded-[24px] bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick filters */}
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.days}
              onClick={() => handleQuickFilter(f.days)}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition",
                activeDays === f.days && !customStart
                  ? "bg-brand-blue text-white shadow-panel"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}

          <span className="mx-2 text-slate-300">|</span>

          {/* Custom date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => handleCustomDate("start", e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-brand-blue"
            />
            <span className="text-sm text-slate-400">ate</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => handleCustomDate("end", e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-brand-blue"
            />
          </div>

          <span className="mx-2 text-slate-300">|</span>

          {/* User filter */}
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-brand-blue"
          >
            <option value="">Todos os compradores</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading / Error */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-[24px] bg-red-50 p-6 text-center text-sm text-red-600">
          {error}
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <DashboardCards summary={data.summary} />

          {/* Charts */}
          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-[24px] bg-white p-6 shadow-panel">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-muted">
                Economia ao longo do tempo
              </h3>
              <SavingsTimeline data={data.timeline} />
            </div>
            <div className="rounded-[24px] bg-white p-6 shadow-panel">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-muted">
                Ranking por comprador
                {selectedBuyerId && (
                  <button
                    onClick={() => setSelectedBuyerId(undefined)}
                    className="ml-3 text-xs font-normal normal-case text-brand-blue hover:underline"
                  >
                    Limpar seleção
                  </button>
                )}
              </h3>
              <UserRankingChart
                data={data.byUser}
                selectedUserId={selectedBuyerId}
                onSelectUser={setSelectedBuyerId}
              />
            </div>
          </div>

          {/* Performance Table */}
          <div className="mt-8 rounded-[24px] bg-white p-6 shadow-panel">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-muted">
              Performance por comprador
            </h3>
            <PerformanceTable
              data={data.byUser}
              selectedUserId={selectedBuyerId}
              onSelectUser={setSelectedBuyerId}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
