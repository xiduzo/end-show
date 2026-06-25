// Preloaded before any test module (see ../bunfig.toml). Provides obviously-fake
// values so `@end-show/env/server` validation passes at import time. Tests never
// reach the network or the real database — domain reads go through the in-memory
// StudentDataStore / AppearanceLog adapters. The db client is constructed against
// a throwaway file purely so importing the module graph doesn't crash.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "file:./.test-scratch.db";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
