export function verifyAdminSecret(request: Request, body?: Record<string, unknown>): boolean {
  const configuredSecret = process.env.ADMIN_SECRET || "gullyquiz_dev_secret_2026";

  const headerSecret = request.headers.get("x-admin-secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const bodySecret = typeof body?.adminSecret === "string" ? body.adminSecret : null;

  const provided = (headerSecret || bearerSecret || bodySecret || "").trim();
  return Boolean(provided && provided === configuredSecret);
}
