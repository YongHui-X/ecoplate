import { describe, expect, test, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Router } from "../../utils/router";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

// Mock users for auth
const mockBuyer = { id: 1, email: "buyer@test.com", name: "Test Buyer" };
const mockSeller = { id: 2, email: "seller@test.com", name: "Test Seller" };
let currentMockUser = mockBuyer;

// Mock auth middleware
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
  getUser: () => currentMockUser,
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

// Mock locker-service with implementations that use testDb
mock.module("../../services/locker-service", () => ({
  getAllLockers: async () => {
    return testDb.query.lockers.findMany({
      where: eq(schema.lockers.status, "active"),
    });
  },
  getLockerById: async (lockerId: number) => {
    return testDb.query.lockers.findFirst({
      where: eq(schema.lockers.id, lockerId),
    });
  },
  getNearbyLockers: async (lat: number, lng: number, radiusKm: number = 10) => {
    // For testing, just return all active lockers
    return testDb.query.lockers.findMany({
      where: eq(schema.lockers.status, "active"),
    });
  },
  createOrder: async (listingId: number, lockerId: number, buyerId: number) => {
    // Get the listing
    const listing = await testDb.query.marketplaceListings.findFirst({
      where: eq(schema.marketplaceListings.id, listingId),
    });

    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    if (listing.status !== "active") {
      return { success: false, error: "Listing is not available" };
    }

    if (listing.sellerId === buyerId) {
      return { success: false, error: "Cannot purchase your own listing" };
    }

    // Get the locker
    const locker = await testDb.query.lockers.findFirst({
      where: eq(schema.lockers.id, lockerId),
    });

    if (!locker) {
      return { success: false, error: "Locker not found" };
    }

    if (locker.availableCompartments < 1) {
      return { success: false, error: "No available compartments at this locker" };
    }

    const itemPrice = listing.price || 0;
    const deliveryFee = 2.0;
    const totalPrice = itemPrice + deliveryFee;
    const now = new Date();
    const paymentDeadline = new Date(now.getTime() + 30 * 60 * 1000);

    const [order] = await testDb
      .insert(schema.lockerOrders)
      .values({
        listingId,
        lockerId,
        buyerId,
        sellerId: listing.sellerId,
        itemPrice,
        deliveryFee,
        totalPrice,
        status: "pending_payment",
        reservedAt: now,
        paymentDeadline,
      })
      .returning();

    await testDb
      .update(schema.marketplaceListings)
      .set({ status: "reserved", buyerId })
      .where(eq(schema.marketplaceListings.id, listingId));

    return { success: true, order };
  },
  getBuyerOrders: async (buyerId: number) => {
    return testDb.query.lockerOrders.findMany({
      where: eq(schema.lockerOrders.buyerId, buyerId),
    });
  },
  getSellerOrders: async (sellerId: number) => {
    return testDb.query.lockerOrders.findMany({
      where: eq(schema.lockerOrders.sellerId, sellerId),
    });
  },
  getOrderById: async (orderId: number, userId: number) => {
    const order = await testDb.query.lockerOrders.findFirst({
      where: eq(schema.lockerOrders.id, orderId),
    });
    if (order && (order.buyerId === userId || order.sellerId === userId)) {
      return order;
    }
    return null;
  },
  processPayment: async (orderId: number, buyerId: number) => {
    const order = await testDb.query.lockerOrders.findFirst({
      where: eq(schema.lockerOrders.id, orderId),
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (order.buyerId !== buyerId) {
      return { success: false, error: "Order not found" };
    }

    if (order.status !== "pending_payment") {
      return { success: false, error: `Cannot pay for order with status: ${order.status}` };
    }

    const [updated] = await testDb
      .update(schema.lockerOrders)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(schema.lockerOrders.id, orderId))
      .returning();

    return { success: true, order: updated };
  },
  setPickupTime: async (orderId: number, sellerId: number, pickupTime: Date) => {
    const order = await testDb.query.lockerOrders.findFirst({
      where: eq(schema.lockerOrders.id, orderId),
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (order.sellerId !== sellerId) {
      return { success: false, error: "Order not found" };
    }

    if (order.status !== "paid") {
      return { success: false, error: `Cannot schedule pickup for order with status: ${order.status}` };
    }

    const [updated] = await testDb
      .update(schema.lockerOrders)
      .set({ status: "pickup_scheduled", pickupScheduledAt: pickupTime })
      .where(eq(schema.lockerOrders.id, orderId))
      .returning();

    return { success: true, order: updated };
  },
  confirmRiderPickup: async (orderId: number, sellerId: number) => {
    const order = await testDb.query.lockerOrders.findFirst({
      where: eq(schema.lockerOrders.id, orderId),
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (order.sellerId !== sellerId) {
      return { success: false, error: "Order not found" };
    }

    if (!["paid", "pickup_scheduled"].includes(order.status)) {
      return { success: false, error: `Cannot confirm pickup for order with status: ${order.status}` };
    }

    const [updated] = await testDb
      .update(schema.lockerOrders)
      .set({ status: "in_transit", riderPickedUpAt: new Date() })
      .where(eq(schema.lockerOrders.id, orderId))
      .returning();

    return { success: true, order: updated, pointsAwarded: 10 };
  },
  verifyPin: async (orderId: number, buyerId: number, pin: string) => {
    const order = await testDb.query.lockerOrders.findFirst({
      where: eq(schema.lockerOrders.id, orderId),
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (order.buyerId !== buyerId) {
      return { success: false, error: "Order not found" };
    }

    if (order.status !== "ready_for_pickup") {
      return { success: false, error: `Cannot verify PIN for order with status: ${order.status}` };
    }

    if (order.pickupPin !== pin) {
      return { success: false, error: "Invalid PIN" };
    }

    const [updated] = await testDb
      .update(schema.lockerOrders)
      .set({ status: "collected", pickedUpAt: new Date() })
      .where(eq(schema.lockerOrders.id, orderId))
      .returning();

    return { success: true, order: updated };
  },
  cancelOrder: async (orderId: number, userId: number, reason: string) => {
    const order = await testDb.query.lockerOrders.findFirst({
      where: eq(schema.lockerOrders.id, orderId),
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      return { success: false, error: "You are not authorized to cancel this order" };
    }

    const cancellableStatuses = ["pending_payment", "paid", "pickup_scheduled", "in_transit", "ready_for_pickup"];
    if (!cancellableStatuses.includes(order.status)) {
      return { success: false, error: `Cannot cancel order with status: ${order.status}` };
    }

    const [updated] = await testDb
      .update(schema.lockerOrders)
      .set({ status: "cancelled", cancelReason: reason })
      .where(eq(schema.lockerOrders.id, orderId))
      .returning();

    return { success: true, order: updated };
  },
  getNotifications: async (userId: number) => {
    return testDb.query.lockerNotifications.findMany({
      where: eq(schema.lockerNotifications.userId, userId),
    });
  },
  getUnreadCount: async (userId: number) => {
    const notifications = await testDb.query.lockerNotifications.findMany({
      where: eq(schema.lockerNotifications.userId, userId),
    });
    return notifications.filter((n) => !n.isRead).length;
  },
  markNotificationAsRead: async (notificationId: number, userId: number) => {
    await testDb
      .update(schema.lockerNotifications)
      .set({ isRead: true })
      .where(eq(schema.lockerNotifications.id, notificationId));
  },
  markAllNotificationsAsRead: async (userId: number) => {
    await testDb
      .update(schema.lockerNotifications)
      .set({ isRead: true })
      .where(eq(schema.lockerNotifications.userId, userId));
  },
  markOrderNotificationsAsRead: async (orderId: number, userId: number) => {
    await testDb
      .update(schema.lockerNotifications)
      .set({ isRead: true })
      .where(eq(schema.lockerNotifications.orderId, orderId));
  },
}));

beforeAll(async () => {
  sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Create tables
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

    CREATE TABLE lockers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      coordinates TEXT NOT NULL,
      total_compartments INTEGER NOT NULL DEFAULT 12,
      available_compartments INTEGER NOT NULL DEFAULT 12,
      operating_hours TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      price REAL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      category TEXT,
      images TEXT,
      pickup_location TEXT,
      original_price REAL,
      expiry_date INTEGER,
      product_id INTEGER REFERENCES products(id),
      seller_id INTEGER NOT NULL REFERENCES users(id),
      buyer_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      co2_saved REAL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      product_name TEXT NOT NULL,
      category TEXT,
      quantity REAL NOT NULL,
      unit TEXT,
      unit_price REAL,
      purchase_date INTEGER,
      description TEXT,
      co2_emission REAL
    );

    CREATE TABLE locker_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES marketplace_listings(id),
      locker_id INTEGER NOT NULL REFERENCES lockers(id),
      buyer_id INTEGER NOT NULL REFERENCES users(id),
      seller_id INTEGER NOT NULL REFERENCES users(id),
      item_price REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      total_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      compartment_number INTEGER,
      pickup_pin TEXT,
      reserved_at INTEGER NOT NULL DEFAULT (unixepoch()),
      payment_deadline INTEGER,
      paid_at INTEGER,
      pickup_scheduled_at INTEGER,
      rider_picked_up_at INTEGER,
      delivered_at INTEGER,
      picked_up_at INTEGER,
      expires_at INTEGER,
      cancel_reason TEXT
    );

    CREATE TABLE locker_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      order_id INTEGER NOT NULL REFERENCES locker_orders(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  testDb = drizzle(sqlite, { schema });

  // Insert test data
  await testDb.insert(schema.users).values([
    { id: 1, email: "buyer@test.com", passwordHash: "hash1", name: "Test Buyer" },
    { id: 2, email: "seller@test.com", passwordHash: "hash2", name: "Test Seller" },
  ]);

  await testDb.insert(schema.lockers).values([
    {
      id: 1,
      name: "Test Locker 1",
      address: "123 Test Street",
      coordinates: "1.3521,103.8198",
      totalCompartments: 20,
      availableCompartments: 15,
      status: "active",
    },
    {
      id: 2,
      name: "Test Locker 2",
      address: "456 Test Avenue",
      coordinates: "1.3400,103.8000",
      totalCompartments: 10,
      availableCompartments: 0,
      status: "active",
    },
    {
      id: 3,
      name: "Inactive Locker",
      address: "789 Test Road",
      coordinates: "1.3600,103.8400",
      totalCompartments: 15,
      availableCompartments: 10,
      status: "inactive",
    },
  ]);
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Reset to buyer by default
  currentMockUser = mockBuyer;

  // Reset listings and orders before each test
  await testDb.delete(schema.lockerOrders);
  await testDb.delete(schema.marketplaceListings);

  // Reset locker compartments
  await testDb.update(schema.lockers).set({ availableCompartments: 15 }).where(eq(schema.lockers.id, 1));
  await testDb.update(schema.lockers).set({ availableCompartments: 0 }).where(eq(schema.lockers.id, 2));
});

// Import actual route registration function AFTER mocks are set up
let registerEcoLockerRoutes: (router: Router) => void;
beforeAll(async () => {
  const ecolockerModule = await import("../ecolocker");
  registerEcoLockerRoutes = ecolockerModule.registerEcoLockerRoutes;
});

function createRouter(user: { id: number; email: string; name: string } = mockBuyer) {
  currentMockUser = user;
  const router = new Router();
  registerEcoLockerRoutes(router);
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

describe("GET /api/v1/ecolocker/lockers", () => {
  test("returns active lockers", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/ecolocker/lockers");

    expect(res.status).toBe(200);
    const data = res.data as { id: number; name: string; status: string }[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2); // Only active lockers
    expect(data.every((l) => l.status === "active")).toBe(true);
  });

  test("does not return inactive lockers", async () => {
    const router = createRouter();
    const res = await makeRequest(router, "GET", "/api/v1/ecolocker/lockers");

    const data = res.data as { id: number; name: string }[];
    expect(data.find((l) => l.name === "Inactive Locker")).toBeUndefined();
  });
});

describe("GET /api/v1/ecolocker/lockers/nearby", () => {
  test("returns lockers with valid coordinates", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/ecolocker/lockers/nearby?lat=1.3521&lng=103.8198"
    );

    expect(res.status).toBe(200);
    const data = res.data as { id: number }[];
    expect(Array.isArray(data)).toBe(true);
  });

  test("returns 400 for missing latitude", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/ecolocker/lockers/nearby?lng=103.8198"
    );

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Invalid latitude or longitude");
  });

  test("returns 400 for missing longitude", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/ecolocker/lockers/nearby?lat=1.3521"
    );

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Invalid latitude or longitude");
  });

  test("returns 400 for invalid latitude range", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/ecolocker/lockers/nearby?lat=91&lng=103.8198"
    );

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Latitude must be between -90 and 90");
  });

  test("returns 400 for invalid longitude range", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/ecolocker/lockers/nearby?lat=1.3521&lng=181"
    );

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Longitude must be between -180 and 180");
  });

  test("returns 400 for invalid radius", async () => {
    const router = createRouter();
    const res = await makeRequest(
      router,
      "GET",
      "/api/v1/ecolocker/lockers/nearby?lat=1.3521&lng=103.8198&radius=150"
    );

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Radius must be between 0.1 and 100 km");
  });
});

