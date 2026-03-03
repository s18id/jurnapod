// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

type TemplateParams = {
  userName: string;
  companyName: string;
  actionUrl: string;
  expiryHours: number;
};

function getBaseTemplate(content: string, lang: "id" | "en"): string {
  const langLabels = {
    id: {
      footer: "Jika Anda tidak meminta email ini, abaikan saja.",
      rights: "Semua hak dilindungi."
    },
    en: {
      footer: "If you did not request this email, please ignore it.",
      rights: "All rights reserved."
    }
  };

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jurnapod</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #f9f9f9;
      border-radius: 8px;
      padding: 30px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #2c3e50;
    }
    .content {
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      background-color: #3498db;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #2980b9;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Jurnapod</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>${langLabels[lang].footer}</p>
      <p>&copy; 2026 Jurnapod. ${langLabels[lang].rights}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function buildPasswordResetEmail(params: TemplateParams): { subject: string; html: string; text: string } {
  const { userName, companyName, actionUrl, expiryHours } = params;

  const subject = "Reset Password / Reset Kata Sandi";
  
  const htmlContent = `
    <p>Hello / Halo <strong>${userName}</strong>,</p>
    <p>We received a request to reset your password for <strong>${companyName}</strong> account.</p>
    <p>Kami menerima permintaan untuk mereset kata sandi akun <strong>${companyName}</strong> Anda.</p>
    <p style="text-align: center;">
      <a href="${actionUrl}" class="button">Reset Password</a>
    </p>
    <p>This link will expire in ${expiryHours} hours.</p>
    <p>Tautan ini akan kedaluwarsa dalam ${expiryHours} jam.</p>
    <p>If you didn't request this, please ignore this email.</p>
    <p>Jika Anda tidak meminta ini, abaikan email ini.</p>
  `;

  const textContent = `
Hello ${userName},

We received a request to reset your password for ${companyName} account.

Reset your password by clicking the link below:
${actionUrl}

This link will expire in ${expiryHours} hours.

If you didn't request this, please ignore this email.

---

Halo ${userName},

Kami menerima permintaan untuk mereset kata sandi akun ${companyName} Anda.

Reset kata sandi Anda dengan mengeklik tautan di bawah ini:
${actionUrl}

Tautan ini akan kedaluwarsa dalam ${expiryHours} jam.

Jika Anda tidak meminta ini, abaikan email ini.
  `.trim();

  return {
    subject,
    html: getBaseTemplate(htmlContent, "en"),
    text: textContent
  };
}

export function buildUserInviteEmail(params: TemplateParams): { subject: string; html: string; text: string } {
  const { userName, companyName, actionUrl, expiryHours } = params;

  const subject = "You're invited to Jurnapod / Anda Diundang ke Jurnapod";
  
  const htmlContent = `
    <p>Hello / Halo <strong>${userName}</strong>,</p>
    <p>You have been invited to join <strong>${companyName}</strong> on Jurnapod.</p>
    <p>Anda telah diundang untuk bergabung dengan <strong>${companyName}</strong> di Jurnapod.</p>
    <p style="text-align: center;">
      <a href="${actionUrl}" class="button">Accept Invitation</a>
    </p>
    <p>This invitation will expire in ${Math.floor(expiryHours / 24)} days.</p>
    <p>Undangan ini akan kedaluwarsa dalam ${Math.floor(expiryHours / 24)} hari.</p>
  `;

  const textContent = `
Hello ${userName},

You have been invited to join ${companyName} on Jurnapod.

Accept your invitation by clicking the link below:
${actionUrl}

This invitation will expire in ${Math.floor(expiryHours / 24)} days.

---

Halo ${userName},

Anda telah diundang untuk bergabung dengan ${companyName} di Jurnapod.

Terima undangan Anda dengan mengeklik tautan di bawah ini:
${actionUrl}

Undangan ini akan kedaluwarsa dalam ${Math.floor(expiryHours / 24)} hari.
  `.trim();

  return {
    subject,
    html: getBaseTemplate(htmlContent, "en"),
    text: textContent
  };
}

export function buildVerifyEmail(params: TemplateParams): { subject: string; html: string; text: string } {
  const { userName, companyName, actionUrl, expiryHours } = params;

  const subject = "Verify your email / Verifikasi email Anda";
  
  const htmlContent = `
    <p>Hello / Halo <strong>${userName}</strong>,</p>
    <p>Please verify your email address for <strong>${companyName}</strong>.</p>
    <p>Silakan verifikasi alamat email Anda untuk <strong>${companyName}</strong>.</p>
    <p style="text-align: center;">
      <a href="${actionUrl}" class="button">Verify Email</a>
    </p>
    <p>This link will expire in ${expiryHours} hours.</p>
    <p>Tautan ini akan kedaluwarsa dalam ${expiryHours} jam.</p>
  `;

  const textContent = `
Hello ${userName},

Please verify your email address for ${companyName}.

Verify your email by clicking the link below:
${actionUrl}

This link will expire in ${expiryHours} hours.

---

Halo ${userName},

Silakan verifikasi alamat email Anda untuk ${companyName}.

Verifikasi email Anda dengan mengeklik tautan di bawah ini:
${actionUrl}

Tautan ini akan kedaluwarsa dalam ${expiryHours} jam.
  `.trim();

  return {
    subject,
    html: getBaseTemplate(htmlContent, "en"),
    text: textContent
  };
}
