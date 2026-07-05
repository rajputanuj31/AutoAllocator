"use client";

import { TxResult } from "@/lib/api";
import { ExternalLink, History, CheckCircle2, XCircle } from "lucide-react";

export function TransactionHistory({ transactions }: { transactions: TxResult[] }) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
          <History className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs text-muted-foreground/50 max-w-[160px]">
          Executed transactions will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full scrollbar-thin">
      <div className="p-3 space-y-2">
        {transactions.map((tx, idx) => (
          <div
            key={`${tx.agent_id}-${idx}`}
            className="group rounded-xl border border-border/25 bg-card/50 p-3 backdrop-blur-sm transition-all hover:border-primary/25 hover:bg-card/70"
          >
            {/* Top row: agent + status badge */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-foreground truncate">
                {tx.agent_id}
              </span>
              <span
                className={[
                  "flex items-center gap-1 shrink-0 text-[10px] font-bold px-1.5 py-px rounded-full border",
                  tx.status === "success"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-destructive/10 text-destructive border-destructive/20",
                ].join(" ")}
              >
                {tx.status === "success" ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <XCircle className="h-2.5 w-2.5" />
                )}
                {tx.status}
              </span>
            </div>

            {/* Amount */}
            <p className="text-xs text-muted-foreground mb-2">
              Amount:{" "}
              <span className="font-medium text-foreground tabular-nums">
                ${tx.amount_usd.toFixed(2)} USDC
              </span>
            </p>

            {/* BaseScan link or simulated tag */}
            {tx.tx_hash && tx.tx_hash !== "simulated_hash" ? (
              <a
                href={`https://sepolia.basescan.org/tx/${tx.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors font-mono"
              >
                {tx.tx_hash.slice(0, 8)}…{tx.tx_hash.slice(-6)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <span className="text-[10px] italic text-muted-foreground/40">
                Simulated execution
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
