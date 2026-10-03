#!/usr/bin/env node
// CI check for WP-C2: validates the entity table in src/entities.js.
// No dependencies; run with `node tools/validate_entities.mjs`.
import { ENTITIES, validateEntities } from '../src/entities.js';

try {
  validateEntities(ENTITIES);
  console.log(`entities OK (${Object.keys(ENTITIES).length} rows)`);
} catch (err) {
  console.error(`entities INVALID: ${err.message}`);
  process.exit(1);
}
