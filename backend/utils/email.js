/* =======================================================================
   Email sending — welcome mail and password-changed confirmation. Three
   modes, checked in this order:

   1. RESEND_API_KEY set  → send via Resend's HTTP API (fetch, no SMTP
      involved). This is the recommended option — it works reliably on
      hosts like Render's free tier, which often block the outbound SMTP
      ports Nodemailer needs.
   2. EMAIL_USER + EMAIL_PASS set → send via Nodemailer/SMTP (e.g. Gmail).
   3. Neither set → DEMO MODE: every "send" just logs to the console and
      the caller gets demoMode=true back, so routes/auth.js can hand the
      verification code directly to the frontend instead. This means the
      whole app, including forgot-password, works out of the box with
      zero email setup.
   ======================================================================= */
const nodemailer = require('nodemailer');

const useResend = !!process.env.RESEND_API_KEY;
const useSmtp = !useResend && !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS;
const demoMode = !useResend && !useSmtp;

const transporter = useSmtp ? nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
}) : null;

async function sendViaResend({ to, subject, html }){
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'FlipStudy <onboarding@resend.dev>',
      to: [to],
      subject,
      html
    })
  });
  if(!res.ok){
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

async function sendMail({ to, subject, html }){
  if(demoMode){
    console.log(`\n[email:DEMO MODE] Would send to ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, ' ')}\n`);
    return { demoMode: true };
  }
  try{
    if(useResend) await sendViaResend({ to, subject, html });
    else await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USER, to, subject, html });
    return { demoMode: false };
  }catch(err){
    // Don't let a broken email provider break registration/login — log it
    // loudly on the server and fall back to handing the code back directly
    // so the person isn't locked out while you sort out the email config.
    console.error('[email] Send failed, falling back to demo mode for this request:', err.message);
    console.log(`\n[email:FALLBACK] Would have sent to ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, ' ')}\n`);
    return { demoMode: true, sendFailed: true };
  }
}

function welcomeEmail(user){
  return sendMail({
    to: user.email,
    subject: 'Welcome to FlipStudy!',
    html: `<p>Hi ${user.username},</p><p>Your FlipStudy account is ready. Happy studying!</p>`
  });
}
function passwordChangedEmail(toEmail){
  return sendMail({
    to: toEmail,
    subject: 'Your FlipStudy password was changed',
    html: `<p>This is a confirmation that your FlipStudy account password was just changed. If this wasn't you, please reset your password immediately.</p>`
  });
}

module.exports = { sendMail, welcomeEmail, passwordChangedEmail, demoMode, useResend, useSmtp };
