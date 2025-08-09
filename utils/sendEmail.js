const mailgun = require("mailgun-js");
const DOMAIN = "mg.naffles.com";
const mg = mailgun({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: DOMAIN,
});

// General email sending function
function sendEmail({ from, to, subject, template, variables }) {
  return new Promise((resolve, reject) => {
    const data = {
      from: from || "Naffles <no-reply@mail.naffles.com>",
      to,
      subject,
      template,
      "h:X-Mailgun-Variables": JSON.stringify(variables),
    };

    mg.messages().send(data, (error, body) => {
      if (error) {
        console.error("Error: ", error);
        reject(error);
      } else {
        console.log("Email Sent: ", body);
        resolve(body);
      }
    });
  });
}

// Specific email functions using the generalized function
function sendClientExpirationNotificationEmail(name, days, email) {
  return sendEmail({
    to: email,
    subject: "[Naffles] Client Expiration Reminder",
    template: "client-subscription-email-reminder-expiration",
    variables: { name, days },
  });
}

function sendWithdrawNotification(username, tokenName, tokenTicker, tokenNetwork, tokenAddress, tokenAmount) {
  const to = process.env.NODE_ENV == "production" ? "transaction@naffles.com" : "devnaffles@gmail.com";
  const url = process.env.NODE_ENV == "production" ? "https://admin.naffles.com" : "https://dev.admin.naffles.com";

  return sendEmail({
    to,
    subject: "[Naffles Admin] Withdraw Notification",
    template: "withdraw-request-notification",
    variables: {
      username,
      tokenName,
      tokenTicker,
      tokenNetwork,
      tokenAddress,
      tokenAmount,
      url,
    },
  });
}

function sendEmailVerificationCode(verificationCode, email) {
  return sendEmail({
    to: email,
    subject: "[Naffles] Your Naffles Access Code Awaits",
    template: "user-creation-verification-code",
    variables: { verificationCode },
  });
}

function sendUserTemporaryPassword(temporaryPassword, email) {
  return sendEmail({
    to: email,
    subject: "[Naffles] Temporary Password",
    template: "user-request-new-password",
    variables: { temporaryPassword },
  });
}

function sendEmailForEmailChangeRequest(link, minutes, email) {
  return sendEmail({
    to: email,
    subject: "[Naffles] Confirm Email Change",
    template: "email-change-request-v2",
    variables: { link, minutes },
  });
}

module.exports = {
  sendClientExpirationNotificationEmail,
  sendWithdrawNotification,
  sendEmailVerificationCode,
  sendUserTemporaryPassword,
  sendEmailForEmailChangeRequest,
};
