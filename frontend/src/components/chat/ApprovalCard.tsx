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
  onApproveSuccess: (results: TxResult[]) => void;
  onRejectSuccess: () => void;
}

function AllocationRow({
  agent,
  profile,
}: {
  agent: AgentAllocation;
  profile?: AgentProfile;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-0 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {agent.strategy}
              </span>
              {profile && (
                <span className="text-[10px] text-muted-foreground">
                  · Score {profile.reputation.score}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-14 h-0.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/50 transition-all"
                style={{ width: `${agent.percentage}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground w-7 text-right tabular-nums">
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
            className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" />Hide details</>
            ) : (
              <><ChevronDown className="h-3 w-3" />View details</>
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
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0 animate-pulse">
      <div className="h-1.5 w-1.5 rounded-full bg-border shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 w-28 rounded-full bg-border" />
        <div className="h-2 w-16 rounded-full bg-border/60" />
      </div>
      <div className="h-2.5 w-14 rounded-full bg-border" />
    </div>
  );
}

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

      if (!wallet) throw new Error("No connected wallet found. Reconnect and try again.");

      const provider = await wallet.getEthereumProvider();
      await ensureBaseSepolia(provider);

      const results: TxResult[] = [];
      for (const agent of allocation) {
        const hash = await sendUsdcTransfer(provider, wallet.address, agent.vault_address, agent.amount_usd);
        await waitForTxReceipt(provider, hash);
        results.push({ agent_id: agent.agent_id, tx_hash: hash, amount_usd: agent.amount_usd, status: "success" });
      }

      const response = await postInvestConfirm(threadId, results);
      const confirmed = response.tx_results ?? results;
      setTxResults(confirmed);
      setCardState("approved");
      onApproveSuccess(confirmed);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Execution failed");
      setCardState("error");
    }
  };

  const handleReject = async () => {
    setCardState("rejected");
    onRejectSuccess();
    await postCancel(threadId);
  };

  if (cardState === "pending") {
    return (
      <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="font-medium text-foreground text-sm">Proposed Allocation</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            ${totalAmount.toFixed(2)} USDC across {allocation.length} agent{allocation.length !== 1 ? "s" : ""} — review before signing
          </p>
        </div>
        <div className="px-5 py-1">
          {allocation.map((agent) => (
            <AllocationRow key={agent.agent_id} agent={agent} profile={profileByAgentId[agent.agent_id]} />
          ))}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1 h-9 text-sm" onClick={handleReject}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
          <Button className="flex-1 h-9 text-sm" onClick={handleApprove}>
            Approve & Sign
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  if (cardState === "approving") {
    return (
      <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground text-sm">Signing Transactions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Approve USDC transfers from your wallet…</p>
          </div>
        </div>
        <div className="px-5 py-1">
          {allocation.map((agent) => <SkeletonRow key={agent.agent_id} />)}
        </div>
        <div className="px-5 py-4 border-t border-border">
          <div className="h-9 w-full rounded-lg bg-border/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (cardState === "approved") {
    return (
      <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <div>
            <p className="font-medium text-foreground text-sm">Transactions Executed</p>
            <p className="text-xs text-muted-foreground mt-0.5">${totalAmount.toFixed(2)} USDC deployed on Base Sepolia</p>
          </div>
        </div>
        <div className="px-5 py-1">
          {txResults.map((tx) => (
            <div key={tx.agent_id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2.5">
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${tx.status === "success" ? "bg-emerald-500" : "bg-destructive"}`} />
                <span className="text-sm text-foreground">{tx.agent_id}</span>
                <span className="text-xs text-muted-foreground tabular-nums">${tx.amount_usd.toFixed(2)}</span>
              </div>
              {tx.tx_hash && tx.tx_hash !== "simulated_hash" ? (
                <a href={`https://sepolia.basescan.org/tx/${tx.tx_hash}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  BaseScan <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-[10px] italic text-muted-foreground/40">Simulated</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cardState === "rejected") {
    return (
      <div className="w-full rounded-xl border border-border bg-card/40 px-5 py-4 opacity-60">
        <div className="flex items-center gap-3">
          <XCircle className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-foreground">Allocation rejected. No funds were transferred.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-destructive/30 bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
        <div>
          <p className="font-medium text-foreground text-sm">Execution Failed</p>
          <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
        </div>
      </div>
    </div>
  );
}
