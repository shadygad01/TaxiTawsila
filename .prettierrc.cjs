// Root Prettier config — single source of truth lives in packages/shared-config
// (Folder Structure §5); this is a thin re-export so `prettier` CLI/editor
// integrations find it at the repo root without a workspace-resolution step.
module.exports = require('./packages/shared-config/prettier-preset.json');
