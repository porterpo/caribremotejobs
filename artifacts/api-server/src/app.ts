import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { env, isAllowedOrigin } from "./lib/env";
import { apiLimiter } from "./lib/rate-limit";

const app: Express = express();

app.set("trust proxy", 1);

const corsOptions: CorsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
};

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
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors(corsOptions));

if (env.allowedOrigins.length === 0) {
  logger.warn(
    "ALLOWED_ORIGINS is empty; CORS will reject every cross-origin request",
  );
}

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      logger.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware());

app.use("/api", apiLimiter, router);

export default app;
