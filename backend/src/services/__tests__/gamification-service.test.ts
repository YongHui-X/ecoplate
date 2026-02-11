import { describe, expect, test, beforeAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

// ── In-memory DB setup ──────────────────────────────────────────────

const sqlite = new Database(":memory:");
sqlite.exec("PRAGMA journal_mode = WAL;");

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
    quantity REAL NOT NULL,
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

  CREATE TABLE product_sustainability_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    today_date TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    type TEXT
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
    earned_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, badge_id)
  );

  CREATE TABLE rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    category TEXT NOT NULL,
    points_cost INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const testDb = drizzle(sqlite, { schema });

// Override the db instance directly — avoids mock.module which is unreliable on Linux CI.
import { __setTestDb } from "../../db/connection";
__setTestDb(testDb);

// Import after db override and mocks are set up.
// Use dynamic imports to guarantee mocks are applied before module resolution.
const {
  POINT_VALUES,
  awardPoints,
  updateStreak,
  getDetailedPointsStats,
  getUserMetrics,
  getOrCreateUserPoints,
} = await import("../gamification-service");

// ── Seed data ────────────────────────────────────────────────────────

let userId: number;
let productId: number;

beforeAll(() => {
  // Seed a test user
  const userStmt = sqlite.prepare(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?) RETURNING id"
  );
  const userRow = userStmt.get("test@eco.com", "hash123", "Test User") as { id: number };
  userId = userRow.id;

  // Seed a test product
  const prodStmt = sqlite.prepare(
      "INSERT INTO products (user_id, product_name, category, quantity) VALUES (?, ?, ?, ?) RETURNING id"
  );
  const prodRow = prodStmt.get(userId, "Milk", "dairy", 1) as { id: number };
  productId = prodRow.id;
});

beforeEach(() => {
  // Reset points and interactions between tests
  sqlite.exec("DELETE FROM user_redemptions");
  sqlite.exec("DELETE FROM user_badges");
  sqlite.exec("DELETE FROM product_sustainability_metrics");
  sqlite.exec("DELETE FROM user_points");
  sqlite.exec("DELETE FROM notifications");
  sqlite.exec("DELETE FROM notification_preferences");
  sqlite.exec("DELETE FROM rewards");
});

// ── POINT_VALUES ─────────────────────────────────────────────────────

describe("POINT_VALUES", () => {
  test("consumed awards 0 points", () => {
    expect(POINT_VALUES.consumed).toBe(0);
  });

  test("shared awards 0 points", () => {
    expect(POINT_VALUES.shared).toBe(0);
  });

  test("sold awards 8 points", () => {
    expect(POINT_VALUES.sold).toBe(8);
  });

  test("wasted awards 0 points", () => {
    expect(POINT_VALUES.wasted).toBe(0);
  });
});

// ── awardPoints ──────────────────────────────────────────────────────

