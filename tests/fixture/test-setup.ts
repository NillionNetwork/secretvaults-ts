import { config } from "dotenv";

declare global {
  namespace NodeJS {
    // values from .env.test
    interface ProcessEnv {
      APP_MONGODB_URI: string;
      APP_NILDB_NODES: string;
    }
  }
}

config({ path: ".env.test" });
