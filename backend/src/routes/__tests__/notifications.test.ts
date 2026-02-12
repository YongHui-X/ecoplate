import { describe, expect, test, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Router } from "../../utils/router";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";

// Types
type NotificationType = "expiring_soon" | "badge_unlocked" | "streak_milestone" | "product_stale";

// Mock auth middleware
// Include all exports from auth.ts to avoid module conflict issues when tests run together
let testUserId = 1;
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
  getUser: () => ({
    id: testUserId,
    email: "test@example.com",
    name: "Test User",
  }),
  extractBearerToken: (req: Request): string | null => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7);
  },
  authMiddleware: async (_req: Request, next: () => Promise<Response>) => next(),
  verifyRequestAuth: async (req: Request) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const match = token.match(/^token_(\d+)_(.+)$/);
    if (!match) return null;
    return { sub: match[1], email: match[2], name: "Test User" };
  },
}));

// Set up in-memory test database
let sqlite: Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let secondUserId: number;

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

    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      read_at INTEGER
    );

    CREATE TABLE notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      expiring_products INTEGER NOT NULL DEFAULT 1,
      badge_unlocked INTEGER NOT NULL DEFAULT 1,
      streak_milestone INTEGER NOT NULL DEFAULT 1,
      product_stale INTEGER NOT NULL DEFAULT 1,
      stale_days_threshold INTEGER NOT NULL DEFAULT 7,
      expiry_days_threshold INTEGER NOT NULL DEFAULT 3
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      category TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_price REAL,
      purchase_date INTEGER,
      description TEXT,
      co2_emission REAL
    );

    CREATE TABLE marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      image_url TEXT,
      expiry_date INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  testDb = drizzle(sqlite, { schema });

  // Inject test database BEFORE importing routes
  const { __setTestDb } = await import("../../db/connection");
  __setTestDb(testDb as any);

  // Seed test users
  const [user1] = await testDb
    .insert(schema.users)
    .values({
      email: "test@example.com",
      passwordHash: "hashed",
      name: "Test User",
    })
    .returning();
  testUserId = user1.id;

  const [user2] = await testDb
    .insert(schema.users)
    .values({
      email: "test2@example.com",
      passwordHash: "hashed",
      name: "Second User",
    })
    .returning();
  secondUserId = user2.id;
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  await testDb.delete(schema.notifications);
  await testDb.delete(schema.notificationPreferences);
});

// Import actual route registration function AFTER db is set up
let registerNotificationRoutes: (router: Router) => void;
beforeAll(async () => {
  const notificationsModule = await import("../notifications");
  registerNotificationRoutes = notificationsModule.registerNotificationRoutes;
});

function createRouter(userId: number = testUserId) {
  // Update the mock user id before creating router
  testUserId = userId;
  const router = new Router();
  registerNotificationRoutes(router);
  return router;
}

async function makeRequest(
  router: Router,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await router.handle(req);
  if (!response) {
    return { status: 404, data: { error: "Not found" } };
  }
  const data = await response.json();
  return { status: response.status, data };
}

async function createTestNotification(
  userId: number,
  type: NotificationType = "badge_unlocked",
  title: string = "Test",
  message: string = "Test message"
) {
  const [notification] = await testDb
    .insert(schema.notifications)
    .values({ userId, type, title, message })
    .returning();
  return notification;
}

describe("GET /api/v1/notifications", () => {
  test("returns empty array for user with no notifications", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications");

    expect(res.status).toBe(200);
    const data = res.data as { notifications: unknown[] };
    expect(data.notifications).toEqual([]);
  });

  test("returns notifications for authenticated user", async () => {
    await createTestNotification(testUserId, "badge_unlocked", "Badge 1", "Msg 1");
    await createTestNotification(testUserId, "streak_milestone", "Streak 1", "Msg 2");

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications");

    expect(res.status).toBe(200);
    const data = res.data as { notifications: Array<{ title: string }> };
    expect(data.notifications.length).toBe(2);
  });

  test("respects limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      await createTestNotification(testUserId, "badge_unlocked", `Title ${i}`, `Msg ${i}`);
    }

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications?limit=3");

    const data = res.data as { notifications: unknown[] };
    expect(data.notifications.length).toBe(3);
  });

  test("filters unread only when specified", async () => {
    const notif1 = await createTestNotification(testUserId, "badge_unlocked", "Read", "Msg");
    await createTestNotification(testUserId, "badge_unlocked", "Unread", "Msg");

    await testDb
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, notif1.id));

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications?unreadOnly=true");

    const data = res.data as { notifications: Array<{ title: string }> };
    expect(data.notifications.length).toBe(1);
    expect(data.notifications[0].title).toBe("Unread");
  });

  test("only returns notifications for authenticated user", async () => {
    await createTestNotification(testUserId, "badge_unlocked", "User 1", "Msg");
    await createTestNotification(secondUserId, "badge_unlocked", "User 2", "Msg");

    const router = createRouter(testUserId);
    const res = await makeRequest(router, "GET", "/api/v1/notifications");

    const data = res.data as { notifications: Array<{ title: string }> };
    expect(data.notifications.length).toBe(1);
    expect(data.notifications[0].title).toBe("User 1");
  });
});

describe("GET /api/v1/notifications/unread-count", () => {
  test("returns 0 for user with no notifications", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications/unread-count");

    expect(res.status).toBe(200);
    const data = res.data as { count: number };
    expect(data.count).toBe(0);
  });

  test("returns correct unread count", async () => {
    await createTestNotification(testUserId);
    await createTestNotification(testUserId);
    await createTestNotification(testUserId);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications/unread-count");

    const data = res.data as { count: number };
    expect(data.count).toBe(3);
  });

  test("excludes read notifications", async () => {
    const notif1 = await createTestNotification(testUserId);
    await createTestNotification(testUserId);

    await testDb
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, notif1.id));

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications/unread-count");

    const data = res.data as { count: number };
    expect(data.count).toBe(1);
  });
});

