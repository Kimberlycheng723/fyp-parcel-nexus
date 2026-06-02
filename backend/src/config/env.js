export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5001),
  databaseUrl: process.env.DATABASE_URL || ""
};