describe("awardPoints", () => {
  // Product is "Milk" category "dairy": CO2 factor = 7.0 + 0.5 = 7.5
  // Only "sold" earns points: round(qty * 7.5 * 1.5)
  // consumed/shared/wasted all return amount=0

  test("consumed returns 0 points (no longer earns)", async () => {
    const result = await awardPoints(userId, "consumed", productId);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(0);
    expect(result.action).toBe("consumed");
  });

  test("awards correct positive points for sold (dairy, qty=1)", async () => {
    const result = await awardPoints(userId, "sold", productId);
    // 1 * 7.5 * 1.5 = 11.25 → round = 11
    expect(result.amount).toBe(11);
    expect(result.newTotal).toBe(11);
  });

  test("shared returns 0 points (no longer earns)", async () => {
    const result = await awardPoints(userId, "shared", productId);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(0);
  });

  test("wasted returns 0 points (no longer penalizes)", async () => {
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 100 })
      .where(eq(schema.userPoints.userId, userId));

    const result = await awardPoints(userId, "wasted", productId);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(100); // unchanged
  });

  test("sold scales points with quantity", async () => {
    const result = await awardPoints(userId, "sold", productId, 3);
    // round(3 * 7.5 * 1.5) = round(33.75) = 34
    expect(result.amount).toBe(34);
    expect(result.newTotal).toBe(34);
  });

  test("wasted does not reduce total (amount=0)", async () => {
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 10 })
      .where(eq(schema.userPoints.userId, userId));

    const result = await awardPoints(userId, "wasted", productId, 100);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(10); // unchanged
  });

  test("records a sustainability metric row", async () => {
    await awardPoints(userId, "consumed", productId);
    const metrics = await testDb.query.productSustainabilityMetrics.findMany({
      where: eq(schema.productSustainabilityMetrics.userId, userId),
    });
    expect(metrics.length).toBe(1);
    expect(metrics[0].type).toBe("consumed");
    expect(metrics[0].productId).toBe(productId);
  });

  test("skips metric recording when skipMetricRecording=true", async () => {
    await awardPoints(userId, "consumed", productId, 1, true);
    const metrics = await testDb.query.productSustainabilityMetrics.findMany({
      where: eq(schema.productSustainabilityMetrics.userId, userId),
    });
    expect(metrics.length).toBe(0);
  });

  test("wasted action does not reset streak (no longer penalizes)", async () => {
    // Set a streak via a sold action
    await awardPoints(userId, "sold", productId);
    const pointsBefore = await getOrCreateUserPoints(userId);
    expect(pointsBefore.currentStreak).toBe(1);

    // Wasted should not change streak
    await awardPoints(userId, "wasted", productId);
    const pointsAfter = await getOrCreateUserPoints(userId);
    expect(pointsAfter.currentStreak).toBe(1);
  });

  test("consumed with fractional qty (0.2) returns 0 points", async () => {
    const result = await awardPoints(userId, "consumed", productId, 0.2);
    expect(result.amount).toBe(0);
  });

  test("wasted with fractional qty (0.3) returns 0 points", async () => {
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 100 })
      .where(eq(schema.userPoints.userId, userId));

    const result = await awardPoints(userId, "wasted", productId, 0.3);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(100); // unchanged
  });

  test("sold with qty=1 awards CO2-based points", async () => {
    const result = await awardPoints(userId, "sold", productId, 1);
    // round(1 * 7.5 * 1.5) = round(11.25) = 11
    expect(result.amount).toBe(11);
  });

  test("sold with qty=3 awards CO2-based points", async () => {
    const result = await awardPoints(userId, "sold", productId, 3);
    // round(3 * 7.5 * 1.5) = round(33.75) = 34
    expect(result.amount).toBe(34);
  });

  // ── Quantity scaling for sold (dairy product, CO2 factor 7.5) ──────

  test("sold 2.5 kg dairy awards 28 pts", async () => {
    const result = await awardPoints(userId, "sold", productId, 2.5);
    // round(2.5 * 7.5 * 1.5) = round(28.125) = 28
    expect(result.amount).toBe(28);
  });

  test("sold 0.5 kg dairy awards 6 pts", async () => {
    const result = await awardPoints(userId, "sold", productId, 0.5);
    // round(0.5 * 7.5 * 1.5) = round(5.625) = 6
    expect(result.amount).toBe(6);
  });

  test("sold 1.0 kg dairy awards 11 pts", async () => {
    const result = await awardPoints(userId, "sold", productId, 1.0);
    // round(1.0 * 7.5 * 1.5) = round(11.25) = 11
    expect(result.amount).toBe(11);
  });

  test("sold 10 kg dairy awards 113 pts", async () => {
    const result = await awardPoints(userId, "sold", productId, 10);
    // round(10 * 7.5 * 1.5) = round(112.5) = 113
    expect(result.amount).toBe(113);
  });

  test("wasted 2.0 kg dairy returns 0 pts (no penalty)", async () => {
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 100 })
      .where(eq(schema.userPoints.userId, userId));

    const result = await awardPoints(userId, "wasted", productId, 2.0);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(100);
  });

  test("wasted 0.5 kg dairy returns 0 pts (no penalty)", async () => {
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 50 })
      .where(eq(schema.userPoints.userId, userId));

    const result = await awardPoints(userId, "wasted", productId, 0.5);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(50);
  });

  test("wasted 5.0 kg dairy returns 0 pts (no penalty)", async () => {
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 100 })
      .where(eq(schema.userPoints.userId, userId));

    const result = await awardPoints(userId, "wasted", productId, 5.0);
    expect(result.amount).toBe(0);
    expect(result.newTotal).toBe(100);
  });

  test("shared 2.0 kg dairy returns 0 pts", async () => {
    const result = await awardPoints(userId, "shared", productId, 2.0);
    expect(result.amount).toBe(0);
  });

  test("shared 0.3 kg dairy returns 0 pts", async () => {
    const result = await awardPoints(userId, "shared", productId, 0.3);
    expect(result.amount).toBe(0);
  });

  test("sold 1.5 kg dairy awards 17 pts", async () => {
    const result = await awardPoints(userId, "sold", productId, 1.5);
    // round(1.5 * 7.5 * 1.5) = round(16.875) = 17
    expect(result.amount).toBe(17);
  });

  test("cumulative points: consume 2kg + waste 0.5kg both return 0 (dairy)", async () => {
    const r1 = await awardPoints(userId, "consumed", productId, 2.0);
    expect(r1.amount).toBe(0);
    expect(r1.newTotal).toBe(0);

    const r2 = await awardPoints(userId, "wasted", productId, 0.5);
    expect(r2.amount).toBe(0);
    expect(r2.newTotal).toBe(0);
  });

  test("cumulative points: only sold accumulates (dairy)", async () => {
    // Consume 3.0 kg → 0 points
    const r1 = await awardPoints(userId, "consumed", productId, 3.0);
    expect(r1.newTotal).toBe(0);

    // Sold 2.0 kg → round(2.0 * 7.5 * 1.5) = round(22.5) = 23
    const r2 = await awardPoints(userId, "sold", productId, 2.0);
    expect(r2.amount).toBe(23);
    expect(r2.newTotal).toBe(23);

    // Wasted 4.0 kg → 0 points
    const r3 = await awardPoints(userId, "wasted", productId, 4.0);
    expect(r3.amount).toBe(0);
    expect(r3.newTotal).toBe(23); // unchanged
  });

  test("only sold increments streak", async () => {
    // Consumed action should NOT set streak
    await awardPoints(userId, "consumed", productId);
    const after1 = await getOrCreateUserPoints(userId);
    expect(after1.currentStreak).toBe(0);

    // Sold action should set streak to 1
    await awardPoints(userId, "sold", productId);
    const after2 = await getOrCreateUserPoints(userId);
    expect(after2.currentStreak).toBe(1);
  });

  test("no productId defaults to 'other' category, consumed returns 0", async () => {
    const result = await awardPoints(userId, "consumed", null, 1);
    expect(result.amount).toBe(0);
  });

  test("no productId defaults to 'other' category, sold returns minimum 3", async () => {
    const result = await awardPoints(userId, "sold", null, 1);
    // round(1 * 3.0 * 1.5) = round(4.5) = 5
    expect(result.amount).toBe(5);
  });
});

