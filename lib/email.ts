import "server-only";

import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.PEPA_SMTP_HOST;
  const user = process.env.PEPA_SMTP_USER;
  const pass = process.env.PEPA_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP não configurado. Defina PEPA_SMTP_HOST, PEPA_SMTP_USER e PEPA_SMTP_PASS.");
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.PEPA_SMTP_PORT ?? "587"),
    secure: process.env.PEPA_SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

function getFromAddress() {
  return process.env.PEPA_SMTP_FROM ?? process.env.PEPA_SMTP_USER ?? "noreply@pepa.local";
}

function getBaseUrl() {
  const domain = process.env.PEPA_PUBLIC_DOMAIN?.replace(/^https?:\/\//, "") ?? "pepa.tavarestech.cloud";
  return `https://${domain}`;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  userName: string;
  token: string;
}) {
  const transporter = getTransporter();
  const resetUrl = `${getBaseUrl()}/redefinir-senha?token=${params.token}`;

  await transporter.sendMail({
    from: `"PEPA" <${getFromAddress()}>`,
    to: params.to,
    subject: "Redefinição de senha — PEPA",
    text: `Olá ${params.userName},\n\nVocê solicitou a redefinição da sua senha no PEPA.\n\nClique no link abaixo para criar uma nova senha (válido por 1 hora):\n\n${resetUrl}\n\nSe não foi você, ignore este e-mail.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#172033">Redefinição de senha</h2>
        <p>Olá <strong>${params.userName}</strong>,</p>
        <p>Você solicitou a redefinição da sua senha no <strong>PEPA</strong>.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#0B62A4;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:14px">
            Redefinir senha
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">Link válido por 1 hora. Se não foi você, ignore este e-mail.</p>
      </div>
    `,
  });
}
