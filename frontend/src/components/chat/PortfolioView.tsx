"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PortfolioHistoryEvent,
  PortfolioPosition,
  getPortfolio,
  getPortfolioHistory,
} from "@/lib/api";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

type Tab = "positions" | "history";

interface PortfolioViewProps {
  refreshTrigger?: number;
  enabled?: boolean;
}

function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function shortHash(h: string) {
  if (!h || h === "simulated_hash") return null;
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
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
      const [p, h] = await Promise.all([getPortfolio(), getPortfolioHistory()]);
      setPositions(p.positions);
      setTotalUsd(p.total_usd);
      setEvents(h.events);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    load();
  }, [load, refreshTrigger, enabled]);

  return (
    <div className="flex h-full flex-col">

      {/* Header */}
      <div className="flex shrink-0 items-end justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Portfolio</p>
          {!loading && !error && (
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
              {fmtUsd(totalUsd)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">USDC</span>
            </p>
          )}
          {loading && <div className="mt-1 h-6 w-20 animate-pulse rounded bg-border" />}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="mb-1 rounded p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border">
        {(["positions", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "flex-1 py-2.5 text-[11px] font-medium uppercase tracking-widest transition-colors",
              tab === t
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t}
            {t === "positions" && positions.length > 0 && (
              <span className="ml-1 text-[9px] text-muted-foreground">({positions.length})</span>
            )}
            {t === "history" && events.length > 0 && (
              <span className="ml-1 text-[9px] text-muted-foreground">({events.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && error && (
          <div className="p-6 text-center">
            <p className="text-xs text-muted-foreground">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-foreground underline underline-offset-2">Retry</button>
          </div>
        )}

        {!loading && !error && tab === "positions" && <PositionsTab positions={positions} />}
        {!loading && !error && tab === "history" && <HistoryTab events={events} />}
      </div>
    </div>
  );
}

function PositionsTab({ positions }: { positions: PortfolioPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-xs text-muted-foreground/50">No active positions yet.</p>
        <p className="text-[10px] text-muted-foreground/30">Send a chat message to invest.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {positions.map((pos) => (
        <div key={pos.agent_id} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{pos.agent_name}</p>
              {pos.strategy && (
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                  {pos.strategy}
                </p>
              )}
            </div>
            <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
              {fmtUsd(pos.amount_usd)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
            {pos.reputation_score != null && (
              <div className="flex gap-1.5 text-muted-foreground">
                Score <span className="text-foreground font-medium">{pos.reputation_score}</span>
              </div>
            )}
            <div className="flex gap-1.5 text-muted-foreground">
              TVL <span className="text-foreground font-medium tabular-nums">{fmtUsd(pos.vault_tvl_usd)}</span>
            </div>
            <div className="flex gap-1.5 text-muted-foreground">
              Deposits <span className="text-foreground font-medium">{pos.deposit_count}</span>
            </div>
            <div className="flex gap-1.5 text-muted-foreground truncate">
              Last <span className="text-foreground font-medium">{fmtDate(pos.last_deposit_at)}</span>
            </div>
          </div>

          {pos.vault_address && (
            <a
              href={`https://sepolia.basescan.org/address/${pos.vault_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View vault on BaseScan
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
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-xs text-muted-foreground/50">No transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {events.map((ev) => {
        const hash = shortHash(ev.tx_hash);
        return (
          <div key={ev.id} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-medium text-foreground truncate">{ev.agent_name}</p>
              <span className={[
                "shrink-0 text-[10px] font-medium capitalize",
                ev.event_type === "deposit" ? "text-emerald-500" : "text-muted-foreground",
              ].join(" ")}>
                {ev.event_type}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{fmtUsd(ev.amount_usd)}</span> USDC
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">{fmtDate(ev.created_at)}</p>
            {hash ? (
              <a
                href={`https://sepolia.basescan.org/tx/${ev.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {hash} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <span className="text-[10px] italic text-muted-foreground/30">Simulated</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