// ── updateStreak ─────────────────────────────────────────────────────

describe("updateStreak", () => {
  test("first qualifying sold action sets streak to 1", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Insert a qualifying metric (only sold qualifies now)
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId,
      productId,
      todayDate: today,
      quantity: 1,
      type: "sold",
    });
    // Create user points record first
    await getOrCreateUserPoints(userId);

    await updateStreak(userId);

    const up = await getOrCreateUserPoints(userId);
    expect(up.currentStreak).toBe(1);
  });

  test("consumed action does not qualify for streak", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId,
      productId,
      todayDate: today,
      quantity: 1,
      type: "consumed",
    });
    await getOrCreateUserPoints(userId);

    await updateStreak(userId);

    const up = await getOrCreateUserPoints(userId);
    // consumed doesn't qualify, so streak stays at 0
    expect(up.currentStreak).toBe(0);
  });

  test("second qualifying action on same day does not double-increment", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Insert two sold metrics for today
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
    ]);
    await getOrCreateUserPoints(userId);

    await updateStreak(userId);

    const up = await getOrCreateUserPoints(userId);
    // Should still be 0 because there were already >1 interactions when updateStreak ran
    expect(up.currentStreak).toBe(0);
  });

  test("sold action on consecutive day increments streak", async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Yesterday's sold action
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId, productId, todayDate: yesterdayStr, quantity: 1, type: "sold",
    });
    // Set current streak to 1 (simulating yesterday's streak update)
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ currentStreak: 1 })
      .where(eq(schema.userPoints.userId, userId));

    // Today's sold action (exactly 1 for today so the >1 check doesn't trigger)
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId, productId, todayDate: today, quantity: 1, type: "sold",
    });

    await updateStreak(userId);

    const up = await getOrCreateUserPoints(userId);
    expect(up.currentStreak).toBe(2);
  });

  test("action after a gap day resets streak to 1", async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

    // Sold action two days ago
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId, productId, todayDate: twoDaysAgoStr, quantity: 1, type: "sold",
    });
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ currentStreak: 5 })
      .where(eq(schema.userPoints.userId, userId));

    // Today's sold action (gap of 1 day)
    await testDb.insert(schema.productSustainabilityMetrics).values({
      userId, productId, todayDate: today, quantity: 1, type: "sold",
    });

    await updateStreak(userId);

    const up = await getOrCreateUserPoints(userId);
    expect(up.currentStreak).toBe(1);
  });
});

