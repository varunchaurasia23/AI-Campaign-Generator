import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const app: Express = express();

// Logging middleware (before routes)
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

// Trust reverse proxy (for accurate IP in rate limiter and secure cookies)
app.set("trust proxy", 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow only the actual deployed origin(s).  REPLIT_DOMAINS is a comma-separated
// list of the proxy domains assigned to this repl.  An explicit ALLOWED_ORIGIN
// env var can override (useful for custom domains on deployment).
//
// Requests from the same origin (e.g. frontend → /api via the Replit proxy) are
// same-origin and never subject to CORS, so restricting here only affects actual
// cross-origin callers.
const allowedOrigins = new Set<string>();

const replitDomains = process.env.REPLIT_DOMAINS ?? "";
for (const domain of replitDomains.split(",").map((d) => d.trim()).filter(Boolean)) {
  allowedOrigins.add(`https://${domain}`);
}

const explicitOrigin = process.env.ALLOWED_ORIGIN;
if (explicitOrigin) {
  allowedOrigins.add(explicitOrigin);
}

if (allowedOrigins.size === 0) {
  logger.warn(
    "No CORS origins configured (REPLIT_DOMAINS and ALLOWED_ORIGIN are both unset). " +
    "All cross-origin requests will be rejected."
  );
}

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests have no Origin header — always allow them
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      logger.warn({ origin }, "CORS: rejected request from disallowed origin");
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// cookie-parser is required so CSRF middleware can read req.cookies
app.use(cookieParser());

// ─── Session (persistent — Postgres-backed) ───────────────────────────────────
// Sessions are stored in a `session` table created automatically by
// connect-pg-simple on startup (createTableIfMissing: true).
// This means sessions survive server restarts and redeployments.
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  logger.error("SESSION_SECRET is not set — admin authentication will not work");
}

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      // Table is created once via DB migration (psql scripts/create-session-table.sql)
      // rather than at runtime to avoid path-resolution issues in bundled builds.
      createTableIfMissing: false,
      // Prune expired sessions every hour
      pruneSessionInterval: 60 * 60,
    }),
    secret: sessionSecret ?? "dev-fallback-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

app.use("/api", router);

// ─── CORS error handler ────────────────────────────────────────────────────────
// When the CORS callback calls next(new Error(...)), Express's default handler
// renders an HTML page.  This middleware catches CORS errors specifically and
// returns a JSON 403 so clients get a consistent response shape.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    err instanceof Error &&
    err.message.startsWith("CORS:")
  ) {
    res.status(403).json({ error: "Forbidden: cross-origin request not allowed" });
    return;
  }
  next(err);
});

export default app;
