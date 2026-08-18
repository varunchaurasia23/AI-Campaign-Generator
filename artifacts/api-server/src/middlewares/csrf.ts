/**
 * CSRF protection — signed double-submit cookie pattern.
 *
 * Flow:
 *  1. Any admin GET request (via setCsrfCookie) generates a token, signs it
 *     with SESSION_SECRET via HMAC-SHA256, and sets a readable `_csrf` cookie.
 *  2. State-changing routes (POST /admin/login, POST /admin/logout) call
 *     `requireCsrf`, which reads the `X-CSRF-Token` header, splits it back
 *     into [token, sig], recomputes the expected signature, and compares with
 *     timingSafeEqual.  Mismatch → 403.
 *
 * Security properties:
 *  - Attacker on a different origin cannot read the `_csrf` cookie value
 *    because cookies are same-origin readable only.
 *  - Even if an attacker knew the token they couldn't forge a valid signature
 *    without SESSION_SECRET.
 *  - Comparison is constant-time (timingSafeEqual on equal-length SHA-256 buffers).
 */

import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { type Request, type Response, type NextFunction } from "express";

const COOKIE_NAME = "_csrf";
const HEADER_NAME = "x-csrf-token";
const SEPARATOR = ".";

/** Maximum age for the CSRF cookie: 1 hour (matched to typical session activity) */
const CSRF_MAX_AGE_SEC = 60 * 60;

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set — CSRF protection cannot function");
  return s;
}

function sign(token: string): string {
  return createHmac("sha256", getSecret()).update(token).digest("hex");
}

/**
 * Encode the full cookie value: `<token>.<signature>`
 */
function encode(token: string): string {
  return `${token}${SEPARATOR}${sign(token)}`;
}

/**
 * Validate a full cookie/header value `<token>.<signature>`.
 * Returns true only when the HMAC is correct.
 */
function verify(value: string): boolean {
  const sepIdx = value.indexOf(SEPARATOR);
  if (sepIdx === -1) return false;

  const token = value.slice(0, sepIdx);
  const receivedSig = value.slice(sepIdx + 1);
  if (!token || !receivedSig) return false;

  const expectedSig = sign(token);

  // timingSafeEqual requires equal-length buffers — hash both to SHA-256 first
  const hashA = Buffer.from(
    createHmac("sha256", getSecret()).update(expectedSig).digest("hex")
  );
  const hashB = Buffer.from(
    createHmac("sha256", getSecret()).update(receivedSig).digest("hex")
  );

  try {
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

/**
 * Middleware: generate and set the CSRF cookie on any response where it is
 * not already present (or has expired). Call this on admin GET routes.
 */
export function setCsrfCookie(req: Request, res: Response, next: NextFunction): void {
  // If a valid cookie is already present, leave it alone to avoid churn
  const existing = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (existing && verify(existing)) {
    next();
    return;
  }

  const token = randomBytes(32).toString("hex");
  const cookieValue = encode(token);

  res.cookie(COOKIE_NAME, cookieValue, {
    httpOnly: false,          // Must be readable by JS for the double-submit pattern
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: CSRF_MAX_AGE_SEC * 1000,
    path: "/",
  });

  next();
}

/**
 * Middleware: validate the CSRF token on state-changing admin routes.
 * Reads `X-CSRF-Token` header and the `_csrf` cookie, checks they are identical
 * and that the signature is valid.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const headerValue = req.headers[HEADER_NAME];
  const cookieValue = req.cookies?.[COOKIE_NAME] as string | undefined;

  if (!headerValue || !cookieValue) {
    res.status(403).json({ error: "CSRF token missing" });
    return;
  }

  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  // The header value must match the cookie value exactly (double-submit check)
  if (header !== cookieValue) {
    res.status(403).json({ error: "CSRF token mismatch" });
    return;
  }

  // Signature verification ensures the token was issued by this server
  if (!verify(header)) {
    res.status(403).json({ error: "CSRF token invalid" });
    return;
  }

  next();
}