// ── getDetailedPointsStats ───────────────────────────────────────────

describe("getDetailedPointsStats", () => {
  test("returns correct breakdown counts by type", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
      { userId, productId, todayDate: today, quantity: 1, type: "wasted" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    expect(stats.breakdownByType.consumed.count).toBe(2);
    expect(stats.breakdownByType.sold.count).toBe(1);
    expect(stats.breakdownByType.wasted.count).toBe(1);
    expect(stats.breakdownByType.shared.count).toBe(0);
  });

  test("computes longestStreak from sold interaction history", async () => {
    const now = new Date();
    // Create 3 consecutive days of sold activity
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      await testDb.insert(schema.productSustainabilityMetrics).values({
        userId, productId, todayDate: dateStr, quantity: 1, type: "sold",
      });
    }

    const stats = await getDetailedPointsStats(userId);
    expect(stats.longestStreak).toBe(3);
  });

  test("computes pointsToday correctly (dairy product)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
    ]);

    const stats = await getDetailedPointsStats(userId);
    // consumed: 0 (no points for consumed), sold: round(1*7.5*1.5)=round(11.25)=11 → 11
    expect(stats.pointsToday).toBe(11);
  });

  test("computes pointsThisWeek correctly (dairy product)", async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: threeDaysAgoStr, quantity: 1, type: "sold" },
    ]);

    const stats = await getDetailedPointsStats(userId);
    // consumed: 0 (no points), sold: 11 → 11
    expect(stats.pointsThisWeek).toBe(11);
  });

  test("computes pointsThisMonth correctly (dairy product)", async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const fortyDaysAgo = new Date(now);
    fortyDaysAgo.setUTCDate(fortyDaysAgo.getUTCDate() - 40);
    const fortyDaysAgoStr = fortyDaysAgo.toISOString().slice(0, 10);

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: fortyDaysAgoStr, quantity: 1, type: "sold" },
    ]);

    const stats = await getDetailedPointsStats(userId);
    // consumed: 0 (no points for consumed), sold from 40 days ago: not in this month
    expect(stats.pointsThisMonth).toBe(0);
  });

  test("points history shows correct amounts for fractional qty (dairy)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 0.2, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 0.3, type: "wasted" },
      { userId, productId, todayDate: today, quantity: 3, type: "sold" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // consumed: 0 (no points for consumed)
    expect(stats.breakdownByType.consumed.totalPoints).toBe(0);
    // wasted: 0 (no points for wasted)
    expect(stats.breakdownByType.wasted.totalPoints).toBe(0);
    // sold: round(3 * 7.5 * 1.5) = round(33.75) = 34
    expect(stats.breakdownByType.sold.totalPoints).toBe(34);
  });

  test("stats scale correctly with kg-based quantities (dairy)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 2.5, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1.5, type: "sold" },
      { userId, productId, todayDate: today, quantity: 0.8, type: "wasted" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // consumed: 0 (no points for consumed)
    expect(stats.breakdownByType.consumed.totalPoints).toBe(0);
    // sold: round(1.5 * 7.5 * 1.5) = round(16.875) = 17
    expect(stats.breakdownByType.sold.totalPoints).toBe(17);
    // wasted: 0 (no points for wasted)
    expect(stats.breakdownByType.wasted.totalPoints).toBe(0);

    // pointsToday = 0 + 17 + 0 = 17
    expect(stats.pointsToday).toBe(17);
  });

  test("stats scale with large kg quantities across multiple entries (dairy)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 5.0, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 2.0, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 3.0, type: "wasted" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // consumed: 0 (no points for consumed)
    expect(stats.breakdownByType.consumed.totalPoints).toBe(0);
    expect(stats.breakdownByType.consumed.count).toBe(2);

    // wasted: 0 (no points for wasted)
    expect(stats.breakdownByType.wasted.totalPoints).toBe(0);

    // pointsToday = 0 + 0 = 0 (floored at 0)
    expect(stats.pointsToday).toBe(0);
  });

  test("stats with mixed quantities (dairy product)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 10, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 0.5, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 2.0, type: "shared" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // consumed: 0 (no points for consumed)
    expect(stats.breakdownByType.consumed.totalPoints).toBe(0);

    // shared: 0 (no points for shared)
    expect(stats.breakdownByType.shared.totalPoints).toBe(0);

    // pointsToday = 0
    expect(stats.pointsToday).toBe(0);
  });

  test("computes pointsThisYear correctly (this year vs last year)", async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Use a date from last year
    const lastYear = `${now.getUTCFullYear() - 1}-06-15`;

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: lastYear, quantity: 1, type: "consumed" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // consumed: 0 (no points for consumed)
    expect(stats.pointsThisYear).toBe(0);
  });

  test("computedTotalPoints matches sum of all interactions", async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const lastYear = `${now.getUTCFullYear() - 1}-03-10`;

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
      { userId, productId, todayDate: lastYear, quantity: 1, type: "consumed" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // consumed: 0 (no points for consumed)
    // sold today: round(1 * 7.5 * 1.5) = round(11.25) = 11
    // total = 0 + 11 + 0 = 11
    expect(stats.computedTotalPoints).toBe(11);
  });

  test("computedTotalPoints subtracts redeemed points", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Earn 11 points from a sold item (dairy, qty=1)
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
    ]);

    // Create a reward and a redemption of 5 points
    const [reward] = await testDb.insert(schema.rewards).values({
      name: "Test Voucher",
      category: "voucher",
      pointsCost: 5,
      stock: 10,
    }).returning();

    await testDb.insert(schema.userRedemptions).values({
      userId,
      rewardId: reward.id,
      pointsSpent: 5,
      redemptionCode: "EP-TEST0001",
      status: "pending",
    });

    const stats = await getDetailedPointsStats(userId);

    // sold: round(1 * 7.5 * 1.5) = 11, minus 5 redeemed = 6
    expect(stats.computedTotalPoints).toBe(6);
  });

  test("computedTotalPoints subtracts multiple redemptions", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Earn 34 points from sold items (dairy, qty=3)
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 3, type: "sold" },
    ]);

    // Create a reward
    const [reward] = await testDb.insert(schema.rewards).values({
      name: "Test Voucher",
      category: "voucher",
      pointsCost: 10,
      stock: 10,
    }).returning();

    // Two redemptions totaling 20 points
    await testDb.insert(schema.userRedemptions).values([
      { userId, rewardId: reward.id, pointsSpent: 10, redemptionCode: "EP-MULTI001", status: "pending" },
      { userId, rewardId: reward.id, pointsSpent: 10, redemptionCode: "EP-MULTI002", status: "pending" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // sold: round(3 * 7.5 * 1.5) = 34, minus 20 redeemed = 14
    expect(stats.computedTotalPoints).toBe(14);
  });

  test("computedTotalPoints floors at 0 when redemptions exceed earned", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Earn 11 points
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
    ]);

    // Redeem more than earned (edge case from the bug)
    const [reward] = await testDb.insert(schema.rewards).values({
      name: "Big Voucher",
      category: "voucher",
      pointsCost: 50,
      stock: 10,
    }).returning();

    await testDb.insert(schema.userRedemptions).values({
      userId,
      rewardId: reward.id,
      pointsSpent: 50,
      redemptionCode: "EP-OVER0001",
      status: "pending",
    });

    const stats = await getDetailedPointsStats(userId);

    // 11 - 50 = -39, but floored at 0
    expect(stats.computedTotalPoints).toBe(0);
  });

  test("getDetailedPointsStats syncs totalPoints to DB", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Set DB totalPoints to a wrong value
    await getOrCreateUserPoints(userId);
    await testDb.update(schema.userPoints)
      .set({ totalPoints: 999 })
      .where(eq(schema.userPoints.userId, userId));

    // Earn 11 points from a sold item (dairy, qty=1)
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
    ]);

    const stats = await getDetailedPointsStats(userId);
    expect(stats.computedTotalPoints).toBe(11);

    // DB should now be synced to 11
    const dbPoints = await getOrCreateUserPoints(userId);
    expect(dbPoints.totalPoints).toBe(11);
  });

  test("computedTotalPoints unaffected when user has no redemptions", async () => {
    const today = new Date().toISOString().slice(0, 10);

    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 2, type: "sold" },
    ]);

    const stats = await getDetailedPointsStats(userId);

    // sold: round(2 * 7.5 * 1.5) = round(22.5) = 23, no redemptions
    expect(stats.computedTotalPoints).toBe(23);
  });
});

