import { Router, json, error } from "../utils/router";
import { db } from "../index";
import {
  userPoints,
  pointTransactions,
  badges,
  userBadges,
  userSustainabilityMetrics,
  products,
  marketplaceListings,
} from "../db/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getUser } from "../middleware/auth";

export function registerGamificationRoutes(router: Router) {
  // Get dashboard data
  router.get("/api/v1/gamification/dashboard", async (req) => {
    const user = getUser(req);

    // Get products stats
    const userProducts = await db.query.products.findMany({
      where: and(eq(products.userId, user.id), eq(products.isConsumed, false)),
    });

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const expiringToday = userProducts.filter((p) => {
      if (!p.expiryDate) return false;
      const expiry = new Date(p.expiryDate);
      return expiry <= todayEnd && expiry >= now;
    });

    const expiringSoon = userProducts.filter((p) => {
      if (!p.expiryDate) return false;
      const expiry = new Date(p.expiryDate);
      return expiry > todayEnd && expiry <= threeDaysFromNow;
    });

    // Get listings stats
    const userListings = await db.query.marketplaceListings.findMany({
      where: eq(marketplaceListings.sellerId, user.id),
    });

    const activeListings = userListings.filter((l) => l.status === "active");
    const soldListings = userListings.filter((l) => l.status === "sold");

    // Get gamification stats
    const points = await db.query.userPoints.findFirst({
      where: eq(userPoints.userId, user.id),
    });

    const metrics = await db.query.userSustainabilityMetrics.findFirst({
      where: eq(userSustainabilityMetrics.userId, user.id),
    });

    // Get expiring products for display
    const expiringProducts = userProducts
      .filter((p) => p.expiryDate)
      .sort((a, b) => {
        const aDate = new Date(a.expiryDate!);
        const bDate = new Date(b.expiryDate!);
        return aDate.getTime() - bDate.getTime();
      })
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        expiryDate: p.expiryDate,
      }));

    return json({
      products: {
        total: userProducts.length,
        expiringToday: expiringToday.length,
        expiringSoon: expiringSoon.length,
      },
      listings: {
        active: activeListings.length,
        sold: soldListings.length,
      },
      gamification: {
        points: points?.totalPoints || 0,
        streak: points?.currentStreak || 0,
        wasteReductionRate: metrics?.wasteReductionRate || 100,
        co2Saved: metrics?.estimatedCo2Saved || 0,
      },
      expiringProducts,
    });
  });

  // Get points details
  router.get("/api/v1/gamification/points", async (req) => {
    const user = getUser(req);

    const points = await db.query.userPoints.findFirst({
      where: eq(userPoints.userId, user.id),
    });

    const recentTransactions = await db.query.pointTransactions.findMany({
      where: eq(pointTransactions.userId, user.id),
      orderBy: [desc(pointTransactions.createdAt)],
      limit: 20,
    });

    return json({
      points: {
        total: points?.totalPoints || 0,
        available: points?.availablePoints || 0,
        lifetime: points?.lifetimePoints || 0,
        currentStreak: points?.currentStreak || 0,
        longestStreak: points?.longestStreak || 0,
      },
      transactions: recentTransactions,
    });
  });

  // Get badges
  router.get("/api/v1/gamification/badges", async (req) => {
    const user = getUser(req);

    // Get all badges
    const allBadges = await db.query.badges.findMany({
      orderBy: [badges.sortOrder],
    });

    // Get user's earned badges
    const earnedBadges = await db.query.userBadges.findMany({
      where: eq(userBadges.userId, user.id),
    });

    const earnedBadgeIds = new Set(earnedBadges.map((b) => b.badgeId));

    const badgesWithStatus = allBadges.map((badge) => ({
      ...badge,
      earned: earnedBadgeIds.has(badge.id),
      earnedAt: earnedBadges.find((eb) => eb.badgeId === badge.id)?.earnedAt,
    }));

    return json(badgesWithStatus);
  });

  // Get sustainability metrics
  router.get("/api/v1/gamification/metrics", async (req) => {
    const user = getUser(req);

    const metrics = await db.query.userSustainabilityMetrics.findFirst({
      where: eq(userSustainabilityMetrics.userId, user.id),
    });

    return json({
      totalItemsConsumed: metrics?.totalItemsConsumed || 0,
      totalItemsWasted: metrics?.totalItemsWasted || 0,
      totalItemsShared: metrics?.totalItemsShared || 0,
      totalItemsSold: metrics?.totalItemsSold || 0,
      estimatedMoneySaved: metrics?.estimatedMoneySaved || 0,
      estimatedCo2Saved: metrics?.estimatedCo2Saved || 0,
      wasteReductionRate: metrics?.wasteReductionRate || 100,
    });
  });

  // Get leaderboard
  router.get("/api/v1/gamification/leaderboard", async (req) => {
    const allPoints = await db.query.userPoints.findMany({
      orderBy: [desc(userPoints.totalPoints)],
      limit: 10,
    });

    // Get user info for each entry
    const leaderboard = await Promise.all(
      allPoints.map(async (points, index) => {
        const user = await db.query.users.findFirst({
          where: eq(products.userId, points.userId),
          columns: { id: true, name: true, avatarUrl: true },
        });
        return {
          rank: index + 1,
          userId: points.userId,
          name: user?.name || "Unknown",
          avatarUrl: user?.avatarUrl,
          points: points.totalPoints,
          streak: points.currentStreak,
        };
      })
    );

    return json(leaderboard);
  });
}
