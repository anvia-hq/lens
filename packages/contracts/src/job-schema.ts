import { z } from "zod";

export const jobSchemaVersion = z.literal(1).default(1);
