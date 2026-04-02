import type { OrderRequest, OrderResponse } from "@/types/ws";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function placeOrder(order: OrderRequest): Promise<OrderResponse> {
  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
