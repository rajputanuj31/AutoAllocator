"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PortfolioHistoryEvent,
  PortfolioPosition,
  getPortfolio,
  getPortfolioHistory,
} from "@/lib/api";
import {
  Briefcase,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Tab = "positions" | "history";

interface PortfolioViewProps {
  /** Increment to refetch after a new allocation executes. */
  refreshTrigger?: number;
  /** Wait until wallet auth is ready before fetching. */
  enabled?: boolean;
}

function formatUsd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenHash(hash: string) {
  if (!hash || hash === "simulated_hash") return null;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function PortfolioView({ refreshTrigger = 0, enabled = true }: PortfolioViewProps) {
  const [tab, setTab] = useState<Tab>("positions");
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [events, setEvents] = useState<PortfolioHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [portfolio, history] = await Promise.all([
        getPortfolio(),
        getPortfolioHistory(),
      ]);
      setPositions(portfolio.positions);
      setTotalUsd(portfolio.total_usd);
      setEvents(history.events);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load portfolio";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load();
  }, [load, refreshTrigger, enabled]);

  const tabClass = (active: boolean) =>
    [
      "flex-1 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors",
      active
        ? "text-primary border-b-2 border-primary"
        : "text-muted-foreground hover:text-foreground",
    ].join(" ");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Portfolio
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh portfolio"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {!loading && !error && (
          <p className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
            {formatUsd(totalUsd)}
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">USDC</span>
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/20">
        <button type="button" className={tabClass(tab === "positions")} onClick={() => setTab("positions")}>
          Positions
          {positions.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[9px] font-bold text-primary">
              {positions.length}
            </span>
          )}
        </button>
        <button type="button" className={tabClass(tab === "history")} onClick={() => setTab("history")}>
          History
          {events.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[9px] font-bold text-primary">
              {events.length}
            </span>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs">Loading portfolio…</p>
          </div>
        )}

        {!loading && error && (
          <div className="p-4 text-center">
            <p className="text-xs text-destructive/90">{error}</p>
            <Button variant="outline" size="sm" onClick={load} className="mt-3 h-8 text-xs">
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && tab === "positions" && (
          <PositionsTab positions={positions} />
        )}

        {!loading && !error && tab === "history" && (
          <HistoryTab events={events} />
        )}
      </div>
    </div>
  );
}

function PositionsTab({ positions }: { positions: PortfolioPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
          <TrendingUp className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs text-muted-foreground/50 max-w-[180px]">
          No active positions yet. Approve an allocation to deploy USDC.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {positions.map((pos) => (
        <div
          key={pos.agent_id}
          className="rounded-xl border border-border/25 bg-card/50 p-3 backdrop-blur-sm transition-all hover:border-primary/25 hover:bg-card/70"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{pos.agent_name}</p>
              {pos.strategy && (
                <span className="mt-0.5 inline-block text-[10px] font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-2 py-px">
                  {pos.strategy}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums text-foreground shrink-0">
              {formatUsd(pos.amount_usd)}
            </p>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            {pos.reputation_score != null && (
              <span>
                Score{" "}
                <span className="font-medium text-foreground">{pos.reputation_score}</span>
              </span>
            )}
            <span>
              Vault TVL{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatUsd(pos.vault_tvl_usd)}
              </span>
            </span>
            <span>
              Deposits{" "}
              <span className="font-medium text-foreground">{pos.deposit_count}</span>
            </span>
            <span className="truncate">
              Last{" "}
              <span className="font-medium text-foreground">
                {formatDate(pos.last_deposit_at)}
              </span>
            </span>
          </div>

          {pos.vault_address && (
            <a
              href={`https://sepolia.basescan.org/address/${pos.vault_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
            >
              Vault on BaseScan
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ events }: { events: PortfolioHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
          <History className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs text-muted-foreground/50 max-w-[180px]">
          Executed deposits will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {events.map((ev) => {
        const hash = shortenHash(ev.tx_hash);
        const isDeposit = ev.event_type === "deposit";

        return (
          <div
            key={ev.id}
            className="rounded-xl border border-border/25 bg-card/50 p-3 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-foreground truncate">
                {ev.agent_name}
              </span>
              <span
                className={[
                  "shrink-0 text-[10px] font-bold px-1.5 py-px rounded-full border capitalize",
                  isDeposit
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-muted/50 text-muted-foreground border-border/30",
                ].join(" ")}
              >
                {ev.event_type}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mb-1">
              <span className="font-medium tabular-nums text-foreground">
                {formatUsd(ev.amount_usd)}
              </span>{" "}
              USDC
            </p>

            <p className="text-[10px] text-muted-foreground/70 mb-1.5">
              {formatDate(ev.created_at)}
            </p>

            {hash ? (
              <a
                href={`https://sepolia.basescan.org/tx/${ev.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors font-mono"
              >
                {hash}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <span className="text-[10px] italic text-muted-foreground/40">
                Simulated execution
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
