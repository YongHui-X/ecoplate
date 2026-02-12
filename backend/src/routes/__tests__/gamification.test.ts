import { describe, expect, test, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Router } from "../../utils/router";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

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

// Mock image analysis service (for consumption routes)
mock.module("../../services/image-analysis-service", () => ({
  identifyIngredients: async () => ({ ingredients: [] }),
  analyzeWaste: async () => ({ wasteItems: [], overallObservation: "" }),
}));

// Mock notification service to avoid side effects
mock.module("../../services/notification-service", () => ({
  notifyBadgeUnlocked: async () => {},
  notifyStreakMilestone: async () => {},
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

    CREATE TABLE user_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      total_points INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      total_co2_saved REAL NOT NULL DEFAULT 0,
      last_active_date TEXT
    );

    CREATE TABLE badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      badge_image_url TEXT
    );

    CREATE TABLE user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      earned_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE product_sustainability_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      today_date TEXT NOT NULL,
      quantity REAL,
      unit TEXT,
      type TEXT
    );

    CREATE TABLE rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      points_cost INTEGER NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE user_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
      points_spent INTEGER NOT NULL,
      redemption_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      collected_at INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      buyer_id INTEGER REFERENCES users(id),
      product_id INTEGER REFERENCES products(id),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      quantity REAL NOT NULL,
      unit TEXT,
      price REAL,
      original_price REAL,
      expiry_date INTEGER,
      pickup_location TEXT,
      images TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER,
      co2_saved REAL
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

    CREATE TABLE pending_consumption_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      raw_photo TEXT NOT NULL,
      ingredients TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'PENDING_WASTE_PHOTO',
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

  // Seed test badges
  await testDb.insert(schema.badges).values([
    {
      code: "first_action",
      name: "First Steps",
      description: "Complete your first sustainability action",
      category: "milestones",
      pointsAwarded: 25,
      sortOrder: 1,
    },
    {
      code: "eco_starter",
      name: "Eco Starter",
      description: "Complete 10 sustainability actions",
      category: "milestones",
      pointsAwarded: 50,
      sortOrder: 2,
    },
  ]);
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clear data before each test
  await testDb.delete(schema.userRedemptions);
  await testDb.delete(schema.rewards);
  await testDb.delete(schema.productSustainabilityMetrics);
  await testDb.delete(schema.userBadges);
  await testDb.delete(schema.userPoints);
  await testDb.delete(schema.marketplaceListings);
  await testDb.delete(schema.products);
  await testDb.delete(schema.pendingConsumptionRecords);
});

// Import actual route registration functions AFTER db is set up
let registerGamificationRoutes: (router: Router) => void;
let registerConsumptionRoutes: (router: Router, db: any) => void;
beforeAll(async () => {
  const gamificationModule = await import("../gamification");
  registerGamificationRoutes = gamificationModule.registerGamificationRoutes;

  const consumptionModule = await import("../consumption");
  registerConsumptionRoutes = consumptionModule.registerConsumptionRoutes;
});

