import { user } from "@lens/db";
import { Hono } from "hono";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { authRouteMethods } from "./schema.js";

export const createAuthRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().on(authRouteMethods, "/*", (c) => deps.auth.handler(c.req.raw));

export const createSetupRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/", async (c) => {
    const [account] = await deps.postgres.db.select({ id: user.id }).from(user).limit(1);
    return c.json({ initialized: account !== undefined });
  });
