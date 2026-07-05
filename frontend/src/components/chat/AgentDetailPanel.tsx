"use client";

import { AgentProfile } from "@/lib/api";
import { ExternalLink, AlertTriangle } from "lucide-react";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface AgentDetailPanelProps {
  profile: AgentProfile;
  allocationPercentage?: number;
}

export function AgentDetailPanel({
  profile,
  allocationPercentage,
}: AgentDetailPanelProps) {
  const { reputation } = profile;
  const warnings: string[] = [];

  if (reputation.score < 500) {
    warnings.push("Below-average reputation score");
  }
  if (profile.vault_tvl_usd === 0) {
    warnings.push("This agent's vault holds no USDC yet");
  }
  if (allocationPercentage !== undefined && allocationPercentage > 60) {
    warnings.push(`High concentration: ${allocationPercentage.toFixed(0)}% of allocation`);
  }

  return (
    <div className="mt-2 rounded-xl border border-border/30 bg-background/50 p-3 text-xs space-y-3">
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {warnings.map((w) => (
            <div
              key={w}
              className="flex items-center gap-1.5 text-amber-400/90 bg-amber-500/10 rounded-lg px-2 py-1"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {profile.description && (
        <p className="text-muted-foreground leading-relaxed">{profile.description}</p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px]">Score</p>
          <p className="font-semibold text-foreground">{reputation.score} / 1000</p>
        </div>
        <div>
          <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px]">Feedback</p>
          <p className="text-foreground">
            <span className="text-green-400">{reputation.positive_count} pos</span>
            {" · "}
            <span className="text-destructive/80">{reputation.negative_count} neg</span>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px]">Registered</p>
          <p className="text-foreground">{formatDate(profile.registered_at)}</p>
        </div>
        <div>
          <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px]">
            Vault balance (on-chain)
          </p>
          <p className="text-foreground tabular-nums">${profile.vault_tvl_usd.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">USDC in this vault now</p>
        </div>
        {profile.your_position_usd > 0 && (
          <div className="col-span-2">
            <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px]">
              Total recorded with agent
            </p>
            <p className="text-primary font-semibold tabular-nums">
              ${profile.your_position_usd.toFixed(2)} USDC
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Cumulative deposits logged by the app — may differ from vault balance
            </p>
          </div>
        )}
      </div>

      {profile.owner && (
        <div>
          <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px] mb-0.5">Owner</p>
          <a
            href={`https://sepolia.basescan.org/address/${profile.owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-primary hover:text-primary/80"
          >
            {shortenAddress(profile.owner)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}

      {profile.vault_address && (
        <div>
          <p className="text-muted-foreground/60 uppercase tracking-wide text-[10px] mb-0.5">Vault</p>
          <a
            href={`https://sepolia.basescan.org/address/${profile.vault_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground"
          >
            {shortenAddress(profile.vault_address)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}
    </div>
  );
}
