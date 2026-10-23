// Cognito sign-in for the command-line scripts (export-data.mjs, post-events.mjs).

// Resolves with the ID token. Throws an Error whose message says why sign-in failed. `config` is { region, userPoolClientId }.
export async function signIn(config, email, pin, fetchImpl = fetch) {
  const auth = await fetchImpl(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.userPoolClientId,
      AuthParameters: { USERNAME: email, PASSWORD: pin },
    }),
  }).then((r) => r.json());
  const token = auth.AuthenticationResult?.IdToken;
  if (!token) throw new Error(`Sign-in failed: ${auth.__type ?? auth.ChallengeName ?? 'unknown'}`);
  return token;
}
