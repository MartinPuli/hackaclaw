/**
 * Twitter/X integration — post automated tweets for hackathon events.
 *
 * Uses Twitter API v2 with OAuth 1.0a (app-level keys).
 * Set these env vars:
 *   TWITTER_API_KEY
 *   TWITTER_API_SECRET
 *   TWITTER_ACCESS_TOKEN
 *   TWITTER_ACCESS_SECRET
 *
 * If any key is missing, tweets are silently skipped (no errors).
 */

import crypto from "crypto";

const SITE_URL = "https://buildersclaw.vercel.app";
const TWITTER_API = "https://api.twitter.com/2/tweets";

function getKeys() {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

/**
 * Build OAuth 1.0a Authorization header for Twitter API v2.
 */
function buildOAuthHeader(
  method: string,
  url: string,
  keys: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string },
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  const params: Record<string, string> = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: keys.accessToken,
    oauth_version: "1.0",
  };

  // Build signature base string
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join("&");

  const signingKey = `${encodeURIComponent(keys.apiSecret)}&${encodeURIComponent(keys.accessSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  params.oauth_signature = signature;

  const header = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

/**
 * Post a tweet. Returns true if successful, false if skipped/failed.
 */
async function postTweet(text: string): Promise<boolean> {
  const keys = getKeys();
  if (!keys) {
    console.log("[TWITTER] Keys not configured — skipping tweet");
    return false;
  }

  try {
    const auth = buildOAuthHeader("POST", TWITTER_API, keys);

    const res = await fetch(TWITTER_API, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[TWITTER] Tweet failed (${res.status}):`, body);
      return false;
    }

    console.log("[TWITTER] Tweet posted successfully");
    return true;
  } catch (err) {
    console.error("[TWITTER] Tweet error:", err);
    return false;
  }
}

// ─── Public API ───

/**
 * Tweet when a new hackathon is created / goes live.
 */
export async function tweetHackathonCreated(hackathon: {
  id: string;
  title: string;
  prize_pool?: number;
  challenge_type?: string;
}) {
  const url = `${SITE_URL}/hackathons/${hackathon.id}`;
  const prize = hackathon.prize_pool && hackathon.prize_pool > 0
    ? ` — $${hackathon.prize_pool} prize`
    : "";

  const text = `🦞 New hackathon live on BuildersClaw!\n\n"${hackathon.title}"${prize}\n\nAI agents can register and compete now.\n\n${url}`;

  return postTweet(text);
}

/**
 * Tweet when a hackathon is finalized with results.
 */
export async function tweetHackathonFinalized(hackathon: {
  id: string;
  title: string;
  winner_name?: string | null;
}) {
  const url = `${SITE_URL}/hackathons/${hackathon.id}`;
  const winner = hackathon.winner_name
    ? `\n\n🏆 Winner: ${hackathon.winner_name}`
    : "";

  const text = `🏁 Hackathon finished on BuildersClaw!\n\n"${hackathon.title}"${winner}\n\nResults and scores are live.\n\n${url}`;

  return postTweet(text);
}
