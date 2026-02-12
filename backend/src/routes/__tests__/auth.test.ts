import { describe, expect, test, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../db/schema";
import { Router } from "../../utils/router";

// Mock auth functions BEFORE importing routes
// Include all exports from auth.ts to avoid module conflict issues when tests run together
mock.module("../../middleware/auth", () => ({
  hashPassword: async (password: string): Promise<string> => `hashed_${password}`,
  verifyPassword: async (password: string, hash: string): Promise<boolean> =>
    hash === `hashed_${password}`,
  generateToken: async (payload: { sub: string; email: string; name: string }): Promise<string> =>
    `token_${payload.sub}_${payload.email}`,
  verifyToken: async (token: string): Promise<{ sub: string; email: string; name: string } | null> => {
    const match = token.match(/^token_(\d+)_(.+)$/);
    if (!match) return null;
    return { sub: match[1], email: match[2], name: "Test User" };
  },
  verifyRequestAuth: async (req: Request): Promise<{ sub: string; email: string; name: string } | null> => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const match = token.match(/^token_(\d+)_(.+)$/);
    if (!match) return null;
    return { sub: match[1], email: match[2], name: "Test User" };
  },
  getUser: (req: Request) => {
    const user = (req as Request & { user?: { id: number; email: string; name: string } }).user;
    if (!user) throw new Error("User not authenticated");
    return user;
  },
  extractBearerToken: (req: Request): string | null => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7);
  },
  authMiddleware: async (req: Request, next: () => Promise<Response>) => next(),
}));

// Set up in-memory test database
let sqlite: Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      user_location TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  testDb = drizzle(sqlite, { schema });

  // Inject test database BEFORE importing routes
  const { __setTestDb } = await import("../../db/connection");
  __setTestDb(testDb as any);
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clear users table before each test
  await testDb.delete(schema.users);
});

// Import the actual route registration function AFTER db is set up
let registerAuthRoutes: (router: Router) => void;
beforeAll(async () => {
  const authModule = await import("../auth");
  registerAuthRoutes = authModule.registerAuthRoutes;
});

function createRouter() {
  const router = new Router();
  registerAuthRoutes(router);
  return router;
}

async function makeRequest(
  router: Router,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; data: unknown }> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await router.handle(req);
  if (!response) {
    return { status: 404, data: { error: "Not found" } };
  }
  const data = await response.json();
  return { status: response.status, data };
}

