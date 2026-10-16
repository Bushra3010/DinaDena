import type { NextConfig } from "next";

// The app is client-rendered against Supabase (RLS + database functions), so it can be
// wrapped by Capacitor for Android without a Node server in the loop.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
