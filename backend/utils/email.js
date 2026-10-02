/* =======================================================================
   Email sending — welcome mail, password-reset codes, password-changed
   confirmation. If EMAIL_USER/EMAIL_PASS aren't set in .env, every
   "send" just logs to the console and the caller is told demoMode=true,
   so routes/auth.js can hand the code back in the API response instead.
   This means the whole app, including forgot-password, works out of
   the box with zero email setup.
   ======================================================================= */
const nodemailer = require('nodemailer');

const demoMode = !process.env.EMAIL_USER || !process.env.EMAIL_PASS;

const transporter = demoMode ? null : nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendMail({ to, subject, html }){
  if(demoMode){
    console.log(`\n[email:DEMO MODE] Would send to ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, ' ')}\n`);
    return { demoMode: true };
  }
  await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USER, to, subject, html });
  return { demoMode: false };
}

function welcomeEmail(user){
  return sendMail({
    to: user.email,
    subject: 'Welcome to FlipStudy!',
    html: `<p>Hi ${user.username},</p><p>Your FlipStudy account is ready. Happy studying!</p>`
  });
}
function verificationCodeEmail(toEmail, code){
  return sendMail({
    to: toEmail,
    subject: 'Your FlipStudy verification code',
    html: `<p>Your password reset code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`
  });
}
function passwordChangedEmail(toEmail){
  return sendMail({
    to: toEmail,
    subject: 'Your FlipStudy password was changed',
    html: `<p>This is a confirmation that your FlipStudy account password was just changed. If this wasn't you, please reset your password immediately.</p>`
  });
}

module.exports = { sendMail, welcomeEmail, verificationCodeEmail, passwordChangedEmail, demoMode };
