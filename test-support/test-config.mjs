// The checked-in app/js/config.js is empty (the app then runs local-only), so tests of synced mode, Cognito and the API fill in example
// values on the shared config object before they sign in or call the API.
import { config } from '../app/js/config.js';

export const TEST_CONFIG = Object.freeze({
  region: 'us-west-2',
  userPoolClientId: 'test-client-id',
  apiUrl: 'https://api.example.test',
});

export function useTestConfig() {
  Object.assign(config, TEST_CONFIG);
  return config;
}
