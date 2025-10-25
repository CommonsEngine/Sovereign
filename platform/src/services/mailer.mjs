import env from "$/config/env.mjs";
import logger from "$/services/logger.mjs";

const CONFIG_FIELDS = [
  "EMAIL_SMTP_URL",
  "EMAIL_SMTP_HOST",
  "EMAIL_SMTP_PORT",
  "EMAIL_SMTP_SECURE",
  "EMAIL_SMTP_IGNORE_TLS",
  "EMAIL_SMTP_USER",
  "EMAIL_SMTP_PASSWORD",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_FROM_NAME",
  "EMAIL_REPLY_TO",
  "EMAIL_DELIVERY_BYPASS",
];

let transporterCache = null;
let transporterSignature = "";
let nodemailerModulePromise = null;

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => item.replace(/\s+/g, " "));
  }
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, " "));
};

const buildFromHeader = (config, override) => {
  if (override) return override;
  const { EMAIL_FROM_ADDRESS: address, EMAIL_FROM_NAME: name } = config;
  if (name && address) return `"${name}" <${address}>`;
  return address || "no-reply@localhost";
};

const computeSignature = (config) =>
  CONFIG_FIELDS.map((key) => String(config[key] ?? "")).join("|");

const loadNodemailer = async () => {
  if (!nodemailerModulePromise) {
    try {
      nodemailerModulePromise = import("nodemailer");
    } catch (err) {
      nodemailerModulePromise = Promise.resolve({ default: null, err });
    }
  }
  return nodemailerModulePromise
    .then((mod) => (mod.default ? mod.default : mod))
    .catch((err) => {
      logger.warn("Email delivery disabled: failed to load nodemailer", err);
      return null;
    });
};

const createTransporter = async (config) => {
  const signature = computeSignature(config);
  if (transporterCache && transporterSignature === signature) {
    return transporterCache;
  }

  const nodemailer = await loadNodemailer();
  if (!nodemailer || typeof nodemailer.createTransport !== "function") {
    logger.warn("Email delivery disabled: nodemailer not available");
    transporterCache = null;
    transporterSignature = signature;
    return transporterCache;
  }

  let transporter = null;

  try {
    if (config.EMAIL_SMTP_URL) {
      transporter = nodemailer.createTransport(config.EMAIL_SMTP_URL);
    } else if (config.EMAIL_SMTP_HOST) {
      const {
        EMAIL_SMTP_HOST,
        EMAIL_SMTP_PORT,
        EMAIL_SMTP_SECURE,
        EMAIL_SMTP_IGNORE_TLS,
      } = config;
      const transportConfig = {
        host: EMAIL_SMTP_HOST,
        port: Number.isFinite(EMAIL_SMTP_PORT) ? Number(EMAIL_SMTP_PORT) : 587,
        secure: !!EMAIL_SMTP_SECURE,
        ignoreTLS: !!EMAIL_SMTP_IGNORE_TLS,
      };
      if (config.EMAIL_SMTP_USER && config.EMAIL_SMTP_PASSWORD) {
        transportConfig.auth = {
          user: config.EMAIL_SMTP_USER,
          pass: config.EMAIL_SMTP_PASSWORD,
        };
      }
      transporter = nodemailer.createTransport(transportConfig);
    } else {
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      logger.warn(
        "Email transport fallback: using jsonTransport (emails will not be delivered)",
      );
    }
  } catch (err) {
    logger.error("✗ Failed to configure email transporter", err);
    transporter = null;
  }

  transporterCache = transporter;
  transporterSignature = signature;
  return transporterCache;
};

export const shouldBypassEmailDelivery = () => {
  const config = env();
  return !!config.EMAIL_DELIVERY_BYPASS;
};

export async function sendMail({
  to,
  cc,
  bcc,
  from,
  replyTo,
  subject,
  text,
  html,
  headers = {},
} = {}) {
  const config = env();
  const payload = {
    to: normalizeList(to),
    cc: normalizeList(cc),
    bcc: normalizeList(bcc),
    subject: subject || "",
    text: text || "",
    html: html || "",
    headers,
  };

  if (!payload.to.length) {
    return {
      status: "skipped",
      reason: "missing-recipients",
      payload,
    };
  }

  const fromHeader = buildFromHeader(config, from);
  const replyToHeader = replyTo || config.EMAIL_REPLY_TO || undefined;

  if (config.EMAIL_DELIVERY_BYPASS) {
    logger.info("[mail:bypass]", {
      to: payload.to,
      subject: payload.subject,
    });
    return {
      status: "skipped",
      reason: "bypass",
      payload,
      from: fromHeader,
      replyTo: replyToHeader,
    };
  }

  if (!payload.text && payload.html) {
    payload.text = payload.html
      .replace(/<\/?(?:p|div|br)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  try {
    const transporter = await createTransporter(config);
    if (!transporter) {
      logger.warn("Email delivery skipped: transporter unavailable");
      return {
        status: "skipped",
        reason: "transport-unavailable",
        payload,
        from: fromHeader,
        replyTo: replyToHeader,
      };
    }

    const info = await transporter.sendMail({
      from: fromHeader,
      replyTo: replyToHeader,
      to: payload.to,
      cc: payload.cc.length ? payload.cc : undefined,
      bcc: payload.bcc.length ? payload.bcc : undefined,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      headers: payload.headers,
    });

    logger.info("[mail:sent]", {
      to: payload.to,
      subject: payload.subject,
      messageId: info?.messageId ?? null,
    });

    return {
      status: "sent",
      info,
      payload,
      from: fromHeader,
      replyTo: replyToHeader,
    };
  } catch (err) {
    logger.error("✗ Email delivery failed", err);
    return {
      status: "failed",
      error: err,
      payload,
      from: fromHeader,
      replyTo: replyToHeader,
    };
  }
}