describe("POST /api/v1/notifications/:id/read", () => {
  test("marks notification as read", async () => {
    const notif = await createTestNotification(testUserId);

    const router = createRouter();
    const res = await makeRequest(router, "POST", `/api/v1/notifications/${notif.id}/read`);

    expect(res.status).toBe(200);
    const data = res.data as { success: boolean };
    expect(data.success).toBe(true);

    const updated = await testDb.query.notifications.findFirst({
      where: eq(schema.notifications.id, notif.id),
    });
    expect(updated?.isRead).toBe(true);
  });

  test("does not mark other user's notification", async () => {
    const notif = await createTestNotification(secondUserId);

    const router = createRouter(testUserId);
    await makeRequest(router, "POST", `/api/v1/notifications/${notif.id}/read`);

    const unchanged = await testDb.query.notifications.findFirst({
      where: eq(schema.notifications.id, notif.id),
    });
    expect(unchanged?.isRead).toBe(false);
  });
});

describe("POST /api/v1/notifications/read-all", () => {
  test("marks all notifications as read", async () => {
    await createTestNotification(testUserId);
    await createTestNotification(testUserId);
    await createTestNotification(testUserId);

    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/notifications/read-all");

    expect(res.status).toBe(200);

    const unread = await testDb.query.notifications.findMany({
      where: and(
        eq(schema.notifications.userId, testUserId),
        eq(schema.notifications.isRead, false)
      ),
    });
    expect(unread.length).toBe(0);
  });

  test("only marks authenticated user's notifications", async () => {
    await createTestNotification(testUserId);
    await createTestNotification(secondUserId);

    const router = createRouter(testUserId);
    await makeRequest(router, "POST", "/api/v1/notifications/read-all");

    const user2Unread = await testDb.query.notifications.findMany({
      where: and(
        eq(schema.notifications.userId, secondUserId),
        eq(schema.notifications.isRead, false)
      ),
    });
    expect(user2Unread.length).toBe(1);
  });
});

describe("DELETE /api/v1/notifications/:id", () => {
  test("deletes notification", async () => {
    const notif = await createTestNotification(testUserId);

    const router = createRouter();
    const res = await makeRequest(router, "DELETE", `/api/v1/notifications/${notif.id}`);

    expect(res.status).toBe(200);

    const deleted = await testDb.query.notifications.findFirst({
      where: eq(schema.notifications.id, notif.id),
    });
    expect(deleted).toBeUndefined();
  });

  test("does not delete other user's notification", async () => {
    const notif = await createTestNotification(secondUserId);

    const router = createRouter(testUserId);
    await makeRequest(router, "DELETE", `/api/v1/notifications/${notif.id}`);

    const stillExists = await testDb.query.notifications.findFirst({
      where: eq(schema.notifications.id, notif.id),
    });
    expect(stillExists).toBeDefined();
  });
});

describe("GET /api/v1/notifications/preferences", () => {
  test("returns default preferences for new user", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications/preferences");

    expect(res.status).toBe(200);
    const data = res.data as {
      preferences: {
        expiringProducts: boolean;
        badgeUnlocked: boolean;
        streakMilestone: boolean;
        productStale: boolean;
        staleDaysThreshold: number;
        expiryDaysThreshold: number;
      };
    };

    expect(data.preferences.expiringProducts).toBe(true);
    expect(data.preferences.badgeUnlocked).toBe(true);
    expect(data.preferences.streakMilestone).toBe(true);
    expect(data.preferences.productStale).toBe(true);
    expect(data.preferences.staleDaysThreshold).toBe(7);
    expect(data.preferences.expiryDaysThreshold).toBe(3);
  });

  test("returns existing preferences", async () => {
    await testDb.insert(schema.notificationPreferences).values({
      userId: testUserId,
      expiringProducts: false,
      staleDaysThreshold: 14,
    });

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/notifications/preferences");

    const data = res.data as {
      preferences: { expiringProducts: boolean; staleDaysThreshold: number };
    };

    expect(data.preferences.expiringProducts).toBe(false);
    expect(data.preferences.staleDaysThreshold).toBe(14);
  });
});

describe("PUT /api/v1/notifications/preferences", () => {
  test("updates preferences", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "PUT", "/api/v1/notifications/preferences", {
      expiringProducts: false,
      staleDaysThreshold: 21,
    });

    expect(res.status).toBe(200);
    const data = res.data as {
      preferences: { expiringProducts: boolean; staleDaysThreshold: number };
    };

    expect(data.preferences.expiringProducts).toBe(false);
    expect(data.preferences.staleDaysThreshold).toBe(21);
  });

  test("only updates allowed fields", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "PUT", "/api/v1/notifications/preferences", {
      expiringProducts: false,
      hackedField: true, // Should be ignored
    });

    expect(res.status).toBe(200);
    const data = res.data as { preferences: Record<string, unknown> };

    expect(data.preferences.expiringProducts).toBe(false);
    expect("hackedField" in data.preferences).toBe(false);
  });
});

describe("POST /api/v1/notifications/check", () => {
  test("returns success response", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "POST", "/api/v1/notifications/check");

    expect(res.status).toBe(200);
    const data = res.data as { message: string; created: { expiringProducts: number; staleProducts: number } };

    expect(data.message).toBe("Notification check complete");
    expect(data.created).toBeDefined();
  });
});
