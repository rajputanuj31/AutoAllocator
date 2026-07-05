const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000");

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const THREAD_KEY = "allocator_thread_id";
const TOKEN_KEY = "allocator_auth_token";
const MESSAGES_KEY = "allocator_messages";
const TRANSACTIONS_KEY = "allocator_transactions";
const PENDING_APPROVAL_KEY = "allocator_pending_approval";

// ---------------------------------------------------------------------------
// Thread ID persistence
// ---------------------------------------------------------------------------
export function getStoredThreadId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(THREAD_KEY);
}

export function setStoredThreadId(id: string): void {
  if (typeof window !== "undefined") localStorage.setItem(THREAD_KEY, id);
}

export function clearStoredThreadId(): void {
  if (typeof window !== "undefined") localStorage.removeItem(THREAD_KEY);
}

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Persisted message type (only string-content messages can be serialised)
// ---------------------------------------------------------------------------
export interface PersistedMessage {
  id: string;
  role: "user" | "bot";
  content: string;
}

export function getStoredMessages(): PersistedMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as PersistedMessage[]) : [];
  } catch {
    return [];
  }
}

export function setStoredMessages(messages: PersistedMessage[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  }
}

// ---------------------------------------------------------------------------
// Clear all session data (call on logout)
// ---------------------------------------------------------------------------
export function clearAllSessionData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(THREAD_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MESSAGES_KEY);
  localStorage.removeItem(TRANSACTIONS_KEY);
  localStorage.removeItem(PENDING_APPROVAL_KEY);
}

// ---------------------------------------------------------------------------
// Pending approval (survives refresh)
// ---------------------------------------------------------------------------
export interface PendingApproval {
  threadId: string;
  flowType: "invest" | "withdraw";
  allocation: AgentAllocation[];
  agentProfiles?: AgentProfile[];
  summaryLine: string;
  destinationWallet?: string;
}

export function getPendingApproval(): PendingApproval | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_APPROVAL_KEY);
    return raw ? (JSON.parse(raw) as PendingApproval) : null;
  } catch {
    return null;
  }
}

export function setPendingApproval(pending: PendingApproval): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PENDING_APPROVAL_KEY, JSON.stringify(pending));
  }
}

export function clearPendingApproval(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(PENDING_APPROVAL_KEY);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AgentCandidate {
  agent_id: string | number;
  name: string;
  strategy: string;
  vault_address: string;
  description: string;
  registration_block: number;
  score: number;
}

export interface AgentAllocation {
  agent_id: string;
  name: string;
  score: number;
  strategy: string;
  percentage: number;
  amount_usd: number;
  vault_address: string;
}

export interface TxResult {
  agent_id: string;
  tx_hash: string;
  amount_usd: number;
  status: "success" | "failed";
}

export interface PortfolioPosition {
  agent_id: string;
  agent_name: string;
  strategy: string;
  vault_address: string;
  amount_usd: number;
  deposit_count: number;
  last_deposit_at: string | null;
  reputation_score: number | null;
  vault_tvl_usd: number;
}

export interface PortfolioResponse {
  wallet_address: string;
  total_usd: number;
  position_count: number;
  positions: PortfolioPosition[];
}

export interface PortfolioHistoryEvent {
  id: number;
  event_type: string;
  agent_id: string;
  agent_name: string;
  vault_address: string;
  amount_usd: number;
  tx_hash: string;
  status: "success" | "simulated";
  created_at: string;
}

export interface PortfolioHistoryResponse {
  wallet_address: string;
  event_count: number;
  events: PortfolioHistoryEvent[];
}

export interface AgentReputation {
  score: number;
  positive_count: number;
  negative_count: number;
  total_count: number;
  last_feedback_at: string | null;
}

export interface AgentProfile {
  agent_id: string;
  name: string;
  strategy: string;
  description: string;
  vault_address: string;
  owner: string | null;
  registered_at: string | null;
  registration_block: number;
  reputation: AgentReputation;
  vault_tvl_usd: number;
  your_position_usd: number;
}

export interface ChatResponse {
  thread_id: string;
  flow_type?: "invest" | "withdraw";
  destination_wallet?: string | null;
  parsed_intent?: unknown;
  candidates?: AgentCandidate[];
  allocation?: AgentAllocation[];
  agent_profiles?: AgentProfile[];
  tx_results?: TxResult[];
  status: "completed" | "awaiting_approval";
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Exchange a wallet address for a signed JWT. */
export async function requestAuthToken(walletAddress: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Authentication failed");
  }
  const data = await res.json() as { token: string };
  setAuthToken(data.token);
  return data.token;
}

/** Fetch a single agent profile (optional — profiles also come with /chat). */
export async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  const res = await fetch(`${API_URL}/agents/${agentId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Failed to load agent profile");
  }
  return res.json();
}

/** Send a chat message. Thread ID is persisted automatically. */
export async function postChat(message: string): Promise<ChatResponse> {
  const thread_id = getStoredThreadId();
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message, thread_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Failed to send message");
  }
  const data: ChatResponse = await res.json();
  setStoredThreadId(data.thread_id);
  return data;
}

/** Resume a paused withdraw flow. */
export async function postApprove(thread_id: string): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ thread_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Failed to approve allocation");
  }
  clearStoredThreadId();
  return res.json();
}

/** Confirm wallet-signed USDC deposits after invest approval. */
export async function postInvestConfirm(
  thread_id: string,
  tx_results: TxResult[]
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/invest/confirm`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ thread_id, tx_results }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Failed to confirm investment");
  }
  clearStoredThreadId();
  return res.json();
}

/** Aggregated active positions from the server ledger. */
export async function getPortfolio(): Promise<PortfolioResponse> {
  const res = await fetch(`${API_URL}/portfolio`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Failed to load portfolio");
  }
  return res.json();
}

/** Deposit history from the server ledger. */
export async function getPortfolioHistory(limit = 100): Promise<PortfolioHistoryResponse> {
  const res = await fetch(`${API_URL}/portfolio/history?limit=${limit}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? "Failed to load portfolio history");
  }
  return res.json();
}

/** Cancel a paused allocation — prevents future approval of this thread. */
export async function postCancel(thread_id: string): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/cancel`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ thread_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { detail?: string };
      console.warn("Cancel request failed:", err.detail);
    }
  } catch (err) {
    console.warn("Cancel request error:", err);
  } finally {
    clearStoredThreadId();
  }
}
