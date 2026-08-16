import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const ENC_FILE = path.resolve(process.cwd(), "config/tokens.enc");
const RAW_FILE = path.resolve(process.cwd(), "config/tokens.json");

/**
 * Returns a 32-byte key buffer from environment variable or local file.
 */
function getKey() {
  const hex = process.env.CREDENTIALS_KEY || (process.env.ENCRYPTION_KEY || "");
  if (!hex || hex.length !== 64) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a JSON object and saves it to config/tokens.enc
 */
export function saveEncryptedTokens(tokensObject) {
  const key = getKey();
  // Always update raw local file
  fs.mkdirSync(path.dirname(RAW_FILE), { recursive: true });
  fs.writeFileSync(RAW_FILE, JSON.stringify(tokensObject, null, 2) + "\n", "utf8");

  if (!key) {
    return false;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(tokensObject);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  const payload = JSON.stringify({
    iv: iv.toString("hex"),
    tag,
    data: encrypted,
  }, null, 2);

  fs.writeFileSync(ENC_FILE, payload + "\n", "utf8");
  return true;
}

/**
 * Reads and decrypts tokens from config/tokens.enc or config/tokens.json
 */
export function loadTokens() {
  const key = getKey();

  // Try encrypted file first if key is present
  if (key && fs.existsSync(ENC_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ENC_FILE, "utf8"));
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, "hex"));
      decipher.setAuthTag(Buffer.from(parsed.tag, "hex"));
      let decrypted = decipher.update(parsed.data, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return JSON.parse(decrypted);
    } catch (err) {
      console.warn("[vault] Failed to decrypt config/tokens.enc:", err.message);
    }
  }

  // Fallback to local raw file
  if (fs.existsSync(RAW_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));
    } catch (err) {
      console.warn("[vault] Failed to parse config/tokens.json:", err.message);
    }
  }

  return {};
}
