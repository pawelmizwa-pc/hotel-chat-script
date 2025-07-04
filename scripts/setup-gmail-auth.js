const { google } = require("googleapis");
const readline = require("readline");

// Your OAuth2 credentials from Google Cloud Console
const CLIENT_ID = "your-client-id-here";
const CLIENT_SECRET = "your-client-secret-here";
const REDIRECT_URI = "https://developers.google.com/oauthplayground";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Gmail scope for sending emails
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

async function getTokens() {
  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // Important: gets refresh token
    scope: SCOPES,
  });

  console.log("📧 Gmail OAuth Setup");
  console.log("==================");
  console.log("\n1. Open this URL in your browser:");
  console.log(authUrl);
  console.log("\n2. Complete the authorization");
  console.log("3. Copy the authorization code from the URL");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("\n4. Paste the authorization code here: ", async (code) => {
    try {
      const { tokens } = await oauth2Client.getAccessToken(code);

      console.log("\n✅ Success! Add these to your environment variables:");
      console.log("================================================");
      console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GMAIL_ACCESS_TOKEN=${tokens.access_token}`);
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log(
        "\n💡 The refresh token is permanent, access token expires in 1 hour"
      );
    } catch (error) {
      console.error("❌ Error getting tokens:", error);
    }
    rl.close();
  });
}

getTokens();
