import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Router, json } from "../../utils/router";
import * as schema from "../../db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { calculateCo2Saved } from "../../utils/co2-factors";
import { computeCo2Value, calculatePointsForAction } from "../../services/gamification-service";

// Set up in-memory test database
let sqlite: Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let testUserId: number;
let secondUserId: number;

const POINT_VALUES = {
  consumed: 0,
  shared: 0,
  sold: 8,
  wasted: 0,
} as const;

// Simplified route registration for testing
function registerTestGamificationRoutes(
  router: Router,
  db: ReturnType<typeof drizzle<typeof schema>>,
  userId: number
) {
  router.use(async (req, next) => {
    (req as Request & { user: { id: number } }).user = { id: userId };
    return next();
  });

  const getUser = (req: Request) =>
    (req as Request & { user: { id: number } }).user;

  // Get user points
  router.get("/api/v1/gamification/points", async (req) => {
    const user = getUser(req);

    let points = await db.query.userPoints.findFirst({
      where: eq(schema.userPoints.userId, user.id),
    });

    if (!points) {
      const [created] = await db
        .insert(schema.userPoints)
        .values({ userId: user.id })
        .returning();
      points = created;
    }

    const recentInteractions = await db.query.productSustainabilityMetrics.findMany({
      where: eq(schema.productSustainabilityMetrics.userId, user.id),
      orderBy: [desc(schema.productSustainabilityMetrics.todayDate)],
      limit: 20,
      with: {
        product: {
          columns: { category: true },
        },
      },
    });

    const transactions = recentInteractions
      .filter((i) => {
        const t = (i.type || "").toLowerCase();
        return t !== "add" && t !== "shared" && t !== "consumed" && t !== "wasted";
      })
      .map((i) => {
        const normalizedType = (i.type || "").toLowerCase() as keyof typeof POINT_VALUES;
        const category = i.product?.category || "other";
        const co2Emission = (i.product as { co2Emission?: number | null } | null)?.co2Emission ?? null;
        const co2Value = computeCo2Value(i.quantity ?? 1, co2Emission, category);
        const amount = calculatePointsForAction(normalizedType, co2Value);
        return {
          id: i.id,
          amount,
          type: amount < 0 ? "penalty" : "earned",
          action: normalizedType,
          createdAt: i.todayDate,
          quantity: i.quantity ?? 1,
          _timestamp: Date.parse(i.todayDate + "T00:00:00Z"),
        };
      });

    // Fetch recent redemptions
    const recentRedemptions = await db.query.userRedemptions.findMany({
      where: eq(schema.userRedemptions.userId, user.id),
      orderBy: [desc(schema.userRedemptions.createdAt)],
      limit: 20,
      with: { reward: { columns: { name: true } } },
    });

    // Map redemptions to transaction format
    const redemptionTx = recentRedemptions.map((r) => ({
      id: r.id + 1_000_000,
      amount: -r.pointsSpent,
      type: "redeemed" as const,
      action: "redeemed",
      createdAt: r.createdAt instanceof Date
        ? r.createdAt.toISOString().slice(0, 10)
        : typeof r.createdAt === "number"
          ? new Date(r.createdAt * 1000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      quantity: 1,
      _timestamp: r.createdAt instanceof Date
        ? r.createdAt.getTime()
        : typeof r.createdAt === "number"
          ? r.createdAt * 1000
          : Date.now(),
    }));

    // Merge and sort all transactions
    const allTransactions = [...transactions, ...redemptionTx]
      .sort((a, b) => b._timestamp - a._timestamp || b.id - a.id)
      .slice(0, 20);

    return json({
      points: {
        total: points.totalPoints,
        currentStreak: points.currentStreak,
        longestStreak: Math.max(0, points.currentStreak), // Best streak >= current streak
      },
      stats: {
        totalActiveDays: 0,
        lastActiveDate: null,
        firstActivityDate: null,
        pointsToday: 0,
        pointsThisWeek: 0,
        pointsThisMonth: 0,
        pointsThisYear: 0,
        bestDayPoints: 0,
        averagePointsPerActiveDay: 0,
      },
      breakdown: {},
      pointsByMonth: [],
      transactions: allTransactions,
    });
  });

  // Get user metrics
  router.get("/api/v1/gamification/metrics", async (req) => {
    const user = getUser(req);

    const interactions = await db.query.productSustainabilityMetrics.findMany({
      where: eq(schema.productSustainabilityMetrics.userId, user.id),
    });

    const metrics = {
      totalItemsConsumed: 0,
      totalItemsWasted: 0,
      totalItemsShared: 0,
      totalItemsSold: 0,
    };

    for (const interaction of interactions) {
      switch (interaction.type) {
        case "consumed":
          metrics.totalItemsConsumed++;
          break;
        case "wasted":
          metrics.totalItemsWasted++;
          break;
        case "shared":
          metrics.totalItemsShared++;
          break;
        case "sold":
          metrics.totalItemsSold++;
          break;
      }
    }

    const totalItems =
      metrics.totalItemsConsumed +
      metrics.totalItemsWasted +
      metrics.totalItemsShared +
      metrics.totalItemsSold;

    const itemsSaved =
      metrics.totalItemsConsumed + metrics.totalItemsShared + metrics.totalItemsSold;

    const wasteReductionRate = totalItems > 0 ? (itemsSaved / totalItems) * 100 : 100;

    return json({
      ...metrics,
      wasteReductionRate,
      estimatedCo2Saved: itemsSaved * 0.5,
      estimatedMoneySaved: itemsSaved * 5,
    });
  });

  // Get leaderboard — ranked by lifetime points (totalPoints + sum of redeemed points)
  router.get("/api/v1/gamification/leaderboard", async () => {
    const rows = await db
      .select({
        userId: schema.userPoints.userId,
        totalPoints: schema.userPoints.totalPoints,
        currentStreak: schema.userPoints.currentStreak,
        lifetimePoints: sql<number>`${schema.userPoints.totalPoints} + COALESCE(SUM(${schema.userRedemptions.pointsSpent}), 0)`.as("lifetime_points"),
        userName: schema.users.name,
      })
      .from(schema.userPoints)
      .innerJoin(schema.users, eq(schema.users.id, schema.userPoints.userId))
      .leftJoin(schema.userRedemptions, eq(schema.userRedemptions.userId, schema.userPoints.userId))
      .groupBy(schema.userPoints.userId)
      .orderBy(sql`lifetime_points DESC`)
      .limit(10);

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      name: row.userName || "Unknown",
      points: row.lifetimePoints,
      streak: row.currentStreak,
    }));

    return json(leaderboard);
  });

  // Get badges
  router.get("/api/v1/gamification/badges", async (req) => {
    const user = getUser(req);

    const allBadges = await db.query.badges.findMany({
      orderBy: [schema.badges.sortOrder],
    });

    const earnedBadges = await db.query.userBadges.findMany({
      where: eq(schema.userBadges.userId, user.id),
    });

    const earnedBadgeIds = new Set(earnedBadges.map((ub) => ub.badgeId));

    const badgesWithStatus = allBadges.map((badge) => ({
      id: badge.id,
      code: badge.code,
      name: badge.name,
      description: badge.description,
      category: badge.category,
      pointsAwarded: badge.pointsAwarded,
      imageUrl: badge.badgeImageUrl,
      earned: earnedBadgeIds.has(badge.id),
      earnedAt: earnedBadges.find((ub) => ub.badgeId === badge.id)?.earnedAt || null,
      progress: null,
    }));

    return json({
      badges: badgesWithStatus,
      totalEarned: earnedBadges.length,
      totalAvailable: allBadges.length,
    });
  });

  // Confirm consumed ingredients (simplified version of consumption route)
  router.post("/api/v1/consumption/confirm-ingredients", async (req) => {
    const user = getUser(req);
    const body = await req.json();
    const { ingredients } = body;
    const todayDate = new Date().toISOString().split("T")[0];
    const interactionIds: number[] = [];

    for (const ing of ingredients) {
      // Record consumed interaction
      const [interaction] = await db
        .insert(schema.productSustainabilityMetrics)
        .values({
          productId: ing.productId,
          userId: user.id,
          todayDate,
          quantity: ing.quantityUsed,
          unit: ing.unit || null,
          type: "consumed",
        })
        .returning();

      interactionIds.push(interaction.id);

      // No points awarded for consumed actions

      // Ensure user points record exists
      let points = await db.query.userPoints.findFirst({
        where: eq(schema.userPoints.userId, user.id),
      });

      if (!points) {
        await db
          .insert(schema.userPoints)
          .values({ userId: user.id })
          .returning();
      }

      // Deduct from product quantity
      const product = await db.query.products.findFirst({
        where: eq(schema.products.id, ing.productId),
      });
      if (product) {
        await db
          .update(schema.products)
          .set({ quantity: Math.max(0, product.quantity - ing.quantityUsed) })
          .where(eq(schema.products.id, ing.productId));
      }
    }

    return json({ interactionIds, success: true });
  });

  // Confirm waste (simplified version of consumption route)
  router.post("/api/v1/consumption/confirm-waste", async (req) => {
    const user = getUser(req);
    const body = await req.json();
    const { ingredients, wasteItems } = body;
    const todayDate = new Date().toISOString().split("T")[0];

    for (const ing of ingredients) {
      const waste = wasteItems.find(
        (w: { productId: number }) => w.productId === ing.productId
      );
      const wastedQty = waste?.quantityWasted || 0;

      if (wastedQty > 0) {
        // Record wasted interaction (no points awarded/penalized)
        await db.insert(schema.productSustainabilityMetrics).values({
          productId: ing.productId,
          userId: user.id,
          todayDate,
          quantity: wastedQty,
          unit: ing.unit || null,
          type: "wasted",
        });
      }
    }

    return json({ success: true });
  });

  // Get dashboard
  router.get("/api/v1/gamification/dashboard", async (req) => {
    const user = getUser(req);

    const userProducts = await db.query.products.findMany({
      where: eq(schema.products.userId, user.id),
    });

    const userListings = await db.query.marketplaceListings.findMany({
      where: eq(schema.marketplaceListings.sellerId, user.id),
    });

    const activeListings = userListings.filter((l) => l.status === "active");
    const soldListings = userListings.filter((l) => l.status === "completed");

    let points = await db.query.userPoints.findFirst({
      where: eq(schema.userPoints.userId, user.id),
    });

    if (!points) {
      const [created] = await db
        .insert(schema.userPoints)
        .values({ userId: user.id })
        .returning();
      points = created;
    }

    return json({
      products: {
        total: userProducts.length,
      },
      listings: {
        active: activeListings.length,
        sold: soldListings.length,
      },
      gamification: {
        points: points.totalPoints,
        streak: points.currentStreak,
        wasteReductionRate: 100,
        co2Saved: 0,
      },
    });
  });
}

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
      total_co2_saved REAL NOT NULL DEFAULT 0
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
  `);

  testDb = drizzle(sqlite, { schema });

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
});

function createRouter(userId: number = testUserId) {
  const router = new Router();
  registerTestGamificationRoutes(router, testDb, userId);
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

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as { points: { total: number; currentStreak: number } };
    expect(data.points.total).toBe(100);
    expect(data.points.currentStreak).toBe(5);
  });

  test("longestStreak is always >= currentStreak", async () => {
    // When currentStreak is higher than computed longestStreak (hardcoded 0 in test),
    // the Math.max guard ensures longestStreak >= currentStreak
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

  test("only sold appears in points history, consumed/wasted/Add/shared are filtered out", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
    });

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId: testUserId, todayDate: "2025-01-15", type: "consumed", quantity: 2 },
      { userId: testUserId, todayDate: "2025-01-14", type: "wasted", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-13", type: "Add", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-12", type: "shared", quantity: 1 },
      { userId: testUserId, todayDate: "2025-01-11", type: "sold", quantity: 1 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as {
      transactions: Array<{ action: string; amount: number; type: string }>;
    };

    // Only sold should appear
    expect(data.transactions.length).toBe(1);

    const actions = data.transactions.map((t) => t.action);
    expect(actions).toContain("sold");
    expect(actions).not.toContain("consumed");
    expect(actions).not.toContain("wasted");
    expect(actions).not.toContain("add");
    expect(actions).not.toContain("Add");
    expect(actions).not.toContain("shared");

    // Verify sold amount (no product → "other" category, factor 2.5)
    // round(1 * 2.5 * 1.5) = round(3.75) = 4
    const soldTx = data.transactions.find((t) => t.action === "sold");
    expect(soldTx?.amount).toBe(4);
    expect(soldTx?.type).toBe("earned");
  });

  test("sold transactions with fractional qty show scaled values", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 50,
    });

    // No productId → "other" category → factor 2.5
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId: testUserId, todayDate: "2025-01-15", type: "sold", quantity: 0.5 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    const data = res.data as { transactions: Array<{ action: string; amount: number }> };
    const soldTx = data.transactions.find((t) => t.action === "sold");
    // round(0.5 * 2.5 * 1.5) = round(1.875) = 2, bumped to minimum 3
    expect(soldTx?.amount).toBe(3);
  });

  test("only sold transactions appear with correct amounts", async () => {
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 100,
    });

    // No productId → "other" category → factor 2.5
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId: testUserId, todayDate: "2025-01-15", type: "consumed", quantity: 3 },
      { userId: testUserId, todayDate: "2025-01-15", type: "wasted", quantity: 5 },
      { userId: testUserId, todayDate: "2025-01-15", type: "sold", quantity: 1 },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    const data = res.data as { transactions: Array<{ action: string; amount: number; type: string }> };
    // consumed and wasted are filtered out
    expect(data.transactions.length).toBe(1);

    // sold: round(1 * 2.5 * 1.5) = round(3.75) = 4
    const soldTx = data.transactions.find((t) => t.action === "sold");
    expect(soldTx?.amount).toBe(4);
    expect(soldTx?.type).toBe("earned");
  });

  test("sold item appears before same-day redemption in transaction history", async () => {
    const today = new Date().toISOString().split("T")[0];

    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 100,
    });

    // Insert a sold interaction with today's date
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId: testUserId,
      todayDate: today,
      type: "sold",
      quantity: 1,
    });

    // Create a reward and a redemption with today's timestamp
    const [reward] = await testDb
      .insert(schema.rewards)
      .values({ name: "Test Reward", pointsCost: 10, category: "test" })
      .returning();

    await testDb.insert(schema.userRedemptions).values({
      userId: testUserId,
      rewardId: reward.id,
      pointsSpent: 10,
      redemptionCode: "SORT-TEST-001",
    });

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as {
      transactions: Array<{ action: string; _timestamp: number }>;
    };

    // Should have both a sold transaction and a redeemed transaction
    const soldIdx = data.transactions.findIndex((t) => t.action === "sold");
    const redeemedIdx = data.transactions.findIndex((t) => t.action === "redeemed");

    expect(soldIdx).not.toBe(-1);
    expect(redeemedIdx).not.toBe(-1);

    // Redemptions have real timestamps (e.g. 15:00) which sort above
    // sold items at start-of-day (00:00:00Z), so redeemed appears first (lower index)
    expect(redeemedIdx).toBeLessThan(soldIdx);
  });

  test("newer day transactions appear before older day transactions", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 50,
    });

    // Insert older interaction first
    await testDb.insert(schema.productSustainabilityMetrics).values([
      {
        userId: testUserId,
        todayDate: yesterdayStr,
        type: "sold",
        quantity: 1,
      },
      {
        userId: testUserId,
        todayDate: todayStr,
        type: "sold",
        quantity: 2,
      },
    ]);

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");

    expect(res.status).toBe(200);
    const data = res.data as {
      transactions: Array<{ action: string; createdAt: string; quantity: number }>;
    };

    expect(data.transactions.length).toBe(2);
    // Today's transaction should appear first (index 0)
    expect(data.transactions[0].createdAt).toBe(todayStr);
    expect(data.transactions[1].createdAt).toBe(yesterdayStr);
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

    // CO2 saved: 5 items * 0.5 = 2.5
    expect(data.estimatedCo2Saved).toBe(2.5);

    // Money saved: 5 items * $5 = $25
    expect(data.estimatedMoneySaved).toBe(25);
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

    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/gamification/dashboard");

    const data = res.data as { gamification: { points: number; streak: number } };
    expect(data.gamification.points).toBe(150);
    expect(data.gamification.streak).toBe(7);
  });
});

describe("Consumption → Points History integration", () => {
  test("confirm-ingredients records consumed interaction but does not award points", async () => {
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

    // No points awarded for consumed
    expect(pointsData.points.total).toBe(0);

    // Consumed transactions are filtered from history
    expect(pointsData.transactions.length).toBe(0);
  });

  test("confirm-waste records wasted interaction but does not deduct points", async () => {
    const router = createRouter();

    // Seed initial points
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

    // Points unchanged (wasted no longer penalizes)
    expect(pointsData.points.total).toBe(50);

    // Streak preserved (wasted no longer resets streak)
    expect(pointsData.points.currentStreak).toBe(3);

    // Wasted transactions are filtered from history
    expect(pointsData.transactions.length).toBe(0);
  });

  test("full meal flow: consume then waste, no points change", async () => {
    const router = createRouter();

    const [chicken] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Chicken", quantity: 5, unit: "kg", category: "meat" })
      .returning();

    const [veggies] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Vegetables", quantity: 3, unit: "kg", category: "produce" })
      .returning();

    // Step 1: Confirm consumption of both ingredients
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-ingredients", {
      ingredients: [
        { productId: chicken.id, productName: "Chicken", quantityUsed: 2, unit: "kg", category: "meat", unitPrice: 10 },
        { productId: veggies.id, productName: "Vegetables", quantityUsed: 1, unit: "kg", category: "produce", unitPrice: 3 },
      ],
    });

    // Step 2: Confirm waste (some chicken was wasted)
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-waste", {
      ingredients: [
        { productId: chicken.id, productName: "Chicken", quantityUsed: 2, unit: "kg", category: "meat", unitPrice: 10 },
      ],
      wasteItems: [
        { productId: chicken.id, productName: "Chicken", quantityWasted: 0.5 },
      ],
    });

    // Check points history
    const pointsRes = await makeRequest(router, "GET", "/api/v1/gamification/points");
    const pointsData = pointsRes.data as {
      points: { total: number };
      transactions: Array<{ action: string; amount: number; type: string }>;
    };

    // No points for consumed or wasted
    expect(pointsData.points.total).toBe(0);

    // consumed and wasted are filtered from transactions
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

  test("zero waste quantity does not create waste transaction", async () => {
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

    // Confirm waste with 0 quantity
    await makeRequest(router, "POST", "/api/v1/consumption/confirm-waste", {
      ingredients: [
        { productId: product.id, productName: "Fish", quantityUsed: 1, unit: "kg", category: "seafood", unitPrice: 15 },
      ],
      wasteItems: [
        { productId: product.id, productName: "Fish", quantityWasted: 0 },
      ],
    });

    // Points unchanged, streak preserved
    const pointsRes = await makeRequest(router, "GET", "/api/v1/gamification/points");
    const pointsData = pointsRes.data as {
      points: { total: number; currentStreak: number };
      transactions: Array<{ action: string }>;
    };

    expect(pointsData.points.total).toBe(20);
    expect(pointsData.points.currentStreak).toBe(5);
    expect(pointsData.transactions.length).toBe(0);
  });

  test("sold transactions are separable from redeemed transactions", async () => {
    const router = createRouter();

    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 200,
    });

    // Create activity-based interactions
    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Apple", quantity: 10, unit: "kg", category: "produce" })
      .returning();

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId: testUserId, todayDate: "2025-01-15", type: "sold", quantity: 2, productId: product.id },
      { userId: testUserId, todayDate: "2025-01-14", type: "consumed", quantity: 1, productId: product.id },
      { userId: testUserId, todayDate: "2025-01-13", type: "wasted", quantity: 1, productId: product.id },
    ]);

    // Create a reward and two redemptions
    const [reward] = await testDb
      .insert(schema.rewards)
      .values({ name: "Voucher", pointsCost: 15, category: "food" })
      .returning();

    await testDb.insert(schema.userRedemptions).values([
      { userId: testUserId, rewardId: reward.id, pointsSpent: 15, redemptionCode: "SPLIT-001" },
      { userId: testUserId, rewardId: reward.id, pointsSpent: 15, redemptionCode: "SPLIT-002" },
    ]);

    const res = await makeRequest(router, "GET", "/api/v1/gamification/points");
    expect(res.status).toBe(200);

    const data = res.data as {
      transactions: Array<{ action: string; amount: number }>;
    };

    // Filter into the two groups the frontend uses
    const soldGroup = data.transactions.filter((tx) => tx.action !== "redeemed");
    const redeemGroup = data.transactions.filter((tx) => tx.action === "redeemed");

    // Sold group should only contain sold (consumed/wasted are now filtered out)
    expect(soldGroup.length).toBe(1);
    expect(soldGroup[0].action).toBe("sold");

    // Redeem group should only contain redeemed
    expect(redeemGroup.length).toBe(2);
    for (const tx of redeemGroup) {
      expect(tx.action).toBe("redeemed");
      expect(tx.amount).toBeLessThan(0);
    }
  });

  test("waste does not change points (no penalty)", async () => {
    const router = createRouter();

    // Start with only 2 points
    await testDb.insert(schema.userPoints).values({
      userId: testUserId,
      totalPoints: 2,
    });

    const [product] = await testDb
      .insert(schema.products)
      .values({ userId: testUserId, productName: "Milk", quantity: 5, unit: "l", category: "dairy" })
      .returning();

    // Waste 3 units: no penalty
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

    // Points unchanged (waste doesn't penalize anymore)
    expect(pointsData.points.total).toBe(2);
  });
});
