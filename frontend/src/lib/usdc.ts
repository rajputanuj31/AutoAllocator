/** Base Sepolia USDC + transfer helpers (no extra deps). */

export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function usdcToAtomic(amountUsd: number): bigint {
  return BigInt(Math.floor(amountUsd * 1_000_000));
}

/** ERC-20 transfer(address,uint256) calldata. */
export function encodeUsdcTransfer(to: string, amountAtomic: bigint): string {
  const selector = "a9059cbb";
  const paddedTo = to.toLowerCase().replace("0x", "").padStart(64, "0");
  const paddedAmt = amountAtomic.toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmt}`;
}

export async function ensureBaseSepolia(provider: EthereumProvider): Promise<void> {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === BASE_SEPOLIA_CHAIN_ID_HEX) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        },
      ],
    });
  }
}

export async function sendUsdcTransfer(
  provider: EthereumProvider,
  from: string,
  toVault: string,
  amountUsd: number
): Promise<string> {
  const data = encodeUsdcTransfer(toVault, usdcToAtomic(amountUsd));
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: USDC_ADDRESS,
        data,
        chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
      },
    ],
  })) as string;
  return hash;
}

export async function waitForTxReceipt(
  provider: EthereumProvider,
  txHash: string,
  timeoutMs = 120_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    })) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") throw new Error(`Transaction reverted: ${txHash}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for transaction confirmation.");
}