describe("POST /api/v1/ecolocker/orders", () => {
  beforeEach(async () => {
    // Create a test listing for each test
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("creates order successfully", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });

    expect(res.status).toBe(200);
    const data = res.data as { id: number; status: string; totalPrice: number };
    expect(data.id).toBeDefined();
    expect(data.status).toBe("pending_payment");
    expect(data.totalPrice).toBe(12.0); // 10 + 2 delivery fee
  });

  test("returns 400 for non-existent listing", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 999,
      lockerId: 1,
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Listing not found");
  });

  test("returns 400 for non-existent locker", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 999,
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Locker not found");
  });

  test("returns 400 when trying to buy own listing", async () => {
    const router = createRouter(mockSeller);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Cannot purchase your own listing");
  });

  test("returns 400 when locker has no available compartments", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 2, // Locker with 0 available compartments
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("No available compartments at this locker");
  });

  test("returns 400 for reserved listing", async () => {
    // First create an order to reserve the listing
    const router = createRouter(mockBuyer);
    await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });

    // Try to create another order for the same listing
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Listing is not available");
  });

  test("returns 400 for invalid listingId", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: -1,
      lockerId: 1,
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid lockerId", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 0,
    });

    expect(res.status).toBe(400);
  });
});

// ==================== Extended Order Management Tests ====================

