import type { OrderRequest, OrderResponse } from "@/types/ws";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function getSessionId(): string {
  let id = localStorage.getItem("trading_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("trading_session_id", id);
  }
  return id;
}

export async function placeOrder(order: OrderRequest): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": getSessionId(),
    },
    body: JSON.stringify(order),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as OrderResponse;
}

export async function cancelOrder(orderId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/orders/${orderId}`, {
    method: "DELETE",
    headers: {
      "X-Session-ID": getSessionId(),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