// ── getUserMetrics ───────────────────────────────────────────────────

describe("getUserMetrics", () => {
  test("counts each type correctly", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "wasted" },
      { userId, productId, todayDate: today, quantity: 1, type: "sold" },
      { userId, productId, todayDate: today, quantity: 1, type: "shared" },
    ]);

    const metrics = await getUserMetrics(userId);
    expect(metrics.totalItemsConsumed).toBe(2);
    expect(metrics.totalItemsWasted).toBe(1);
    expect(metrics.totalItemsSold).toBe(1);
    expect(metrics.totalItemsShared).toBe(1);
  });

  test("handles case variants ('consume' vs 'consumed')", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "Consume" },
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "Waste" },
      { userId, productId, todayDate: today, quantity: 1, type: "wasted" },
    ]);

    const metrics = await getUserMetrics(userId);
    expect(metrics.totalItemsConsumed).toBe(2);
    expect(metrics.totalItemsWasted).toBe(2);
  });

  test("computes wasteReductionRate correctly", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // 3 consumed, 1 wasted → saved=3, total=4, rate=75%
    await testDb.insert(schema.productSustainabilityMetrics).values([
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "consumed" },
      { userId, productId, todayDate: today, quantity: 1, type: "wasted" },
    ]);

    const metrics = await getUserMetrics(userId);
    expect(metrics.wasteReductionRate).toBeCloseTo(75, 1);
  });

  test("wasteReductionRate is 100 when no interactions", async () => {
    const metrics = await getUserMetrics(userId);
    expect(metrics.wasteReductionRate).toBe(100);
  });
});
