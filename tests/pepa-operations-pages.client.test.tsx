// @vitest-environment jsdom

import React from "react";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

const searchParamsState = vi.hoisted(() => ({
  value: new URLSearchParams()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsState.value,
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn()
  })
}));

const usePepaSnapshotMock = vi.fn();

vi.mock("../lib/use-pepa-snapshot", () => ({
  usePepaSnapshot: (roundId?: string | null) => usePepaSnapshotMock(roundId)
}));

import CotacoesPepaPage from "../app/cotacoes-pepa/page";
import ValidacaoCompraPepaPage from "../app/validacao-compra-pepa/page";
import PedidoFinalPepaPage from "../app/pedido-final-pepa/page";
import LogsPepaPage from "../app/logs-pepa/page";
import { getPepaSnapshot } from "../lib/pepa-quotation-domain";

describe("PEPA operational pages", () => {
  const baseSnapshot = getPepaSnapshot();
  const originalFetch = global.fetch;

  beforeEach(() => {
    usePepaSnapshotMock.mockReset();
    searchParamsState.value = new URLSearchParams();
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ rounds: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    ) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("renders cotacoes loading state, history warning and closing risk", async () => {
    usePepaSnapshotMock.mockReturnValue({
      snapshot: {
        ...baseSnapshot,
        latestRound: {
          id: "round-open-1",
          createdAt: "2026-03-18T10:00:00.000Z",
          mirrorFileName: "espelho-flex.csv",
          supplierFilesCount: 2,
          requestedItemsCount: 10,
          attachmentsReceived: 3,
          quotedItems: 7,
          coverageRate: 70,
          status: "open"
        },
        totals: {
          ...baseSnapshot.totals,
          requestedItems: 10,
          quotedItems: 7,
          ocrQueue: 2
        }
      },
      isLoading: true,
      error: null
    });

    render(<CotacoesPepaPage />);

    expect(screen.getByText("Carregando")).toBeTruthy();
    expect(screen.getByText("Atualizando o comparativo...")).toBeTruthy();
    expect(screen.getByText("Aberta")).toBeTruthy();
    expect(screen.getByText("Fechar rodada")).toBeTruthy();
  });

  it("renders validacao closed-round state and validation error", () => {
    usePepaSnapshotMock.mockReturnValue({
      snapshot: {
        ...baseSnapshot,
        latestRound: {
          id: "round-closed-1",
          createdAt: "2026-03-18T10:00:00.000Z",
          mirrorFileName: "espelho-flex.csv",
          supplierFilesCount: 2,
          requestedItemsCount: 10,
          attachmentsReceived: 3,
          quotedItems: 10,
          coverageRate: 100,
          status: "closed"
        }
      },
      isLoading: false,
      error: "Nao foi possivel carregar a rodada atual."
    });

    render(<ValidacaoCompraPepaPage />);

    expect(screen.getByText("Erro")).toBeTruthy();
    expect(screen.getByText("Nao foi possivel carregar a rodada atual.")).toBeTruthy();
    expect(screen.getByText("← Voltar para Cotações")).toBeTruthy();
  });

  it("renders pedido final export block and error state", () => {
    usePepaSnapshotMock.mockReturnValue({
      snapshot: {
        ...baseSnapshot,
        latestRound: {
          id: "round-open-2",
          createdAt: "2026-03-18T10:00:00.000Z",
          mirrorFileName: "espelho-flex.csv",
          supplierFilesCount: 2,
          requestedItemsCount: 10,
          attachmentsReceived: 3,
          quotedItems: 8,
          coverageRate: 80,
          status: "open"
        },
        totals: {
          ...baseSnapshot.totals,
          ocrQueue: 1
        }
      },
      isLoading: false,
      error: "Nao foi possivel carregar a rodada atual."
    });

    render(<PedidoFinalPepaPage />);

    expect(screen.getByText("Exportacao bloqueada — rodada ainda aberta")).toBeTruthy();
    expect(screen.getByText("Erro")).toBeTruthy();
    expect(screen.getByText("Nao foi possivel carregar a rodada atual.")).toBeTruthy();
  });

  it("renders logs empty state when there are no audit events", async () => {
    usePepaSnapshotMock.mockReturnValue({
      snapshot: {
        ...baseSnapshot,
        latestRound: null,
        auditEvents: []
      },
      isLoading: false,
      error: null
    });

    render(<LogsPepaPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma cotação encontrada para este filtro.")).toBeTruthy();
    });
  });

  it("renders logs with round badges and open round link", () => {
    searchParamsState.value = new URLSearchParams("roundId=round-abc12345");
    usePepaSnapshotMock.mockReturnValue({
      snapshot: {
        ...baseSnapshot,
        latestRound: {
          id: "round-abc12345",
          createdAt: "2026-03-18T10:00:00.000Z",
          mirrorFileName: "espelho-flex.csv",
          supplierFilesCount: 2,
          requestedItemsCount: 10,
          attachmentsReceived: 3,
          quotedItems: 10,
          coverageRate: 100,
          status: "closed"
        },
        auditEvents: [
          {
            id: "event-1",
            type: "round_status_changed",
            title: "Rodada fechada",
            description: "Fechamento confirmado para auditoria.",
            occurredAt: "2026-03-18T11:00:00.000Z"
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(<LogsPepaPage />);

    expect(screen.getByText("Rodada fechada")).toBeTruthy();
    expect(screen.getByText("Fechamento confirmado para auditoria.")).toBeTruthy();
    expect(screen.getByText("Trilha de auditoria")).toBeTruthy();
  });
});
