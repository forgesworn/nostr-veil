/**
 * True when a deployment bundle is authentic: its signature is sound and a
 * publisher the verifier trusts made it. Only then is the policy inside it the
 * operator's. A policy from any other bundle was written by nobody the
 * verifier knows, so nothing in it is applied or checked.
 *
 * Internal: not exported from the package.
 */
export function isAuthenticBundle(verification: { publisherTrusted: boolean; signatureValid: boolean }): boolean {
  return verification.signatureValid === true && verification.publisherTrusted === true
}
