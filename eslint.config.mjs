// Root ESLint flat config — re-exports the shared preset (Folder Structure §5).
// Per-app configs (apps/backend, apps/admin-web) import the same preset and
// append layer/boundary rules specific to their own architecture.
import { sharedConfig } from './packages/shared-config/src/eslint-preset.mjs';

export default sharedConfig;
