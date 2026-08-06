import { z } from "zod";

const price = z.number().finite().min(0).max(999_999_999);

export const modelPriceSchema = z.object({
  model: z.string().trim().min(1).max(256),
  inputPricePerMillion: price,
  cachedInputPricePerMillion: price.nullable().optional().default(null),
  outputPricePerMillion: price,
});

export const updateModelPriceSchema = modelPriceSchema.omit({ model: true });

export const recalculationSchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    message: "from and to must both be provided for a date-range recalculation",
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      Date.parse(value.from) < Date.parse(value.to),
    { message: "from must be before to" },
  );
