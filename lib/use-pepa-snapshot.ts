"use client";

import { useEffect, useState } from "react";

import { PepaSnapshot, getPepaSnapshot } from "@/lib/pepa-quotation-domain";

export function usePepaSnapshot(roundId?: string | null) {
  const [snapshot, setSnapshot] = useState<PepaSnapshot>(() => getPepaSnapshot());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      if (active) {
        setIsLoading(true);
        setError(null);
      }

      const search = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
      const response = await fetch(`/api/pepa/snapshot${search}`, { cache: "no-store" });
      if (!response.ok) {
        if (active) {
          setError("Nao foi possivel carregar a rodada atual.");
          setIsLoading(false);
        }
        return;
      }

      const payload = (await response.json()) as { snapshot: PepaSnapshot };
      if (active) {
        setSnapshot(payload.snapshot);
        setIsLoading(false);
      }
    }

    loadSnapshot();

    const handleRefresh = () => {
      void loadSnapshot();
    };

    window.addEventListener("pepa-store-updated", handleRefresh);

    return () => {
      active = false;
      window.removeEventListener("pepa-store-updated", handleRefresh);
    };
  }, [roundId]);

  return {
    snapshot,
    isLoading,
    error
  };
}
