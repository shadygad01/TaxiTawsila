import { Client } from 'pg';

/**
 * Connects integration tests to a real Postgres+PostGIS instance (Testing
 * Strategy §2: "no mocked DB for repository tests").
 *
 * Testing Strategy's documented default is Testcontainers, spinning up an
 * ephemeral container per test run. Some environments (this one included, at
 * time of writing — see docs/21-phase2-foundation-audit.md) don't have a Docker
 * daemon available, so this helper instead connects to a Postgres instance
 * described by environment variables. CI (`.github/workflows/ci.yml`) provides
 * this via a `services:` Postgres+PostGIS container; local development can use
 * either `infra/docker/docker-compose.yml` or a natively-installed instance —
 * either way, the connection contract below is identical, so switching back to
 * Testcontainers later (once Docker-in-Docker is available) is an adapter
 * change here, not a change to any test that uses it.
 */
export interface TestDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function testDatabaseConfigFromEnv(): TestDatabaseConfig {
  return {
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    database: process.env.TEST_DB_NAME ?? 'taxitawsila_test',
    user: process.env.TEST_DB_USER ?? 'postgres',
    password: process.env.TEST_DB_PASSWORD ?? 'postgres',
  };
}

export async function connectTestDatabase(config: TestDatabaseConfig = testDatabaseConfigFromEnv()): Promise<Client> {
  const client = new Client(config);
  await client.connect();
  return client;
}
