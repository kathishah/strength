// Deployment values. Filled in after the first deploy (BUILD.md step 6). None of these are secrets:
// a Cognito app client without a secret and an API URL only work together with a valid login.
export const config = {
  region: 'us-west-2',
  userPoolClientId: 'REPLACE_WITH_APP_CLIENT_ID', // stack output UserPoolClientId
  apiUrl: 'REPLACE_WITH_API_URL', // stack output ApiUrl, https://<id>.execute-api.us-west-2.amazonaws.com
};

export const isConfigured = () =>
  !Object.values(config).some((v) => typeof v !== 'string' || v === '' || v.startsWith('REPLACE_'));