function createRouter(userId: number = testUserId) {
  testUserId = userId;
  const router = new Router();
  registerGamificationRoutes(router);
  registerConsumptionRoutes(router, testDb);
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

describe("GET /api/v1/gamification/points", () => {
  test("returns initial points for new user", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as {
      points: { total: number; currentStreak: number };
      stats: { pointsThisYear: number };
      transactions: unknown[];
    };
    expect(data.points).toBeDefined();
    expect(data.points.total).toBe(0);
    expect(data.points.currentStreak).toBe(0);
    expect(data.stats.pointsThisYear).toBe(0);
    expect(data.transactions).toEqual([]);
  });

  test("creates userPoints record if not exists", async () => {
    const router = createRouter();
    await makeRequest(router, "GET", "/api/v1/gamification/points");

    const points = await testDb.query.userPoints.findFirst({
      where: eq(schema.userPoints.userId, testUserId),
    });

    expect(points).toBeDefined();
    expect(points?.totalPoints).toBe(0);
  });

  test("returns user points with correct values", async () => {
    // Create user points with some values
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 100,
      currentStreak: 5,
    });

    // Add a sold interaction to have 100 points (need ~26.67 sold items at minimum 3-4 points each)
    // Or we can add badge points. For simplicity, let's add badge bonus
    // Award the first_action badge (25 points) - actual points = 25, but stored 100
    // The route uses computedTotalPoints which is from metrics + badges - redemptions
    // Since no metrics, just badges: need to match expected
    const badge = await testDb.query.badges.findFirst({
      where: eq(schema.badges.code, "first_action"),
    });
    if (badge) {
      await testDb.insert(schema.userBadges).values({
        userId: testUserId,
        badgeId: badge.id,
      });
    }
    // first_action badge = 25 points, need 75 more from sold items
    // With "other" category: 1 qty * 2.5 co2 * 1.5 = 3.75 -> 4 points per sold
    // Need 75/4 = ~19 sold items. Let's just test that it returns something
    // Actually the computed total overrides stored value. Let's simplify:
    // Just test that streak is returned correctly
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as { points: { total: number; currentStreak: number } };
    // Total will be 25 (from first_action badge)
    expect(data.points.total).toBe(25);
    expect(data.points.currentStreak).toBe(5);
  });

  test("longestStreak is always >= currentStreak", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 50,
      currentStreak: 7,
    });

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as { points: { total: number; currentStreak: number; longestStreak: number } };
    expect(data.points.currentStreak).toBe(7);
    expect(data.points.longestStreak).toBeGreaterThanOrEqual(data.points.currentStreak);
  });

  test("consumed and wasted are filtered from transactions", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 50,
    });

    // Create some interactions - consumed and wasted should be filtered out
    await testDb.insert(schema.productSustainabilityMetrics).values([
      {
        userId: testUserId,
        todayDate: "2025-01-15",
        type: "consumed",
        quantity: 1,
      },
      {
        userId: testUserId,
        todayDate: "2025-01-14",
        type: "wasted",
        quantity: 1,
      },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as { transactions: Array<{ action: string; amount: number; type: string }> };
    // consumed and wasted are now filtered out
    expect(data.transactions.length).toBe(0);
  });

  test("filters out Add and consumed transactions", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
    });

    await testDb.insert(schema.productSustainabilityMetrics).values([
      {
        userId: testUserId,
        todayDate: "2025-01-15",
        type: "Add",
        quantity: 1,
      },
      {
        userId: testUserId,
        todayDate: "2025-01-15",
        type: "consumed",
        quantity: 1,
      },
      {
        userId: testUserId,
        todayDate: "2025-01-15",
        type: "sold",
        quantity: 1,
      },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    const data = res.data as { transactions: Array<{ action: string }> };
    // Only sold remains (Add and consumed are filtered out)
    expect(data.transactions.length).toBe(1);
    expect(data.transactions[0].action).toBe("sold");
  });

  test("redemption appears in points history with correct action and amount", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 50,
    });

    // Create a reward and redeem it
    const [reward] = await testDb
      .insert(schema.rewards)
      .values({ name: "Free Coffee", pointsCost: 20, category: "food" })
      .returning();

    await testDb.insert(schema.userRedemptions).values({
      userId: testUserId,
      rewardId: reward.id,
      pointsSpent: 20,
      redemptionCode: "REDEEM-TEST-001",
    });

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as {
      transactions: Array<{
        action: string;
        amount: number;
        type: string;
        quantity: number;
      }>;
    };

    expect(data.transactions.length).toBe(1);

    const redemptionTx = data.transactions[0];
    expect(redemptionTx.action).toBe("redeemed");
    expect(redemptionTx.amount).toBe(-20);
    expect(redemptionTx.type).toBe("redeemed");
    expect(redemptionTx.quantity).toBe(1);
  });
});

describe("GET /api/v1/gamification/metrics", () => {
  test("returns zero metrics for new user", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/metrics");

    expect(res.status).toBe(200);
    const data = res.data as {
      totalItemsConsumed: number;
      totalItemsWasted: number;
      wasteReductionRate: number;
    };
    expect(data.totalItemsConsumed).toBe(0);
    expect(data.totalItemsWasted).toBe(0);
    expect(data.wasteReductionRate).toBe(100); // 100% when no items
  });

  test("calculates correct metrics from interactions", async () => {
    // Add various interactions
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId: testUserId, todayDate: "2025-01-15", type: "consumed", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-15", type: "consumed", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-15", type: "consumed", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-14", type: "wasted", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-14", type: "shared", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-14", type: "sold", quantity: 1 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/metrics");

    expect(res.status).toBe(200);
    const data = res.data as {
      totalItemsConsumed: number;
      totalItemsWasted: number;
      totalItemsShared: number;
      totalItemsSold: number;
      wasteReductionRate: number;
      estimatedCo2Saved: number;
      estimatedMoneySaved: number;
    };
    expect(data.totalItemsConsumed).toBe(3);
    expect(data.totalItemsWasted).toBe(1);
    expect(data.totalItemsShared).toBe(1);
    expect(data.totalItemsSold).toBe(1);

    // Waste reduction: (3+1+1) / (3+1+1+1) * 100 = 5/6 * 100 = 83.33%
    expect(data.wasteReductionRate).toBeCloseTo(83.33, 1);
  });

  test("handles 100% waste scenario", async () => {
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId: testUserId, todayDate: "2025-01-15", type: "wasted", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-15", type: "wasted", quantity: 1 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/metrics");

    const data = res.data as { wasteReductionRate: number };
    expect(data.wasteReductionRate).toBe(0);
  });
});

