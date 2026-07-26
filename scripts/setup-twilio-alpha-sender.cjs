/**
 * One-time Twilio setup: create a Messaging Service and add an Alphanumeric Sender ID.
 *
 * Expects TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.
 * Prints the Messaging Service SID and Alpha Sender SID on success.
 */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const senderId = process.env.TWILIO_ALPHA_SENDER || "MELANGE";

if (!accountSid || !authToken) {
  console.error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  process.exit(1);
}

const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

async function createMessagingService() {
  const res = await fetch("https://messaging.twilio.com/v1/Services", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      FriendlyName: "Mélange OTP",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Twilio create service failed: ${data.message || res.statusText}`);
  }
  return data.sid;
}

async function addAlphaSender(messagingServiceSid) {
  const res = await fetch(
    `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/AlphaSenders`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        AlphaSender: senderId,
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Twilio add Alpha Sender failed: ${data.message || res.statusText}`);
  }
  return data.sid;
}

(async () => {
  try {
    const messagingServiceSid = await createMessagingService();
    console.log("Messaging Service SID:", messagingServiceSid);
    const alphaSenderSid = await addAlphaSender(messagingServiceSid);
    console.log("Alpha Sender SID:", alphaSenderSid);
    console.log("You can now configure Supabase with:");
    console.log("  SMS provider: twilio");
    console.log("  Account SID:", accountSid);
    console.log("  Messaging Service SID:", messagingServiceSid);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
