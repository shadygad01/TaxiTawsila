# @taxitawsila/testing-utils

Shared test fixtures/builders (Folder Structure §5). Currently provides `connectTestDatabase()`, a thin wrapper standardizing how integration tests connect to a real Postgres+PostGIS instance (Testing Strategy §2 — no mocked DB for repository tests), configured entirely from environment variables so the same test code runs unchanged against Testcontainers, `infra/docker/docker-compose.yml`, or a natively-installed instance.
