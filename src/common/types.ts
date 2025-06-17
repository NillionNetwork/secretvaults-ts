import { z } from "zod/v4";

export const Uuid = z.uuidv4().brand<"Uuid">();
export type Uuid = z.infer<typeof Uuid>;