describe("GET /api/v1/gamification/leaderboard", () => {
  test("returns empty leaderboard when no user points", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/leaderboard");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect((res.data as unknown[]).length).toBe(0);
  });

  test("returns users sorted by points descending", async () => {
    // Add points for both users
    await testDb.insert(schema.userPoints).values([
      { userId: testUserId, totalPoints: 50, currentStreak: 2 },
      { userId: secondUserId, totalPoints: 100, currentStreak: 5 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/leaderboard");

    expect(res.status).toBe(200);
    const data = res.data as Array<{ rank: number; userId: number; points: number }>;
    expect(data.length).toBe(2);

    // Second user should be first (higher points)
    expect(data[0].rank).toBe(1);
    expect(data[0].userId).toBe(secondUserId);
    expect(data[0].points).toBe(100);

    expect(data[1].rank).toBe(2);
    expect(data[1].userId).toBe(testUserId);
    expect(data[1].points).toBe(50);
  });

  test("leaderboard uses lifetime points (unaffected by redemptions)", async () => {
    // User 1: 50 totalPoints but redeemed 30 → lifetime = 80
    // User 2: 100 totalPoints, no redemptions → lifetime = 100
    await testDb.insert(schema.userPoints).values([
      { userId: testUserId, totalPoints: 50, currentStreak: 2 },
      { userId: secondUserId, totalPoints: 100, currentStreak: 5 },
    ]);

    // Create a reward for the redemption
    const [reward] = await testDb
      .insert(schema.rewards)
      .values({ name: "Test Reward", pointsCost: 30, category: "test" })
      .returning();

    // User 1 redeemed 30 points
    await testDb.insert(schema.userRedemptions).values({
      userId: testUserId,
      rewardId: reward.id,
      pointsSpent: 30,
      redemptionCode: "TEST-001",
    });

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/leaderboard");

    const data = res.data as Array<{ rank: number; userId: number; points: number }>;
    expect(data.length).toBe(2);

    // Second user: lifetime = 100 (rank 1)
    expect(data[0].userId).toBe(secondUserId);
    expect(data[0].points).toBe(100);

    // First user: lifetime = 50 + 30 = 80 (rank 2)
    expect(data[1].userId).toBe(testUserId);
    expect(data[1].points).toBe(80);
  });

  test("limits to top 10 users", async () => {
    // Create 12 users with points
    for (let i = 0; i < 12; i++) {
      const [user] = await testDb
        .insert(schema.users)
        .values({
          email: `leaderboard${i}@test.com`,
          passwordHash: "hash",
          name: `User ${i}`,
        })
        .returning();

      await testDb.insert(schema.userPoints).values({
        userId: user.id,
        totalPoints: i * 10,
      });
    }

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/leaderboard");

    const data = res.data as unknown[];
    expect(data.length).toBe(10);
  });
});

describe("GET /api/v1/gamification/badges", () => {
  test("returns all badges with earned status", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/badges");

    expect(res.status).toBe(200);
    const data = res.data as {
      badges: Array<{ code: string; earned: boolean }>;
      totalEarned: number;
      totalAvailable: number;
    };

    expect(data.badges.length).toBe(2);
    expect(data.totalEarned).toBe(0);
    expect(data.totalAvailable).toBe(2);

    // All badges should be unearned
    expect(data.badges.every((b) => b.earned === false)).toBe(true);
  });

  test("shows earned badges correctly", async () => {
    // Award first badge to user
    const badge = await testDb.query.badges.findFirst({
      where: eq(schema.badges.code, "first_action"),
    });

    if (badge) {
      await testDb.insert(schema.userBadges).values({
        userId: testUserId,
        badgeId: badge.id,
      });
    }

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/badges");

    const data = res.data as {
      badges: Array<{ code: string; earned: boolean }>;
      totalEarned: number;
    };

    expect(data.totalEarned).toBe(1);

    const firstAction = data.badges.find((b) => b.code === "first_action");
    expect(firstAction?.earned).toBe(true);

    const ecoStarter = data.badges.find((b) => b.code === "eco_starter");
    expect(ecoStarter?.earned).toBe(false);
  });

  test("returns badges in sort order", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/badges");

    const data = res.data as { badges: Array<{ code: string }> };

    // first_action (sortOrder: 1) should come before eco_starter (sortOrder: 2)
    expect(data.badges[0].code).toBe("first_action");
    expect(data.badges[1].code).toBe("eco_starter");
  });
});

