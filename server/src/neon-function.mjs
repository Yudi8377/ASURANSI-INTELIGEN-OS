import { app } from './index.mjs';
import { createNeonFetchHandler } from './neon-fetch-adapter.mjs';

export default {
  fetch: createNeonFetchHandler(app)
};
