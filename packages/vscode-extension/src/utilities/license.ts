import { Logger } from "../Logger";
import { machineIdSync } from "node-machine-id";
import { JwtPayload, verify } from "jsonwebtoken";
import fetch from "node-fetch";
import { extensionContext } from "./extensionContext";

const LAST_SERVER_CALL_KEY = "last_server_call_key";
const TOKEN_KEY = "token_key";

export async function checkToken() {
  const token = await extensionContext.secrets.get(TOKEN_KEY);
  if (!token) {
    return false;
  }

  const lastServerCall = extensionContext.globalState.get(LAST_SERVER_CALL_KEY);
  if (!lastServerCall) {
    const verificationResult = await verifyToken(token);
    if (verificationResult) {
      return doesTokenMatchFingerprint(verificationResult);
    }
    return false;
  }

  return doesTokenMatchFingerprint(token);
}

function generateDeviceFingerprint() {
  const fingerprint = machineIdSync(false);
  return fingerprint;
}

async function verifyToken(token: string) {
  const url = "";
  const params = new URLSearchParams({
    token,
  });
  const response = await fetch(`${url}?${params}`);

  let newToken;

  if (response.ok) {
    const body = JSON.parse(response.body.read().toString());
    newToken = body.token as string;
  }

  extensionContext.secrets.store(TOKEN_KEY, newToken ?? "");
  extensionContext.globalState.update(LAST_SERVER_CALL_KEY, new Date());

  return newToken;
}

function doesTokenMatchFingerprint(token: string) {
  let payload;
  try {
    payload = verify(token, process.env.PUBLIC_JWT_KEY!.replace(/\\n/g, "\n"));
  } catch (e: any) {
    return false;
  }

  if (payload) {
    const { fin } = payload as JwtPayload;

    return fin === generateDeviceFingerprint();
  }

  return false;
}
