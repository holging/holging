#!/usr/bin/env node
/**
 * Regenerates the mock Pyth PriceUpdateV2 fixture with fresh timestamps.
 * Run before `anchor test` to prevent StaleOracle errors.
 * 
 * Usage: node tests/helpers/refresh-pyth-fixture.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'mock-pyth-price-update.json');

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const data = Buffer.from(fixture.account.data[0], 'base64');

// publish_time is at offset 93 (i64, LE)
// prev_publish_time is at offset 101 (i64, LE)
const now = Math.floor(Date.now() / 1000);
const publishTime = now + 86400 * 365; // 1 year in the future — never stale

data.writeBigInt64LE(BigInt(publishTime), 93);
data.writeBigInt64LE(BigInt(publishTime - 1), 101);

fixture.account.data[0] = data.toString('base64');
writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n');

console.log(`✅ Pyth fixture refreshed: publish_time=${publishTime} (${new Date(publishTime * 1000).toISOString()})`);
