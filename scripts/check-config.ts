import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfiguration } from '../src/server/bootstrap';

try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--config-dir' || !args[1])) {
    throw new Error('usage: config:check [--config-dir directory]');
  }
  const directory = args[1] ? resolve(args[1]) : fileURLToPath(new URL('../config/', import.meta.url));
  const config = loadConfiguration(directory);
  console.info(`Configuration valid: ${config.activeVersion}; ${config.registry.size} immutable rarity version(s); ${config.events.length} event definitions.`);
} catch (error) {
  console.error(`Configuration invalid: ${error instanceof Error ? error.message : 'validation failed'}`);
  process.exitCode = 1;
}