describe("GET /api/v1/ecolocker/orders", () => {
  beforeEach(async () => {
    // Create a test listing
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("returns empty array when no orders", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "GET", "/api/v1/ecolocker/orders");

    expect(res.status).toBe(200);
    const data = res.data as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  test("returns buyer's orders", async () => {
    // First create an order
    const router = createRouter(mockBuyer);
    await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });

    const res = await makeRequest(router, "GET", "/api/v1/ecolocker/orders");

    expect(res.status).toBe(200);
    const data = res.data as { id: number; buyerId: number }[];
    expect(data.length).toBe(1);
    expect(data[0].buyerId).toBe(mockBuyer.id);
  });
});

describe("GET /api/v1/ecolocker/orders/:id", () => {
  beforeEach(async () => {
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("returns order details for buyer", async () => {
    // Create an order first
    const router = createRouter(mockBuyer);
    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    const res = await makeRequest(router, "GET", `/api/v1/ecolocker/orders/${order.id}`);

    expect(res.status).toBe(200);
    const data = res.data as { id: number; status: string };
    expect(data.id).toBe(order.id);
    expect(data.status).toBe("pending_payment");
  });

  test("returns 404 for non-existent order", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "GET", "/api/v1/ecolocker/orders/999");

    expect(res.status).toBe(404);
    const data = res.data as { error: string };
    expect(data.error).toBe("Order not found");
  });

  test("returns 404 for order belonging to another user", async () => {
    // Create an order as buyer
    const buyerRouter = createRouter(mockBuyer);
    const createRes = await makeRequest(buyerRouter, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    // Try to access as a different user (neither buyer nor seller)
    const otherUser = { id: 999, email: "other@test.com", name: "Other User" };
    const otherRouter = createRouter(otherUser);

    const res = await makeRequest(otherRouter, "GET", `/api/v1/ecolocker/orders/${order.id}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/ecolocker/orders/:id/cancel", () => {
  beforeEach(async () => {
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("buyer can cancel pending_payment order", async () => {
    const router = createRouter(mockBuyer);

    // Create order
    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/cancel`, {
      reason: "Changed my mind",
    });

    expect(res.status).toBe(200);
    const data = res.data as { status: string; cancelReason: string };
    expect(data.status).toBe("cancelled");
    expect(data.cancelReason).toBe("Changed my mind");
  });

  test("returns 400 for empty cancellation reason", async () => {
    const router = createRouter(mockBuyer);

    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/cancel`, {
      reason: "",
    });

    expect(res.status).toBe(400);
  });

  test("cannot cancel already cancelled order", async () => {
    const router = createRouter(mockBuyer);

    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    // Update order to cancelled
    await testDb
      .update(schema.lockerOrders)
      .set({ status: "cancelled" })
      .where(eq(schema.lockerOrders.id, order.id));

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/cancel`, {
      reason: "Test",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toContain("Cannot cancel order");
  });

  test("cannot cancel collected order", async () => {
    const router = createRouter(mockBuyer);

    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    // Update order to collected
    await testDb
      .update(schema.lockerOrders)
      .set({ status: "collected" })
      .where(eq(schema.lockerOrders.id, order.id));

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/cancel`, {
      reason: "Test",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toContain("Cannot cancel order");
  });
});

describe("POST /api/v1/ecolocker/orders/:id/pay", () => {
  beforeEach(async () => {
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("processes payment successfully", async () => {
    const router = createRouter(mockBuyer);

    // Create order
    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/pay`);

    expect(res.status).toBe(200);
    const data = res.data as { status: string; paidAt: string };
    expect(data.status).toBe("paid");
    expect(data.paidAt).toBeDefined();
  });

  test("returns 400 for already paid order", async () => {
    const router = createRouter(mockBuyer);

    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    // Update order to paid
    await testDb
      .update(schema.lockerOrders)
      .set({ status: "paid" })
      .where(eq(schema.lockerOrders.id, order.id));

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/pay`);

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toContain("Cannot pay for order");
  });

  test("returns 400 for non-existent order", async () => {
    const router = createRouter(mockBuyer);
    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders/999/pay");

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/ecolocker/orders/:id/schedule", () => {
  beforeEach(async () => {
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("seller can schedule pickup for paid order", async () => {
    // Create and pay for order as buyer
    const buyerRouter = createRouter(mockBuyer);
    const createRes = await makeRequest(buyerRouter, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    await testDb
      .update(schema.lockerOrders)
      .set({ status: "paid" })
      .where(eq(schema.lockerOrders.id, order.id));

    // Schedule as seller
    const sellerRouter = createRouter(mockSeller);
    const pickupTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const res = await makeRequest(sellerRouter, "POST", `/api/v1/ecolocker/orders/${order.id}/schedule`, {
      pickupTime,
    });

    expect(res.status).toBe(200);
    const data = res.data as { status: string };
    expect(data.status).toBe("pickup_scheduled");
  });

  test("returns 400 for unpaid order", async () => {
    const buyerRouter = createRouter(mockBuyer);
    const createRes = await makeRequest(buyerRouter, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    const sellerRouter = createRouter(mockSeller);
    const pickupTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await makeRequest(sellerRouter, "POST", `/api/v1/ecolocker/orders/${order.id}/schedule`, {
      pickupTime,
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/ecolocker/orders/:id/verify-pin", () => {
  beforeEach(async () => {
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("verifies correct PIN and completes order", async () => {
    const router = createRouter(mockBuyer);

    // Create order
    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    // Set order to ready_for_pickup with PIN
    await testDb
      .update(schema.lockerOrders)
      .set({
        status: "ready_for_pickup",
        pickupPin: "123456",
        compartmentNumber: 5,
      })
      .where(eq(schema.lockerOrders.id, order.id));

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/verify-pin`, {
      pin: "123456",
    });

    expect(res.status).toBe(200);
    const data = res.data as { order: { status: string } };
    expect(data.order.status).toBe("collected");
  });

  test("returns 400 for incorrect PIN", async () => {
    const router = createRouter(mockBuyer);

    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    await testDb
      .update(schema.lockerOrders)
      .set({ status: "ready_for_pickup", pickupPin: "123456" })
      .where(eq(schema.lockerOrders.id, order.id));

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/verify-pin`, {
      pin: "000000",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toBe("Invalid PIN");
  });

  test("returns 400 for order not ready for pickup", async () => {
    const router = createRouter(mockBuyer);

    const createRes = await makeRequest(router, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    const res = await makeRequest(router, "POST", `/api/v1/ecolocker/orders/${order.id}/verify-pin`, {
      pin: "123456",
    });

    expect(res.status).toBe(400);
    const data = res.data as { error: string };
    expect(data.error).toContain("Cannot verify PIN");
  });

  test("returns 400 for invalid PIN format", async () => {
    const router = createRouter(mockBuyer);

    const res = await makeRequest(router, "POST", "/api/v1/ecolocker/orders/1/verify-pin", {
      pin: "123", // Too short
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/ecolocker/orders/:id/confirm-pickup", () => {
  beforeEach(async () => {
    await testDb.insert(schema.marketplaceListings).values({
      id: 1,
      title: "Test Item",
      description: "A test item",
      price: 10.0,
      quantity: 1,
      sellerId: 2,
      status: "active",
    });
  });

  test("seller confirms rider has picked up item", async () => {
    const buyerRouter = createRouter(mockBuyer);

    const createRes = await makeRequest(buyerRouter, "POST", "/api/v1/ecolocker/orders", {
      listingId: 1,
      lockerId: 1,
    });
    const order = createRes.data as { id: number };

    await testDb
      .update(schema.lockerOrders)
      .set({ status: "pickup_scheduled" })
      .where(eq(schema.lockerOrders.id, order.id));

    const sellerRouter = createRouter(mockSeller);
    const res = await makeRequest(sellerRouter, "POST", `/api/v1/ecolocker/orders/${order.id}/confirm-pickup`);

    expect(res.status).toBe(200);
    const data = res.data as { order: { status: string; riderPickedUpAt: string }; pointsAwarded: number };
    expect(data.order.status).toBe("in_transit");
    expect(data.order.riderPickedUpAt).toBeDefined();
    expect(data.pointsAwarded).toBe(10);
  });
});
