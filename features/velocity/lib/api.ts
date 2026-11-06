import api from "@/lib/axios"

export type VelocityOperation =
  | "serviceability"
  | "rates"
  | "forward-create"
  | "forward-assign"
  | "forward-orchestrate"
  | "reverse-create"
  | "order-update"
  | "order-cancel"
  | "tracking"
  | "reattempt"
  | "initiate-rto"
  | "shipments"
  | "returns"
  | "exchanges"
  | "warehouse"
  | "stores-list"
  | "store-get"
  | "store-create"
  | "store-update"
  | "variants-list"
  | "variant-create"
  | "variant-update"
  | "shipping-charges"
  | "cod-remittance"
  | "reports"

export type VelocityStatus = {
  configured: boolean
  base_url: string
  operations: string[]
  webhook_url: string
  webhook_auth_header: string
}

export const getVelocityStatus = async () => {
  const response = await api.get("/velocity/status")
  return response.data as VelocityStatus & { success: boolean }
}

export const runVelocityOperation = async (
  operation: VelocityOperation,
  payload: Record<string, unknown> = {},
  options: { id?: string; query?: Record<string, unknown> } = {}
) => {
  const response = await api.post(`/velocity/${operation}`, {
    payload,
    ...(options.id ? { id: options.id } : {}),
    ...(options.query ? { query: options.query } : {}),
  })
  return response.data?.data
}

export const getVelocityWebhookEvents = async () => {
  const response = await api.get("/velocity/webhook-events")
  return Array.isArray(response.data?.events) ? response.data.events : []
}

