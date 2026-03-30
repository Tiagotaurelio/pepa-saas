import "server-only";

import { listPepaRoundsForDashboard, DashboardRoundRow } from "@/lib/db";
import { PepaSnapshot, ComparisonRow } from "@/lib/pepa-quotation-domain";

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

export type TimelinePoint = {
  date: string;
  savings: number;
  rounds: number;
};

export type DashboardData = {
  summary: DashboardSummary;
  byUser: UserPerformance[];
  timeline: TimelinePoint[];
};

function calculateSavingsForRow(row: ComparisonRow): number {
  if (
    row.baseUnitPrice != null &&
    row.bestUnitPrice != null &&
    row.bestUnitPrice < row.baseUnitPrice
  ) {
    return (row.baseUnitPrice - row.bestUnitPrice) * row.requestedQuantity;
  }
  return 0;
}

function calculateMetricsFromSnapshot(snapshot: PepaSnapshot) {
  const itemsValidated = snapshot.comparisonRows.filter(
    (r) => r.bestSupplier !== null
  ).length;
  const savings = snapshot.comparisonRows.reduce(
    (sum, r) => sum + calculateSavingsForRow(r),
    0
  );
  const isClosed = snapshot.latestRound?.status === "closed";
  const totalBaseValue = snapshot.comparisonRows.reduce((sum, r) => {
    if (r.baseUnitPrice != null) {
      return sum + r.baseUnitPrice * r.requestedQuantity;
    }
    return sum;
  }, 0);
  return { itemsValidated, savings, isClosed, totalBaseValue };
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

export async function getDashboardData(params: {
  tenantId: string;
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<DashboardData> {
  const rows = await listPepaRoundsForDashboard(
    params.tenantId,
    params.startDate,
    params.endDate,
    params.userId
  );

  // Calculate previous period for comparison
  const startMs = new Date(params.startDate).getTime();
  const endMs = new Date(params.endDate).getTime();
  const periodMs = endMs - startMs;
  const prevStart = new Date(startMs - periodMs).toISOString();
  const prevEnd = new Date(startMs).toISOString();

  const prevRows = await listPepaRoundsForDashboard(
    params.tenantId,
    prevStart,
    prevEnd,
    params.userId
  );

  // Aggregate current period
  let totalItemsValidated = 0;
  let totalSavings = 0;
  let totalBaseValue = 0;

  const userMap = new Map<
    string,
    {
      userName: string;
      rounds: number;
      itemsValidated: number;
      closedRounds: number;
      savings: number;
      totalBaseValue: number;
      weeklySavings: Map<string, number>;
    }
  >();

  const timelineMap = new Map<string, { savings: number; rounds: number }>();

  for (const row of rows) {
    const snapshot = JSON.parse(row.snapshotJson) as PepaSnapshot;
    const metrics = calculateMetricsFromSnapshot(snapshot);

    totalItemsValidated += metrics.itemsValidated;
    totalSavings += metrics.savings;
    totalBaseValue += metrics.totalBaseValue;

    // Per-user aggregation
    const uid = row.userId ?? "unknown";
    const uname = row.userName ?? "Desconhecido";
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        userName: uname,
        rounds: 0,
        itemsValidated: 0,
        closedRounds: 0,
        savings: 0,
        totalBaseValue: 0,
        weeklySavings: new Map()
      });
    }
    const u = userMap.get(uid)!;
    u.rounds += 1;
    u.itemsValidated += metrics.itemsValidated;
    if (metrics.isClosed) u.closedRounds += 1;
    u.savings += metrics.savings;
    u.totalBaseValue += metrics.totalBaseValue;

    const weekKey = getWeekKey(row.createdAt);
    u.weeklySavings.set(weekKey, (u.weeklySavings.get(weekKey) ?? 0) + metrics.savings);

    // Timeline aggregation
    if (!timelineMap.has(weekKey)) {
      timelineMap.set(weekKey, { savings: 0, rounds: 0 });
    }
    const t = timelineMap.get(weekKey)!;
    t.savings += metrics.savings;
    t.rounds += 1;
  }

  // Previous period aggregation
  let prevSavings = 0;
  for (const row of prevRows) {
    const snapshot = JSON.parse(row.snapshotJson) as PepaSnapshot;
    const metrics = calculateMetricsFromSnapshot(snapshot);
    prevSavings += metrics.savings;
  }

  const avgSavingsPercent =
    totalBaseValue > 0 ? Math.round((totalSavings / totalBaseValue) * 10000) / 100 : 0;

  const roundsDiffNum = rows.length - prevRows.length;
  const savingsDiffNum = prevSavings > 0 ? ((totalSavings - prevSavings) / prevSavings) * 100 : 0;

  const summary: DashboardSummary = {
    totalRounds: rows.length,
    totalItemsValidated,
    totalSavings: Math.round(totalSavings * 100) / 100,
    avgSavingsPercent,
    previousPeriodComparison: {
      roundsDiff: roundsDiffNum >= 0 ? `+${roundsDiffNum}` : `${roundsDiffNum}`,
      savingsDiff:
        prevSavings > 0
          ? `${savingsDiffNum >= 0 ? "+" : ""}${Math.round(savingsDiffNum)}%`
          : rows.length > 0
            ? "+100%"
            : "0%"
    }
  };

  const byUser: UserPerformance[] = Array.from(userMap.entries()).map(([userId, data]) => {
    const weeklySavingsValues = Array.from(data.weeklySavings.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => Math.round(v * 100) / 100);

    return {
      userId,
      userName: data.userName,
      rounds: data.rounds,
      itemsValidated: data.itemsValidated,
      closedRounds: data.closedRounds,
      savings: Math.round(data.savings * 100) / 100,
      savingsPercent:
        data.totalBaseValue > 0
          ? Math.round((data.savings / data.totalBaseValue) * 10000) / 100
          : 0,
      trend: weeklySavingsValues
    };
  });

  const timeline: TimelinePoint[] = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      savings: Math.round(data.savings * 100) / 100,
      rounds: data.rounds
    }));

  return { summary, byUser, timeline };
}
