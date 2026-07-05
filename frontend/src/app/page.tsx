"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Zap, LogOut, Copy, CheckCheck, Loader2, MessageSquare, BarChart2 } from "lucide-react";

import { ChatWindow, Message } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import { WithdrawApprovalCard } from "@/components/chat/WithdrawApprovalCard";
import { PortfolioView } from "@/components/chat/PortfolioView";
import { Button } from "@/components/ui/button";
import {
  postChat,
  TxResult,
  requestAuthToken,
  getAuthToken,
  clearAllSessionData,
  getStoredMessages,
  setStoredMessages,
  PersistedMessage,
  PendingApproval,
  getPendingApproval,
  setPendingApproval,
  clearPendingApproval,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "bot",
  content:
    "Hello! I'm the AutoAllocator AI.\n\nDescribe your investment goal and I'll discover reputation-verified DeFi agents on Base Sepolia, propose a USDC allocation, and execute it with your approval.\n\nYou need Base Sepolia USDC + a little ETH for gas in your connected wallet.\n\nTry: \"Earn yield on 5 USDC safely\"\nOr withdraw: \"Withdraw 3 USDC from StableFarmer\"",
};

// ---------------------------------------------------------------------------
// Address copy button
// ---------------------------------------------------------------------------
function AddressBadge({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:text-foreground"
    >
      {shortenAddress(address)}
      {copied ? (
        <CheckCheck className="h-3 w-3 text-green-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Home() {
  const { login, authenticated, logout, user, ready } = usePrivy();

  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [portfolioRefresh, setPortfolioRefresh] = useState(0);
  const [mobileTab, setMobileTab] = useState<"chat" | "portfolio">("chat");
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  // If Privy hasn't initialized after 4s (e.g. invalid_origin), fall through to landing
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setPrivyTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [ready]);

  const walletAddress = user?.wallet?.address ?? null;

  const handleApproveSuccess = (results: TxResult[], flowType: "invest" | "withdraw" = "invest") => {
    clearPendingApproval();
    setPortfolioRefresh((n) => n + 1);
    const lines = results
      .map(
        (tx) =>
          `• ${tx.agent_id}: $${tx.amount_usd.toFixed(2)} USDC` +
          (tx.tx_hash && tx.tx_hash !== "simulated_hash"
            ? ` — ${tx.tx_hash.slice(0, 10)}…`
            : "")
      )
      .join("\n");
    const content =
      flowType === "withdraw"
        ? `✅ Withdrawal executed successfully.\n\n${lines}`
        : `✅ Allocation executed successfully.\n\n${lines}`;
    setMessages((prev) =>
      prev.map((m) =>
        m.id.startsWith("approval-")
          ? { id: m.id.replace("approval-", "outcome-"), role: "bot", content }
          : m
      )
    );
  };

  const handleRejectSuccess = (flowType: "invest" | "withdraw" = "invest") => {
    clearPendingApproval();
    setMessages((prev) =>
      prev.map((m) =>
        m.id.startsWith("approval-")
          ? {
              id: m.id.replace("approval-", "outcome-"),
              role: "bot",
              content:
                flowType === "withdraw"
                  ? "Withdrawal rejected. No funds were transferred."
                  : "Allocation rejected. No funds were transferred.",
            }
          : m
      )
    );
  };

  /** Remove abandoned in-flight flows; keep completed summaries + outcomes. */
  const stripAbandonedFlows = (msgs: Message[]): Message[] =>
    msgs.filter((m) => {
      if (m.id.startsWith("approval-")) return false;
      if (m.id.startsWith("summary-")) {
        const tid = m.id.replace("summary-", "");
        return msgs.some((o) => o.id === `outcome-${tid}`);
      }
      return true;
    });

  const renderApprovalCard = (pending: PendingApproval) => {
    if (pending.flowType === "withdraw" && pending.destinationWallet) {
      return (
        <WithdrawApprovalCard
          threadId={pending.threadId}
          allocation={pending.allocation}
          destinationWallet={pending.destinationWallet}
          onApproveSuccess={(r) => handleApproveSuccess(r, "withdraw")}
          onRejectSuccess={() => handleRejectSuccess("withdraw")}
        />
      );
    }
    return (
      <ApprovalCard
        threadId={pending.threadId}
        walletAddress={walletAddress ?? ""}
        allocation={pending.allocation}
        agentProfiles={pending.agentProfiles}
        onApproveSuccess={(r) => handleApproveSuccess(r, "invest")}
        onRejectSuccess={() => handleRejectSuccess("invest")}
      />
    );
  };

  const makeApprovalMessages = (pending: PendingApproval): Message[] => [
    {
      id: `summary-${pending.threadId}`,
      role: "bot",
      content: pending.summaryLine,
    },
    {
      id: `approval-${pending.threadId}`,
      role: "bot",
      content: renderApprovalCard(pending),
    },
  ];

  // -------------------------------------------------------------------------
  // Hydrate from localStorage after mount (client-only)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const storedMsgs = getStoredMessages();
    const pending = getPendingApproval();

    const msgs: Message[] =
      storedMsgs.length > 0
        ? storedMsgs
            .filter(
              (m) =>
                !m.id.startsWith("rejected-") && !m.id.startsWith("success-")
            )
            .map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))
        : [WELCOME_MESSAGE];

    if (pending) {
      const normalized: PendingApproval = {
        ...pending,
        flowType: pending.flowType ?? "invest",
      };
      const hasApproval = msgs.some((m) => m.id === `approval-${normalized.threadId}`);
      if (!hasApproval) {
        const hasSummary = msgs.some((m) => m.id === `summary-${normalized.threadId}`);
        if (!hasSummary) {
          msgs.push({
            id: `summary-${normalized.threadId}`,
            role: "bot",
            content: normalized.summaryLine,
          });
        }
        msgs.push(...makeApprovalMessages(normalized).filter((m) => m.id.startsWith("approval-")));
      }
    }

    setMessages(msgs);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist messages on every change — only after hydration to avoid
  // overwriting stored data with the initial empty render.
  useEffect(() => {
    if (!hydrated) return;
    const serialisable: PersistedMessage[] = messages
      .filter((m) => typeof m.content === "string" && !m.isLoading)
      .map((m) => ({ id: m.id, role: m.role, content: m.content as string }));
    setStoredMessages(serialisable);
  }, [messages, hydrated]);

  // -------------------------------------------------------------------------
  // Auth — issue JWT when wallet connects (never clear data on refresh)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!ready || !authenticated || !walletAddress) return;
    if (!getAuthToken()) {
      requestAuthToken(walletAddress).catch((err) => {
        console.error("Auth token request failed:", err);
      });
    }
  }, [ready, authenticated, walletAddress]);

  const handleLogout = () => {
    clearAllSessionData();
    setMessages([WELCOME_MESSAGE]);
    setPortfolioRefresh(0);
    logout();
  };

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------
  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: "loading", role: "bot", content: "", isLoading: true },
    ]);
    setIsLoading(true);

    try {
      const response = await postChat(text);

      setMessages((prev) => prev.filter((m) => m.id !== "loading"));

      if (response.status === "awaiting_approval" && response.allocation?.length) {
        const intent = response.parsed_intent as {
          action?: string;
          amount_usd?: number;
          risk_tolerance?: string;
          target_agent?: string;
        } | null;

        const flowType = response.flow_type ?? (intent?.action === "withdraw" ? "withdraw" : "invest");
        const totalUsd = response.allocation.reduce((s, a) => s + a.amount_usd, 0);

        let summaryLine: string;
        if (flowType === "withdraw") {
          const dest = response.destination_wallet ?? walletAddress ?? "your wallet";
          const destShort = dest ? `${dest.slice(0, 6)}…${dest.slice(-4)}` : "your wallet";
          if (intent?.target_agent) {
            summaryLine = `Ready to withdraw $${totalUsd.toFixed(2)} USDC from ${intent.target_agent} to ${destShort}.`;
          } else if (intent?.amount_usd && intent.amount_usd > 0) {
            summaryLine = `Ready to withdraw $${totalUsd.toFixed(2)} USDC across your positions to ${destShort}.`;
          } else {
            summaryLine = `Ready to withdraw all $${totalUsd.toFixed(2)} USDC to ${destShort}.`;
          }
        } else {
          summaryLine = intent
            ? `Found ${response.allocation.length} agent${response.allocation.length !== 1 ? "s" : ""} for your ${intent.risk_tolerance ?? ""} ${intent.action ?? "investment"} of $${intent.amount_usd?.toFixed(0) ?? "?"} USDC.`
            : `Found ${response.allocation.length} suitable agent${response.allocation.length !== 1 ? "s" : ""}. Review the proposed allocation below.`;
        }

        const pending: PendingApproval = {
          threadId: response.thread_id,
          flowType,
          allocation: response.allocation!,
          agentProfiles: response.agent_profiles,
          summaryLine,
          destinationWallet: response.destination_wallet ?? walletAddress ?? undefined,
        };
        setPendingApproval(pending);

        setMessages((prev) => {
          const cleaned = stripAbandonedFlows(prev);
          return [
            ...cleaned,
            {
              id: `summary-${response.thread_id}`,
              role: "bot",
              content: summaryLine,
            },
            {
              id: `approval-${response.thread_id}`,
              role: "bot",
              content: renderApprovalCard(pending),
            },
          ];
        });
      } else if (response.tx_results?.length) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "bot",
            content: `✅ Allocation executed directly.\n\n${response.tx_results!
              .map(
                (tx) =>
                  `• ${tx.agent_id}: $${tx.amount_usd.toFixed(2)} — ${
                    tx.tx_hash && tx.tx_hash !== "simulated_hash"
                      ? tx.tx_hash.slice(0, 12) + "…"
                      : "simulated"
                  }`
              )
              .join("\n")}`,
          },
        ]);
        setPortfolioRefresh((n) => n + 1);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "bot",
            content:
              "I couldn't find any agents matching your criteria. Try adjusting your strategy or risk tolerance.",
          },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== "loading"));
      const message =
        err instanceof Error ? err.message : "Error communicating with the backend.";
      const isAuthError = message.toLowerCase().includes("401") || message.toLowerCase().includes("session");
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "bot",
          content: isAuthError
            ? "⚠️ Session expired. Please disconnect and reconnect your wallet."
            : `⚠️ ${message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };


  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const portfolioEnabled = ready && !!walletAddress;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-foreground/70" />
          <span className="text-[13px] font-semibold tracking-tight">AutoAllocator</span>
        </div>

        <div className="flex items-center gap-1.5">
          {authenticated && walletAddress ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                Base Sepolia
              </div>
              <AddressBadge address={walletAddress} />
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-3 w-3" />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            </>
          ) : (
            <Button onClick={login} size="sm" className="h-7 px-3 text-xs">
              Connect Wallet
            </Button>
          )}
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* States                                                           */}
      {/* ---------------------------------------------------------------- */}
      {!ready && !privyTimedOut ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>

      ) : authenticated ? (
        <>
          {/* ---- Main content area ---- */}
          <div className="flex flex-1 overflow-hidden">

            {/* Chat — full width on mobile; 50% on desktop */}
            <div className={[
              "flex flex-col overflow-hidden",
              mobileTab === "chat" ? "flex-1" : "hidden",
              "md:flex md:w-1/2 md:shrink-0",
            ].join(" ")}>
              <ChatWindow messages={messages} />
              <div className="shrink-0 border-t border-border">
                <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
              </div>
            </div>

            {/* Portfolio — full width on mobile; 50% on desktop */}
            <div className={[
              "flex flex-col overflow-hidden border-border",
              mobileTab === "portfolio" ? "flex-1 flex" : "hidden",
              "md:flex md:w-1/2 md:shrink-0 md:border-l",
            ].join(" ")}>
              <PortfolioView refreshTrigger={portfolioRefresh} enabled={portfolioEnabled} />
            </div>
          </div>

          {/* ---- Mobile bottom tab bar (hidden on desktop) ---- */}
          <nav className="flex shrink-0 border-t border-border md:hidden">
            <button
              onClick={() => setMobileTab("chat")}
              className={[
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                mobileTab === "chat" ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              <MessageSquare className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              Chat
            </button>
            <button
              onClick={() => setMobileTab("portfolio")}
              className={[
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                mobileTab === "portfolio" ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              <BarChart2 className="h-[18px] w-[18px]" />
              Portfolio
            </button>
          </nav>
        </>

      ) : (
        /* ---------------------------------------------------------------- */
        /* Landing                                                          */
        /* ---------------------------------------------------------------- */
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">

            {/* Logo mark */}
            <div className="mb-8 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">
                <Zap className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">AutoAllocator</span>
            </div>

            {/* Headline */}
            <h1 className="mb-3 text-3xl font-semibold leading-tight tracking-tight text-foreground">
              DeFi capital,<br />routed by AI.
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              Describe your goal in plain English. AutoAllocator finds
              reputation-verified agents on Base Sepolia, proposes an
              allocation across vaults, and executes only after you approve.
            </p>

            {/* Steps */}
            <ol className="mb-8 space-y-3">
              {[
                { n: "1", text: "Connect your wallet" },
                { n: "2", text: "Describe your investment goal" },
                { n: "3", text: "Review allocation & sign USDC transfers" },
              ].map((s) => (
                <li key={s.n} className="flex items-center gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
                    {s.n}
                  </span>
                  <span className="text-muted-foreground">{s.text}</span>
                </li>
              ))}
            </ol>

            {/* CTA */}
            <Button onClick={login} className="h-11 w-full text-sm font-medium">
              Connect Wallet
            </Button>

            <p className="mt-4 text-[11px] text-muted-foreground/40 text-center">
              Testnet only · Base Sepolia · No real funds at risk
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
