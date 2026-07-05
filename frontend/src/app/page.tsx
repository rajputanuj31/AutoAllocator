"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Zap, LogOut, Wifi, Copy, CheckCheck, Loader2 } from "lucide-react";

import { ChatWindow, Message } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import { TransactionHistory } from "@/components/chat/TransactionHistory";
import { Button } from "@/components/ui/button";
import {
  postChat,
  TxResult,
  requestAuthToken,
  getAuthToken,
  clearAllSessionData,
  getStoredMessages,
  setStoredMessages,
  getStoredTransactions,
  setStoredTransactions,
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
    "Hello! I'm the AutoAllocator AI.\n\nDescribe your investment goal and I'll discover reputation-verified DeFi agents on Base Sepolia, propose a USDC allocation, and execute it with your approval.\n\nTry: \"Earn yield on 5 000 USDC safely\"",
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
      className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-secondary/60 px-2.5 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground"
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
  const [transactions, setTransactions] = useState<TxResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const walletAddress = user?.wallet?.address ?? null;

  const handleApproveSuccess = (results: TxResult[]) => {
    setTransactions((prev) => [...prev, ...results]);
    clearPendingApproval();
    const lines = results
      .map(
        (tx) =>
          `• ${tx.agent_id}: $${tx.amount_usd.toFixed(2)} USDC` +
          (tx.tx_hash && tx.tx_hash !== "simulated_hash"
            ? ` — ${tx.tx_hash.slice(0, 10)}…`
            : "")
      )
      .join("\n");
    const content = `✅ Allocation executed successfully.\n\n${lines}`;
    setMessages((prev) =>
      prev.map((m) =>
        m.id.startsWith("approval-")
          ? { id: m.id.replace("approval-", "outcome-"), role: "bot", content }
          : m
      )
    );
  };

  const handleRejectSuccess = () => {
    clearPendingApproval();
    setMessages((prev) =>
      prev.map((m) =>
        m.id.startsWith("approval-")
          ? {
              id: m.id.replace("approval-", "outcome-"),
              role: "bot",
              content: "Allocation rejected. No funds were transferred.",
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

  const makeApprovalMessages = (
    pending: PendingApproval
  ): Message[] => [
    {
      id: `summary-${pending.threadId}`,
      role: "bot",
      content: pending.summaryLine,
    },
    {
      id: `approval-${pending.threadId}`,
      role: "bot",
      content: (
        <ApprovalCard
          threadId={pending.threadId}
          allocation={pending.allocation}
          agentProfiles={pending.agentProfiles}
          onApproveSuccess={handleApproveSuccess}
          onRejectSuccess={handleRejectSuccess}
        />
      ),
    },
  ];

  // -------------------------------------------------------------------------
  // Hydrate from localStorage after mount (client-only)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const storedMsgs = getStoredMessages();
    const pending = getPendingApproval();
    const storedTxs = getStoredTransactions();

    let msgs: Message[] =
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
      const hasApproval = msgs.some((m) => m.id === `approval-${pending.threadId}`);
      if (!hasApproval) {
        const hasSummary = msgs.some((m) => m.id === `summary-${pending.threadId}`);
        if (!hasSummary) {
          msgs.push({
            id: `summary-${pending.threadId}`,
            role: "bot",
            content: pending.summaryLine,
          });
        }
        msgs.push(...makeApprovalMessages(pending).filter((m) => m.id.startsWith("approval-")));
      }
    }

    setMessages(msgs);
    if (storedTxs.length > 0) setTransactions(storedTxs);
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

  // Persist transactions on every change
  useEffect(() => {
    if (!hydrated) return;
    setStoredTransactions(transactions);
  }, [transactions, hydrated]);

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
    setTransactions([]);
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
        } | null;

        const summaryLine = intent
          ? `Found ${response.allocation.length} agent${response.allocation.length !== 1 ? "s" : ""} for your ${intent.risk_tolerance ?? ""} ${intent.action ?? "investment"} of $${intent.amount_usd?.toFixed(0) ?? "?"} USDC.`
          : `Found ${response.allocation.length} suitable agent${response.allocation.length !== 1 ? "s" : ""}. Review the proposed allocation below.`;

        const pending: PendingApproval = {
          threadId: response.thread_id,
          allocation: response.allocation!,
          agentProfiles: response.agent_profiles,
          summaryLine,
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
              content: (
                <ApprovalCard
                  threadId={response.thread_id}
                  allocation={response.allocation!}
                  agentProfiles={response.agent_profiles}
                  onApproveSuccess={handleApproveSuccess}
                  onRejectSuccess={handleRejectSuccess}
                />
              ),
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
        setTransactions((prev) => [...prev, ...response.tx_results!]);
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
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      {/* Ambient glow behind everything */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/6 blur-[100px]" />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}
      <header className="relative z-10 flex items-center justify-between border-b border-border/25 bg-background/60 px-4 py-3 backdrop-blur-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold gradient-text">AutoAllocator</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {authenticated && walletAddress ? (
            <>
              {/* Network pill */}
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border/30 bg-secondary/50 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">
                <Wifi className="h-2.5 w-2.5 text-green-400" />
                Base Sepolia
              </div>

              {/* Wallet address */}
              <AddressBadge address={walletAddress} />

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            </>
          ) : (
            <Button
              onClick={login}
              size="sm"
              className="h-8 px-4 text-xs bg-primary text-primary-foreground glow-primary hover:bg-primary/90 transition-all"
            >
              Connect Wallet
            </Button>
          )}
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Authenticated: chat + sidebar                                    */}
      {/* ---------------------------------------------------------------- */}
      {!ready ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Connecting wallet…</p>
        </div>
      ) : authenticated ? (
        <div className="relative z-10 flex flex-1 overflow-hidden">
          {/* Chat panel */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <ChatWindow messages={messages} />
            <div className="border-t border-border/20 bg-background/50 backdrop-blur-sm">
              <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
            </div>
          </div>

          {/* Transaction history sidebar */}
          <aside className="hidden w-72 shrink-0 flex-col border-l border-border/20 bg-background/30 backdrop-blur-sm md:flex">
            <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Transactions
              </span>
              {transactions.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {transactions.length}
                </span>
              )}
            </div>
            <TransactionHistory transactions={transactions} />
          </aside>
        </div>
      ) : (
        /* ---------------------------------------------------------------- */
        /* Landing / unauthenticated                                        */
        /* ---------------------------------------------------------------- */
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            {/* Icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25 shadow-[0_0_40px_oklch(0.62_0.22_264_/_0.20)]">
              <Zap className="h-8 w-8 text-primary" />
            </div>

            <h1 className="mb-2 text-2xl font-semibold text-foreground">
              AI-Powered Capital Router
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              Describe your investment goal in plain English. AutoAllocator
              discovers reputation-verified agents on Base Sepolia, proposes an
              allocation, and executes USDC transfers with your approval.
            </p>

            {/* Feature grid */}
            <div className="mb-8 grid grid-cols-3 gap-2 text-left">
              {[
                { icon: "🔍", title: "Discover", desc: "ERC-8004 on-chain agents" },
                { icon: "⭐", title: "Filter", desc: "Reputation score ≥ 400" },
                { icon: "⚡", title: "Execute", desc: "USDC via Coinbase CDP" },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-border/25 bg-card/50 p-3"
                >
                  <div className="mb-1 text-base">{f.icon}</div>
                  <p className="text-xs font-semibold text-foreground">{f.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>

            <Button
              onClick={login}
              className="h-11 w-full bg-primary text-primary-foreground text-sm font-medium shadow-[0_0_30px_oklch(0.62_0.22_264_/_0.40)] hover:shadow-[0_0_40px_oklch(0.62_0.22_264_/_0.55)] hover:bg-primary/90 transition-all"
            >
              Connect Wallet to Start
            </Button>

            <p className="mt-3 text-[10px] text-muted-foreground/40">
              Testnet only · Base Sepolia · No real funds at risk
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