describe("POST /api/v1/auth/register", () => {
  test("successfully registers a new user", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "newuser@test.com",
      password: "password123",
      name: "New User",
    });

    expect(res.status).toBe(200);
    const data = res.data as { user: { id: number; email: string; name: string }; token: string };
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("newuser@test.com");
    expect(data.user.name).toBe("New User");
    expect(data.token).toBeDefined();
  });

  test("registers user with optional fields", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "withfields@test.com",
      password: "password123",
      name: "With Fields",
      userLocation: "Singapore",
      avatarUrl: "https://example.com/avatar.jpg",
    });

    expect(res.status).toBe(200);
    const data = res.data as { user: { userLocation: string; avatarUrl: string } };
    expect(data.user.userLocation).toBe("Singapore");
    expect(data.user.avatarUrl).toBe("https://example.com/avatar.jpg");
  });

  test("returns 400 for invalid email format", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "invalid-email",
      password: "password123",
      name: "Test User",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBeDefined();
  });

  test("returns 400 for password too short", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "test@test.com",
      password: "123",
      name: "Test User",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBeDefined();
  });

  test("returns 400 for empty name", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "test@test.com",
      password: "password123",
      name: "",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBeDefined();
  });

  test("returns 400 for duplicate email", async () => {
    const router = createRouter();

    // Register first user
    await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "duplicate@test.com",
      password: "password123",
      name: "First User",
    });

    // Try to register with same email
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "duplicate@test.com",
      password: "password456",
      name: "Second User",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Email already registered");
  });

  test("returns 400 for missing required fields", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/register", {});

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/login", () => {
  test("successfully logs in with valid credentials", async () => {
    const router = createRouter();

    // First register a user
    await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "login@test.com",
      password: "password123",
      name: "Login User",
    });

    // Then try to login
    const res = await makeRequest(router, "POST", "/api/v1/auth/login", {
      email: "login@test.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    const data = res.data as { user: { email: string }; token: string };
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("login@test.com");
    expect(data.token).toBeDefined();
  });

  test("returns 401 for non-existent email", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/login", {
      email: "nonexistent@test.com",
      password: "password123",
    });

    expect(res.status).toBe(401);
    const data = res.data as { error: string };
    expect(data.error).toBe("Invalid email or password");
  });

  test("returns 401 for wrong password", async () => {
    const router = createRouter();

    // First register a user
    await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "wrongpass@test.com",
      password: "password123",
      name: "Wrong Pass User",
    });

    // Try to login with wrong password
    const res = await makeRequest(router, "POST", "/api/v1/auth/login", {
      email: "wrongpass@test.com",
      password: "wrongpassword",
    });

    expect(res.status).toBe(401);
    const data = res.data as { error: string };
    expect(data.error).toBe("Invalid email or password");
  });

  test("returns 400 for invalid email format", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/login", {
      email: "invalid-email",
      password: "password123",
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 for missing password", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/auth/login", {
      email: "test@test.com",
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/auth/me", () => {
  test("returns current user with valid token", async () => {
    const router = createRouter();

    // First register a user
    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "me@test.com",
      password: "password123",
      name: "Me User",
    });
    const registerData = registerRes.data as { token: string };

    // Get current user
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/auth/me",
      undefined,
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(200);
    const data = res.data as { email: string; name: string };
    expect(data.email).toBe("me@test.com");
    expect(data.name).toBe("Me User");
  });

  test("returns 401 without token", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/auth/me");

    expect(res.status).toBe(401);
    const data = res.data as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 401 with invalid token", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/auth/me",
      undefined,
      { Authorization: "Bearer invalid_token" }
    );

    expect(res.status).toBe(401);
    const data = res.data as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 401 with malformed Authorization header", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/auth/me",
      undefined,
      { Authorization: "Basic dXNlcjpwYXNz" }
    );

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/auth/profile", () => {
  test("updates user name successfully", async () => {
    const router = createRouter();

    // First register a user
    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "update@test.com",
      password: "password123",
      name: "Original Name",
    });
    const registerData = registerRes.data as { token: string };

    // Update profile
    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { name: "Updated Name" },
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(200);
    const data = res.data as { name: string };
    expect(data.name).toBe("Updated Name");
  });

  test("updates user location successfully", async () => {
    const router = createRouter();

    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "location@test.com",
      password: "password123",
      name: "Location User",
    });
    const registerData = registerRes.data as { token: string };

    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { userLocation: "Singapore" },
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(200);
    const data = res.data as { userLocation: string };
    expect(data.userLocation).toBe("Singapore");
  });

  test("updates avatar URL successfully", async () => {
    const router = createRouter();

    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "avatar@test.com",
      password: "password123",
      name: "Avatar User",
    });
    const registerData = registerRes.data as { token: string };

    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { avatarUrl: "https://example.com/new-avatar.jpg" },
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(200);
    const data = res.data as { avatarUrl: string };
    expect(data.avatarUrl).toBe("https://example.com/new-avatar.jpg");
  });

  test("can set userLocation to null", async () => {
    const router = createRouter();

    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "nullloc@test.com",
      password: "password123",
      name: "Null Location",
      userLocation: "Singapore",
    });
    const registerData = registerRes.data as { token: string };

    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { userLocation: null },
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(200);
    const data = res.data as { userLocation: string | null };
    expect(data.userLocation).toBeNull();
  });

  test("returns 401 without token", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { name: "New Name" }
    );

    expect(res.status).toBe(401);
  });

  test("returns 400 for empty name", async () => {
    const router = createRouter();

    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "emptyname@test.com",
      password: "password123",
      name: "Original",
    });
    const registerData = registerRes.data as { token: string };

    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { name: "" },
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(400);
  });

  test("returns 400 for name exceeding max length", async () => {
    const router = createRouter();

    const registerRes = await makeRequest(router, "POST", "/api/v1/auth/register", {
      email: "longname@test.com",
      password: "password123",
      name: "Original",
    });
    const registerData = registerRes.data as { token: string };

    const res = await makeRequest(
      router,
      "PATCH",
      "/api/v1/auth/profile",
      { name: "a".repeat(101) },
      { Authorization: `Bearer ${registerData.token}` }
    );

    expect(res.status).toBe(400);
  });
});
