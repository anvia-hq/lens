import { Hono } from "hono";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { authRouteMethods } from "./schema.js";

export const createAuthRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().on(authRouteMethods, "/*", (c) => deps.auth.handler(c.req.raw));