describe("GET /api/v1/gamification/dashboard", () => {
  test("returns dashboard data for user with no activity", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/dashboard");

    expect(res.status).toBe(200);
    const data = res.data as {
      products: { total: number };
      listings: { active: number; sold: number };
      gamification: { points: number; streak: number };
    };

    expect(data.products.total).toBe(0);
    expect(data.listings.active).toBe(0);
    expect(data.listings.sold).toBe(0);
    expect(data.gamification.points).toBe(0);
    expect(data.gamification.streak).toBe(0);
  });

  test("returns correct product count", async () => {
    // Add some products
    await testDb.insert(schema.products).values([
      { userId: testUserId, productName: "Apple", quantity: 5 },
      { userId: testUserId, productName: "Banana", quantity: 3 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/dashboard");

    const data = res.data as { products: { total: number } };
    expect(data.products.total).toBe(2);
  });

  test("returns correct listing counts", async () => {
    // Add some listings
    await testDb.insert(schema.marketplaceListings).values([
      {
        sellerId: testUserId,
        title: "Active Listing 1",
        quantity: 1,
        status: "active",
      },
      {
        sellerId: testUserId,
        title: "Active Listing 2",
        quantity: 1,
        status: "active",
      },
      {
        sellerId: testUserId,
        title: "Completed Listing",
        quantity: 1,
        status: "completed",
      },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/dashboard");

    const data = res.data as { listings: { active: number; sold: number } };
    expect(data.listings.active).toBe(2);
    expect(data.listings.sold).toBe(1);
  });

  test("returns gamification stats", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 150,
      currentStreak: 7,
    });

    // Award first_action badge (25 points) to have computed points
    const badge = await testDb.query.badges.findFirst({
      where: eq(schema.badges.code, "first_action"),
    });
    if (badge) {
      await testDb.insert(schema.userBadges).values({
        userId: testUserId,
        badgeId: badge.id,
      });
    }

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/dashboard");

    const data = res.data as { gamification: { points: number; streak: number } };
    // Points are computed from badges (25) + sold metrics (0) - redemptions (0) = 25
    expect(data.gamification.points).toBe(25);
    expect(data.gamification.streak).toBe(7);
  });
});

describe("Consumption → Points History integration", () => {
  test("confirm-ingredients records consumed interaction and awards first_action badge", async () => {
    const router = createRouter();

    // Add a product to the fridge
    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Chicken Breast", quantity: 5, unit: "kg", category: "meat" })
      .returning();

    // Confirm consumption of 2kg
    const confirmRes = await makeRequest(router, "POST", "/api/v1/consumption/confirm-ingredients", {
      ingredients: [
        {
          productId: product.id,
          productName: "Chicken Breast",
          quantityUsed: 2,
          unit: "kg",
          category: "meat",
          unitPrice: 10,
        },
      ],
    });

    expect(confirmRes.status).toBe(200);
    expect((confirmRes.data as { success: boolean }).success).toBe(true);

    // Check points history
    const pointsRes = await makeRequest(router, "GET", "/api/v1/gamification/points");
    expect(pointsRes.status).toBe(200);

    const pointsData = pointsRes.data as {
      points: { total: number };
      transactions: Array<{ action: string; amount: number; type: string; quantity: number }>;
    };

    // first_action badge (25 points) is awarded for first sustainability action
    expect(pointsData.points.total).toBe(25);

    // Badge transaction appears in history
    const badgeTx = pointsData.transactions.find((t) => t.action === "badge");
    expect(badgeTx).toBeDefined();
    expect(badgeTx?.amount).toBe(25);
  });

  test("confirm-waste records wasted interaction but does not award badge (wasted doesnt count as action)", async () => {
    const router = createRouter();

    // Seed initial points (but computed points will be from badges/metrics)
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 50,
      currentStreak: 3,
    });

    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Rice", quantity: 3, unit: "kg", category: "pantry" })
      .returning();

    // Confirm waste of 1kg
    const wasteRes = await makeRequest(router, "POST", "/api/v1/consumption/confirm-waste", {
      ingredients: [
        {
          productId: product.id,
          productName: "Rice",
          quantityUsed: 2,
          unit: "kg",
          category: "pantry",
          unitPrice: 5,
        },
      ],
      wasteItems: [
        { productId: product.id, productName: "Rice", quantityWasted: 1 },
      ],
    });

    expect(wasteRes.status).toBe(200);
    expect((wasteRes.data as { success: boolean }).success).toBe(true);

    // Check points history
    const pointsRes = await makeRequest(router, "GET", "/api/v1/gamification/points");
    const pointsData = pointsRes.data as {
      points: { total: number; currentStreak: number };
      transactions: Array<{ action: string; amount: number; type: string }>;
    };

    // wasted doesn't count toward totalActions, so no first_action badge
    // Points = 0 (no badges, no sold items, wasted gives 0 points)
    expect(pointsData.points.total).toBe(0);

    // Streak preserved (wasted no longer resets streak)
    expect(pointsData.points.currentStreak).toBe(3);

    // No transactions (wasted filtered out, no badges)
    expect(pointsData.transactions.length).toBe(0);
  });

  test("confirm-ingredients deducts from product inventory", async () => {
    const router = createRouter();

    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Eggs", quantity: 10, unit: "pcs" })
      .returning();

    await makeRequest(router, "POST", "/api/v1/consumption/confirm-ingredients", {
      ingredients: [
        { productId: product.id, productName: "Eggs", quantityUsed: 3, unit: "pcs", category: "dairy", unitPrice: 0.5 },
      ],
    });

    // Check inventory was deducted
    const updatedProduct = await testDb.query.products.findFirst({
      where: eq(schema.products.id, product.id),
    });
    expect(updatedProduct?.quantity).toBe(7); // 10 - 3
  });

  test("consumption and waste both show in metrics", async () => {
    const router = createRouter();

    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Bread", quantity: 5, unit: "pcs" })
      .returning();

    // Consume
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-ingredients", {
      ingredients: [
        { productId: product.id, productName: "Bread", quantityUsed: 3, unit: "pcs", category: "bakery", unitPrice: 2 },
      ],
    });

    // Waste
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-waste", {
      ingredients: [
        { productId: product.id, productName: "Bread", quantityUsed: 3, unit: "pcs", category: "bakery", unitPrice: 2 },
      ],
      wasteItems: [
        { productId: product.id, productName: "Bread", quantityWasted: 1 },
      ],
    });

    // Check metrics
    const metricsRes = await makeRequest(router, "GET", "/api/v1/gamification/metrics");
    const metricsData = metricsRes.data as {
      totalItemsConsumed: number;
      totalItemsWasted: number;
      wasteReductionRate: number;
    };

    expect(metricsData.totalItemsConsumed).toBe(1);
    expect(metricsData.totalItemsWasted).toBe(1);
    // Waste reduction: 1 / (1+1) * 100 = 50%
    expect(metricsData.wasteReductionRate).toBe(50);
  });

  test("zero waste quantity does not create waste transaction and no badge awarded", async () => {
    const router = createRouter();

    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 20,
      currentStreak: 5,
    });

    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Fish", quantity: 2, unit: "kg" })
      .returning();

    // Confirm waste with 0 quantity - no wasted metric created
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-waste", {
      ingredients: [
        { productId: product.id, productName: "Fish", quantityUsed: 1, unit: "kg", category: "seafood", unitPrice: 15 },
      ],
      wasteItems: [
        { productId: product.id, productName: "Fish", quantityWasted: 0 },
      ],
    });

    // Points are computed: no actions (wasted doesn't count, and 0 qty waste wasn't recorded)
    const pointsRes = await makeRequest(router, "GET", "/api/v1/gamification/points");
    const pointsData = pointsRes.data as {
      points: { total: number; currentStreak: number };
      transactions: Array<{ action: string }>;
    };

    // No badge (no totalActions), streak preserved
    expect(pointsData.points.total).toBe(0);
    expect(pointsData.points.currentStreak).toBe(5);
    // No transactions
    expect(pointsData.transactions.length).toBe(0);
  });

  test("waste does not deduct points (no penalty) and no badge awarded", async () => {
    const router = createRouter();

    // Start with some stored points (but computed points override)
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 2,
    });

    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Milk", quantity: 5, unit: "l", category: "dairy" })
      .returning();

    // Waste 3 units: no penalty, wasted doesn't count as action so no badge
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-waste", {
      ingredients: [
        { productId: product.id, productName: "Milk", quantityUsed: 3, unit: "l", category: "dairy", unitPrice: 3 },
      ],
      wasteItems: [
        { productId: product.id, productName: "Milk", quantityWasted: 3 },
      ],
    });

    const pointsRes = await makeRequest(router, "GET", "/api/v1/gamification/points");
    const pointsData = pointsRes.data as { points: { total: number } };

    // wasted doesn't count toward totalActions, so no badge, points = 0
    expect(pointsData.points.total).toBe(0);
  });
});
