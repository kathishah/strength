// Deployment values. Filled in after the first deploy (BUILD.md step 6). None of these are secrets:
// a Cognito app client without a secret and an API URL only work together with a valid login.
export const config = {
  region: 'us-west-2',
  userPoolClientId: '2m5s02gvb1c0lckaaig9h0rdno', // stack output UserPoolClientId
  apiUrl: 'https://133kwfn42a.execute-api.us-west-2.amazonaws.com', // stack output ApiUrl, https://<id>.execute-api.us-west-2.amazonaws.com
};

export const isConfigured = () =>
  !Object.values(config).some((v) => typeof v !== 'string' || v === '' || v.startsWith('REPLACE_'));
