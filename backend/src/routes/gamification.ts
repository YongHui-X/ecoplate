import { Router, json } from "../utils/router";
import { db } from "../index";
import * as schema from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getUser } from "../middleware/auth";

export function registerGamificationRoutes(router: Router) {
    // ================================
    // GET /api/v1/gamification/points
    // ================================
    router.get("/api/v1/gamification/points", async (req) => {
        const user = getUser(req);

        const points = await db.query.userPoints.findFirst({
            where: eq(schema.userPoints.userId, user.id),
        });

        // const recentTransactions = await db.query.pointTransactions.findMany({
        //     where: eq(pointTransactions.userId, user.id),
        //     orderBy: [desc(pointTransactions.createdAt)],
        //     limit: 20,
        // });

        return json({
            points: {
                total: points?.totalPoints || 0,
                // available: points?.availablePoints || 0,
                // lifetime: points?.lifetimePoints || 0,
                // currentStreak: points?.currentStreak || 0,
                // longestStreak: points?.longestStreak || 0,
            },
        });
    });

    // ==========================================
    // GET /api/v1/gamification/points/details
    // ==========================================
    router.get("/api/v1/gamification/points/details", async (req) => {
        const user = getUser(req);
        const url = new URL(req.url);
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const offset = (page - 1) * limit;

        const points = await db.query.userPoints.findFirst({
            where: eq(schema.userPoints.userId, user.id),
        });

        // const allTransactions = await db.query.pointTransactions.findMany({
        //     where: eq(pointTransactions.userId, user.id),
        //     orderBy: [desc(pointTransactions.createdAt)],
        // });

        // Monthly aggregation (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyMap = new Map<string, { earned: number; redeemed: number }>();

        // allTransactions.forEach((tx) => {
        //     const txDate = new Date(tx.createdAt);
        //     if (txDate >= sixMonthsAgo) {
        //         const key = `${txDate.getFullYear()}-${String(
        //             txDate.getMonth() + 1,
        //         ).padStart(2, "0")}`;

        //         if (!monthlyMap.has(key)) {
        //             monthlyMap.set(key, { earned: 0, redeemed: 0 });
        //         }

        //         const entry = monthlyMap.get(key)!;
        //         if (tx.amount > 0) entry.earned += tx.amount;
        //         else entry.redeemed += Math.abs(tx.amount);
        //     }
        // });

        const monthlyPoints = Array.from(monthlyMap.entries())
            .map(([month, data]) => ({ month, ...data }))
            .sort((a, b) => a.month.localeCompare(b.month));

        // Breakdown by action
        const breakdown: Record<string, number> = {};
        // allTransactions
        //     .filter((tx) => tx.amount > 0)
        //     .forEach((tx) => {
        //         const action = tx.action || "other";
        //         breakdown[action] = (breakdown[action] || 0) + tx.amount;
        //     });

        // const paginated = allTransactions.slice(offset, offset + limit);

        return json({
            points: {
                total: points?.totalPoints || 0,
                // available: points?.availablePoints || 0,
                // lifetime: points?.lifetimePoints || 0,
                // currentStreak: points?.currentStreak || 0,
                // longestStreak: points?.longestStreak || 0,
            },
            monthlyPoints,
            breakdown: { byAction: breakdown },
            transactions: {
                // items: paginated,
                // total: allTransactions.length,
                page,
                // totalPages: Math.ceil(allTransactions.length / limit),
            },
        });
    });

    // ================================
    // GET /api/v1/gamification/badges
    // // ================================
    // router.get("/api/v1/gamification/badges", async (req) => {
    //     const user = getUser(req);

    //     const earned = await db.query.userBadges.findMany({
    //         where: eq(schema.userBadges.userId, user.id),
    //     });

    //     const earnedIds = new Set(earned.map((b) => b.badgeId));

    //     return json(
    //         // allBadges.map((badge) => ({
    //         //     ...badge,
    //         //     earned: earnedIds.has(badge.id),
    //         //     earnedAt: earned.find((e) => e.badgeId === badge.id)?.earnedAt,
    //         // })),
    //     );
    // });

    // ================================
    // GET /api/v1/gamification/metrics
    // ================================
    router.get("/api/v1/gamification/metrics", async (req) => {
        const user = getUser(req);

        const metrics = await db.query.productSustainabilityMetrics.findFirst({
            where: eq(schema.productSustainabilityMetrics.userId, user.id),
        });

        return json({
            // totalItemsConsumed: metrics?.totalItemsConsumed || 0,
            // totalItemsWasted: metrics?.totalItemsWasted || 0,
            // totalItemsShared: metrics?.totalItemsShared || 0,
            // totalItemsSold: metrics?.totalItemsSold || 0,
            // estimatedMoneySaved: metrics?.estimatedMoneySaved || 0,
            // estimatedCo2Saved: metrics?.estimatedCo2Saved || 0,
            // wasteReductionRate: metrics?.wasteReductionRate || 100,
        });
    });

    // ================================
    // GET /api/v1/gamification/dashboard
    // ================================
    router.get("/api/v1/gamification/dashboard", async (req) => {
        const user = getUser(req);

        // const userProducts = await db.query.products.findMany({
        //     where: and(eq(schema.products.userId, user.id), eq(schema.products.isConsumed, false)),
        // });

        const points = await db.query.userPoints.findFirst({
            where: eq(schema.userPoints.userId, user.id),
        });

        const metrics = await db.query.productSustainabilityMetrics.findFirst({
            where: eq(schema.productSustainabilityMetrics.userId, user.id),
        });

        return json({
            // products: {
            //     total: userProducts.length,
            // },
            gamification: {
                points: points?.totalPoints || 0,
                streak: points?.currentStreak || 0,
                // wasteReductionRate: metrics?.wasteReductionRate || 100,
                // co2Saved: metrics?.estimatedCo2Saved || 0,
            },
        });
    });
}
