import { Router, json, error, parseBody } from "../utils/router";
import { db } from "../index";
import { users, refreshTokens, userPoints, userSustainabilityMetrics } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  type JWTPayload,
} from "../middleware/auth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export function registerAuthRoutes(router: Router) {
  // Register
  router.post("/api/v1/auth/register", async (req) => {
    try {
      const body = await parseBody(req);
      const data = registerSchema.parse(body);

      // Check if user exists
      const existing = await db.query.users.findFirst({
        where: eq(users.email, data.email),
      });

      if (existing) {
        return error("Email already registered", 400);
      }

      // Hash password and create user
      const passwordHash = await hashPassword(data.password);

      const [user] = await db
        .insert(users)
        .values({
          email: data.email,
          passwordHash,
          name: data.name,
        })
        .returning();

      // Initialize user points and metrics
      await db.insert(userPoints).values({ userId: user.id });
      await db.insert(userSustainabilityMetrics).values({ userId: user.id });

      // Generate tokens
      const payload: JWTPayload = {
        sub: user.id.toString(),
        email: user.email,
        name: user.name,
      };

      const accessToken = await generateAccessToken(payload);
      const refreshToken = await generateRefreshToken(payload);

      // Store refresh token
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(refreshTokens).values({
        userId: user.id,
        token: refreshToken,
        expiresAt,
      });

      return json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        accessToken,
        refreshToken,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return error(e.errors[0].message, 400);
      }
      console.error("Register error:", e);
      return error("Registration failed", 500);
    }
  });

  // Login
  router.post("/api/v1/auth/login", async (req) => {
    try {
      const body = await parseBody(req);
      const data = loginSchema.parse(body);

      // Find user
      const user = await db.query.users.findFirst({
        where: eq(users.email, data.email),
      });

      if (!user) {
        return error("Invalid email or password", 401);
      }

      // Verify password
      const valid = await verifyPassword(data.password, user.passwordHash);
      if (!valid) {
        return error("Invalid email or password", 401);
      }

      // Generate tokens
      const payload: JWTPayload = {
        sub: user.id.toString(),
        email: user.email,
        name: user.name,
      };

      const accessToken = await generateAccessToken(payload);
      const refreshToken = await generateRefreshToken(payload);

      // Store refresh token
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(refreshTokens).values({
        userId: user.id,
        token: refreshToken,
        expiresAt,
      });

      return json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        accessToken,
        refreshToken,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return error(e.errors[0].message, 400);
      }
      console.error("Login error:", e);
      return error("Login failed", 500);
    }
  });

  // Refresh token
  router.post("/api/v1/auth/refresh", async (req) => {
    try {
      const body = await parseBody(req);
      const data = refreshSchema.parse(body);

      // Verify the refresh token
      const payload = await verifyToken(data.refreshToken);
      if (!payload) {
        return error("Invalid refresh token", 401);
      }

      // Check if token exists in database
      const storedToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, data.refreshToken),
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        return error("Refresh token expired or invalid", 401);
      }

      // Get user
      const user = await db.query.users.findFirst({
        where: eq(users.id, storedToken.userId),
      });

      if (!user) {
        return error("User not found", 401);
      }

      // Generate new tokens
      const newPayload: JWTPayload = {
        sub: user.id.toString(),
        email: user.email,
        name: user.name,
      };

      const accessToken = await generateAccessToken(newPayload);
      const refreshToken = await generateRefreshToken(newPayload);

      // Delete old token and store new one
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(refreshTokens).values({
        userId: user.id,
        token: refreshToken,
        expiresAt,
      });

      return json({
        accessToken,
        refreshToken,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return error(e.errors[0].message, 400);
      }
      console.error("Refresh error:", e);
      return error("Token refresh failed", 500);
    }
  });

  // Logout
  router.post("/api/v1/auth/logout", async (req) => {
    try {
      const body = await parseBody(req);
      const data = refreshSchema.parse(body);

      // Delete the refresh token
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.token, data.refreshToken));

      return json({ message: "Logged out successfully" });
    } catch (e) {
      return json({ message: "Logged out" });
    }
  });
}
