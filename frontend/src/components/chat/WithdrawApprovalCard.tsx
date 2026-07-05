"use client";

import { useState } from "react";
import {
  AgentAllocation,
  TxResult,
  postApprove,
  postCancel,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  ArrowDownLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertCircle,
  Wallet,
} from "lucide-react";

type CardState = "pending" | "approving" | "approved" | "rejected" | "error";

interface WithdrawApprovalCardProps {
  threadId: string;
  allocation: AgentAllocation[];
  destinationWallet: string;
  onApproveSuccess: (results: TxResult[]) => void;
  onRejectSuccess: () => void;
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WithdrawApprovalCard({
  threadId,
  allocation,
  destinationWallet,
  onApproveSuccess,
  onRejectSuccess,
}: WithdrawApprovalCardProps) {
  const [cardState, setCardState] = useState<CardState>("pending");
  const [txResults, setTxResults] = useState<TxResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalAmount = allocation.reduce((acc, a) => acc + a.amount_usd, 0);

  const handleApprove = async () => {
    setCardState("approving");
    try {
      const response = await postApprove(threadId);
      const results = response.tx_results ?? [];
      setTxResults(results);
      setCardState("approved");
      onApproveSuccess(results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdraw failed";
      setErrorMsg(msg);
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
      <div className="w-full rounded-2xl border border-amber-500/25 bg-card/70 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_oklch(0.75_0.15_75_/_0.08)]">
        <div className="flex items-start gap-3 border-b border-amber-500/15 bg-amber-500/5 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 mt-0.5">
            <ArrowDownLeft className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm leading-tight">
              Proposed Withdrawal
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Returning{" "}
              <span className="font-semibold text-foreground">
                ${totalAmount.toFixed(2)} USDC
              </span>{" "}
              from {allocation.length} agent vault
              {allocation.length !== 1 ? "s" : ""} to your wallet
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-border/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>Destination:</span>
            <span className="font-mono text-foreground">{shortenAddress(destinationWallet)}</span>
          </div>
        </div>

        <div className="px-5 py-1">
          {allocation.map((item) => (
            <div
              key={item.agent_id}
              className="flex items-center justify-between py-2.5 border-b border-border/20 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  vault {shortenAddress(item.vault_address)}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground shrink-0 ml-3">
                ${item.amount_usd.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border/30 bg-card/30">
          <Button
            variant="outline"
            className="flex-1 h-9 text-sm border-border/40 text-muted-foreground hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30"
            onClick={handleReject}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
          <Button
            className="flex-1 h-9 text-sm bg-amber-500 text-black shadow-[0_0_16px_oklch(0.75_0.15_75_/_0.25)] hover:bg-amber-400"
            onClick={handleApprove}
          >
            Approve Withdrawal
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  if (cardState === "approving") {
    return (
      <div className="w-full rounded-2xl border border-amber-500/25 bg-card/70 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-amber-500/15 bg-amber-500/5 px-5 py-4">
          <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
          <div>
            <p className="font-semibold text-foreground text-sm">Processing Withdrawal</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sending USDC from agent vaults to your wallet…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (cardState === "approved") {
    return (
      <div className="w-full rounded-2xl border border-green-500/25 bg-card/70 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-green-500/15 bg-green-500/5 px-5 py-4">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <div>
            <p className="font-semibold text-foreground text-sm">Withdrawal Complete</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${totalAmount.toFixed(2)} USDC sent to {shortenAddress(destinationWallet)}
            </p>
          </div>
        </div>
        <div className="px-5 py-1">
          {txResults.map((tx) => (
            <div
              key={tx.agent_id}
              className="flex items-center justify-between py-2.5 border-b border-border/20 last:border-0"
            >
              <span className="text-sm text-foreground">{tx.agent_id}</span>
              {tx.tx_hash ? (
                <a
                  href={`https://sepolia.basescan.org/tx/${tx.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary"
                >
                  BaseScan <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cardState === "rejected") {
    return (
      <div className="w-full rounded-2xl border border-border/25 bg-card/40 opacity-75 px-5 py-4">
        <div className="flex items-center gap-3">
          <XCircle className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-foreground">Withdrawal rejected. No funds were moved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-destructive/30 bg-card/70 px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
        <div>
          <p className="font-medium text-foreground text-sm">Withdrawal Failed</p>
          <p className="text-xs text-destructive/80 mt-0.5">{errorMsg}</p>
        </div>
      </div>
    </div>
  );
}
