import { Logger } from "../Logger";
import { machineIdSync } from "node-machine-id";
import { JwtPayload, verify } from "jsonwebtoken";
import fetch from "node-fetch";
import { extensionContext } from "./extensionContext";

const LAST_SERVER_CALL_KEY = "last_server_call_key";
const TOKEN_KEY = "token_key";
const PUBLIC_JWT_KEY =
  "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVjcsQYj7HLMEVtVWwLV4IdNF6TR9\nfVFkmgV6TfgKwpkPbh6fa1NR7aZGj9mlUVzjjDd8atVUnxTXlUIHn6u81g==\n-----END PUBLIC KEY-----";

export async function activateDevice(licenseKey: string, username: string) {
  const url = "https://customer-portal.swmtest.xyz/api/create-token";
  const cookies =
    "_vcn=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..UmY3QUDPj5Cx_Byg.f_-o-_WEHPsmqfcT-4UxRbHF8ze-a4GXymgS2gyCjcdE5Cxp9sHGE8qnYSYkVn8jFoeAADG4PJTNYWrMvOmSwT5nY-b3xVqcAGxra7L5ksnWRC7PDNmo4JmB13jCOECuDkrerbn1JoYJ71IgjeLXQpoadvgAY43qEQ_7XdBaD6FeVjDrBa12fTMY_AhDY7EPTWtoNTDO2FSngH-cSiGIcMXTNAzIxOVJL5-VTi6nuet4eM4_gBn-LXQtlwQ9Xz4Il7EJzsPd0qASghOhazEMD0Comcw2qjFaIVBxF1cu_UE3jrqtdndoPszmXIjI0KfhLJ0Wn9pwwoSwFygYsw-zQP2OTskpBnFfu-YnWmgT3bkRxpNZfZhTIM9p9IrfqftXLw.3FSQXRXC1J56ztM_if24UA;_vcnn=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..VscKeIpViSzeBv1i.YvpAM7V2SlWw7jQzNBwOZd7xeoEsw3Ta1LYDmxTkLK9m6vvJFtwC866Zj1bUjRUCaGg6KG3L0pMHtjNscfjye_9mVbn89Y_wndUDkWFXTxYjcQqMnkUuDufuLNrSMdd68wgGL9MuLwWJYNPcX3PQxB7Zr7is-hO6s3jRyA1m0RT6akpkXmWSUZMI77h4w3V12dh3JGpY2A6VgHPVvgP-_5QXMkV7i5RwCdtyyfipN3Qq8e3x0KkS47mx7Ivekhu5tL_nr_OQlCKxvZnoFfb7fDsjaM_zYdQXUA1vuINJpABFzuO9dC_dHuwFN_ywBfHOS-Cn3lqKrwNriz46X6lUFI9j7IApRQ3f-XTZBBjnX3glqQTOUyeHnYTTb2UoMnXZzw.HTIyb_7gLP-H0cMJEl5Tdw;_vercel_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJOT3JqRkoxS3cxUHZsQXRqQXdMTTFYU04iLCJpYXQiOjE3MjY4MzkyOTAsImF1ZCI6ImN1c3RvbWVyLXBvcnRhbC5zd210ZXN0Lnh5eiIsInVzZXJuYW1lIjoiZmlsaXAxMzEzMTEiLCJzdWIiOiJzc28tcHJvdGVjdGlvbiJ9.eb87jj3-gHLSNduCyRA-hcTHcl2J_CXFS9ke8_-rBgk";

  const body = {
    fingerprint: generateDeviceFingerprint(),
    username,
    licenseKey,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Cookie": cookies,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let newToken;

  if (response.ok) {
    const body = JSON.parse(response.body.read().toString());
    newToken = body.token as string;
    extensionContext.secrets.store(TOKEN_KEY, newToken ?? "");
    extensionContext.globalState.update(LAST_SERVER_CALL_KEY, new Date());
    return true;
  }

  return false;
}

export async function checkToken() {
  const token = await extensionContext.secrets.get(TOKEN_KEY);
  if (!token) {
    return false;
  }

  Logger.debug("Frytki", token);

  const lastServerCall = extensionContext.globalState.get(LAST_SERVER_CALL_KEY);
  if (!lastServerCall) {
    const verificationResult = await verifyToken(token);
    if (verificationResult) {
      return doesTokenMatchFingerprint(verificationResult);
    }
    return false;
  }

  Logger.debug("Frytki", lastServerCall);

  return doesTokenMatchFingerprint(token);
}

function generateDeviceFingerprint() {
  const fingerprint = machineIdSync(false);
  return fingerprint;
}

async function verifyToken(token: string) {
  const url = "https://customer-portal.swmtest.xyz/api/refresh-token";
  const cookies =
    "_vcn=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..UmY3QUDPj5Cx_Byg.f_-o-_WEHPsmqfcT-4UxRbHF8ze-a4GXymgS2gyCjcdE5Cxp9sHGE8qnYSYkVn8jFoeAADG4PJTNYWrMvOmSwT5nY-b3xVqcAGxra7L5ksnWRC7PDNmo4JmB13jCOECuDkrerbn1JoYJ71IgjeLXQpoadvgAY43qEQ_7XdBaD6FeVjDrBa12fTMY_AhDY7EPTWtoNTDO2FSngH-cSiGIcMXTNAzIxOVJL5-VTi6nuet4eM4_gBn-LXQtlwQ9Xz4Il7EJzsPd0qASghOhazEMD0Comcw2qjFaIVBxF1cu_UE3jrqtdndoPszmXIjI0KfhLJ0Wn9pwwoSwFygYsw-zQP2OTskpBnFfu-YnWmgT3bkRxpNZfZhTIM9p9IrfqftXLw.3FSQXRXC1J56ztM_if24UA;_vcnn=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..VscKeIpViSzeBv1i.YvpAM7V2SlWw7jQzNBwOZd7xeoEsw3Ta1LYDmxTkLK9m6vvJFtwC866Zj1bUjRUCaGg6KG3L0pMHtjNscfjye_9mVbn89Y_wndUDkWFXTxYjcQqMnkUuDufuLNrSMdd68wgGL9MuLwWJYNPcX3PQxB7Zr7is-hO6s3jRyA1m0RT6akpkXmWSUZMI77h4w3V12dh3JGpY2A6VgHPVvgP-_5QXMkV7i5RwCdtyyfipN3Qq8e3x0KkS47mx7Ivekhu5tL_nr_OQlCKxvZnoFfb7fDsjaM_zYdQXUA1vuINJpABFzuO9dC_dHuwFN_ywBfHOS-Cn3lqKrwNriz46X6lUFI9j7IApRQ3f-XTZBBjnX3glqQTOUyeHnYTTb2UoMnXZzw.HTIyb_7gLP-H0cMJEl5Tdw;_vercel_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJOT3JqRkoxS3cxUHZsQXRqQXdMTTFYU04iLCJpYXQiOjE3MjY4MzkyOTAsImF1ZCI6ImN1c3RvbWVyLXBvcnRhbC5zd210ZXN0Lnh5eiIsInVzZXJuYW1lIjoiZmlsaXAxMzEzMTEiLCJzdWIiOiJzc28tcHJvdGVjdGlvbiJ9.eb87jj3-gHLSNduCyRA-hcTHcl2J_CXFS9ke8_-rBgk";

  const body = {
    token,
  };
  const response = await fetch(url, {
    headers: {
      Cookie: cookies,
    },
    body: JSON.stringify(body),
  });

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
  const env = process.env.PUBLIC_JWT_KEY;
  Logger.debug("Frytki", env);
  let payload;
  try {
    payload = verify(token, PUBLIC_JWT_KEY, {
      algorithms: ["ES256"],
    });
  } catch (e: any) {
    return false;
  }

  if (payload) {
    const { fin } = payload as JwtPayload;

    return fin === generateDeviceFingerprint();
  }

  return false;
}
