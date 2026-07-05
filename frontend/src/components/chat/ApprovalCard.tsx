"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  AgentAllocation,
  AgentProfile,
  TxResult,
  postCancel,
  postInvestConfirm,
} from "@/lib/api";
import {
  ensureBaseSepolia,
  sendUsdcTransfer,
  waitForTxReceipt,
} from "@/lib/usdc";
import { AgentDetailPanel } from "@/components/chat/AgentDetailPanel";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type CardState = "pending" | "approving" | "approved" | "rejected" | "error";

interface ApprovalCardProps {
  threadId: string;
  walletAddress: string;
  allocation: AgentAllocation[];
  agentProfiles?: AgentProfile[];
  /** Called after on-chain transactions succeed — parent uses this to update tx history. */
  onApproveSuccess: (results: TxResult[]) => void;
  /** Called after the user rejects — parent can react if needed. */
  onRejectSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function AllocationRow({
  agent,
  profile,
}: {
  agent: AgentAllocation;
  profile?: AgentProfile;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/20 last:border-0 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-2 py-px">
                {agent.strategy}
              </span>
              {profile && (
                <span className="text-[10px] text-muted-foreground">
                  Score {profile.reputation.score}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-16 h-1 rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${agent.percentage}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-7 text-right">
              {agent.percentage.toFixed(0)}%
            </span>
          </div>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            ${agent.amount_usd.toFixed(2)}
          </span>
        </div>
      </div>

      {profile && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex items-center gap-1 text-[11px] text-primary/80 hover:text-primary transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Hide details
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                View agent details
              </>
            )}
          </button>
          {expanded && (
            <AgentDetailPanel
              profile={profile}
              allocationPercentage={agent.percentage}
            />
          )}
        </>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/20 last:border-0 animate-pulse">
      <div className="h-2 w-2 rounded-full bg-muted/60 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 w-28 rounded-full bg-muted/60" />
        <div className="h-2 w-16 rounded-full bg-muted/40" />
      </div>
      <div className="h-2.5 w-16 rounded-full bg-muted/50" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ApprovalCard({
  threadId,
  walletAddress,
  allocation,
  agentProfiles = [],
  onApproveSuccess,
  onRejectSuccess,
}: ApprovalCardProps) {
  const { wallets } = useWallets();
  const [cardState, setCardState] = useState<CardState>("pending");
  const [txResults, setTxResults] = useState<TxResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalAmount = allocation.reduce((acc, a) => acc + a.amount_usd, 0);

  const profileByAgentId = Object.fromEntries(
    agentProfiles.map((p) => [p.agent_id, p])
  );

  const handleApprove = async () => {
    setCardState("approving");
    try {
      const wallet =
        wallets.find(
          (w) => w.address.toLowerCase() === walletAddress.toLowerCase()
        ) ?? wallets[0];

      if (!wallet) {
        throw new Error("No connected wallet found. Reconnect and try again.");
      }

      const provider = await wallet.getEthereumProvider();
      await ensureBaseSepolia(provider);

      const results: TxResult[] = [];
      for (const agent of allocation) {
        const hash = await sendUsdcTransfer(
          provider,
          wallet.address,
          agent.vault_address,
          agent.amount_usd
        );
        await waitForTxReceipt(provider, hash);
        results.push({
          agent_id: agent.agent_id,
          tx_hash: hash,
          amount_usd: agent.amount_usd,
          status: "success",
        });
      }

      const response = await postInvestConfirm(threadId, results);
      const confirmed = response.tx_results ?? results;
      setTxResults(confirmed);
      setCardState("approved");
      onApproveSuccess(confirmed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Execution failed";
      setErrorMsg(msg);
      setCardState("error");
    }
  };

  const handleReject = async () => {
    setCardState("rejected");
    onRejectSuccess();
    // Fire-and-forget — cancel the backend thread
    await postCancel(threadId);
  };

  // -------------------------------------------------------------------------
  // Render: pending
  // -------------------------------------------------------------------------
  if (cardState === "pending") {
    return (
      <div className="w-full rounded-2xl border border-primary/20 bg-card/70 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_oklch(0.62_0.22_264_/_0.10)]">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border/30 bg-primary/5 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30 mt-0.5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm leading-tight">
              Proposed Allocation
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Distributing{" "}
              <span className="font-semibold text-foreground">
                ${totalAmount.toFixed(2)} USDC
              </span>{" "}
              from your wallet across {allocation.length} agent
              {allocation.length !== 1 ? "s" : ""} — review before signing
            </p>
          </div>
        </div>

        {/* Rows */}
        <div className="px-5 py-1">
          {allocation.map((agent) => (
            <AllocationRow
              key={agent.agent_id}
              agent={agent}
              profile={profileByAgentId[agent.agent_id]}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border/30 bg-card/30">
          <Button
            variant="outline"
            className="flex-1 h-9 text-sm border-border/40 text-muted-foreground hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-colors"
            onClick={handleReject}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
          <Button
            className="flex-1 h-9 text-sm bg-primary text-primary-foreground shadow-[0_0_16px_oklch(0.62_0.22_264_/_0.30)] hover:shadow-[0_0_22px_oklch(0.62_0.22_264_/_0.45)] hover:bg-primary/90 transition-all"
            onClick={handleApprove}
          >
            Approve &amp; Sign
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: approving — skeleton loading
  // -------------------------------------------------------------------------
  if (cardState === "approving") {
    return (
      <div className="w-full rounded-2xl border border-primary/20 bg-card/70 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_oklch(0.62_0.22_264_/_0.10)]">
        <div className="flex items-center gap-3 border-b border-border/30 bg-primary/5 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Signing Transactions</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Approve USDC transfers from your wallet on Base Sepolia…
            </p>
          </div>
        </div>
        <div className="px-5 py-1">
          {allocation.map((agent) => (
            <SkeletonRow key={agent.agent_id} />
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border/30 bg-card/30">
          <div className="h-9 w-full rounded-lg bg-muted/50 animate-pulse" />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: approved — success with tx results
  // -------------------------------------------------------------------------
  if (cardState === "approved") {
    return (
      <div className="w-full rounded-2xl border border-green-500/25 bg-card/70 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_oklch(0.62_0.22_145_/_0.08)]">
        <div className="flex items-center gap-3 border-b border-green-500/15 bg-green-500/5 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-500/10 ring-1 ring-green-500/30">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Transactions Executed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${totalAmount.toFixed(2)} USDC deployed on Base Sepolia
            </p>
          </div>
        </div>

        <div className="px-5 py-1">
          {txResults.map((tx) => (
            <div
              key={tx.agent_id}
              className="flex items-center justify-between py-2.5 border-b border-border/20 last:border-0"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    tx.status === "success" ? "bg-green-400" : "bg-destructive"
                  }`}
                />
                <span className="text-sm font-medium text-foreground">{tx.agent_id}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ${tx.amount_usd.toFixed(2)}
                </span>
              </div>
              {tx.tx_hash && tx.tx_hash !== "simulated_hash" ? (
                <a
                  href={`https://sepolia.basescan.org/tx/${tx.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  BaseScan
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-[10px] italic text-muted-foreground/50">Simulated</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: rejected
  // -------------------------------------------------------------------------
  if (cardState === "rejected") {
    return (
      <div className="w-full rounded-2xl border border-border/25 bg-card/40 backdrop-blur-xl overflow-hidden opacity-75">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/50">
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">Allocation Rejected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No funds were transferred. Thread cancelled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: error
  // -------------------------------------------------------------------------
  return (
    <div className="w-full rounded-2xl border border-destructive/30 bg-card/70 backdrop-blur-xl overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/25 mt-0.5">
          <AlertCircle className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <p className="font-medium text-foreground text-sm">Execution Failed</p>
          <p className="text-xs text-destructive/80 mt-0.5">{errorMsg}</p>
        </div>
      </div>
    </div>
  );
}
