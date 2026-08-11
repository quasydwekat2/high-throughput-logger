/** GET /health body */
export interface HealthStatusResponse {
  status: "ok" | "unavailable";
}
