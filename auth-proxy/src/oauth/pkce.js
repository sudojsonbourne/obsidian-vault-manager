import { createHash } from "node:crypto";

/**
 * Verify a PKCE S256 code_verifier against the stored code_challenge.
 */
export function verifyPKCE(codeVerifier, codeChallenge) {
  const computed = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return computed === codeChallenge;
}
