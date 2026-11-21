/**
 * Validate core API readiness without requiring optional staged capabilities.
 * Customer booking is intentionally fail-closed until its schema rollout is approved.
 */
export function validateReadiness(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("expected a JSON object");
  }
  if (body.readiness !== "ready" || body.schema !== "legacy-compatible") {
    throw new Error(`expected readiness="ready" and schema="legacy-compatible", got ${JSON.stringify(body)}`);
  }
  const warnings = [];
  if (body.capabilities?.customerBooking === false ||
      body.disabledFeatures?.includes("customer_booking")) {
    warnings.push("customer_booking");
  }
  return warnings;
}


/** Validate that the public admin-session endpoint does not authenticate a caller without a cookie. */
export function validateUnauthenticatedAdminSession(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("expected a JSON object");
  }
  if (body.authenticated !== false) {
    throw new Error(`expected authenticated=false, got ${JSON.stringify(body)}`);
  }
}
