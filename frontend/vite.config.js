import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:5000";
const configDirectory = path.dirname(fileURLToPath(import.meta.url));

function resolveCertificatePath(configuredPath, fallbackPath) {
  const certificatePath = configuredPath || fallbackPath;
  return path.isAbsolute(certificatePath)
    ? certificatePath
    : path.resolve(configDirectory, certificatePath);
}

function getHttpsOptions() {
  if (process.env.VITE_DEV_HTTPS !== "true") {
    return undefined;
  }

  const certPath = resolveCertificatePath(
    process.env.VITE_HTTPS_CERT_PATH,
    ".cert/parcel-nexus-local.pem"
  );
  const keyPath = resolveCertificatePath(
    process.env.VITE_HTTPS_KEY_PATH,
    ".cert/parcel-nexus-local-key.pem"
  );

  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(
      "Local HTTPS certificates are missing. Run frontend/scripts/setup-local-https.sh first."
    );
  }

  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath)
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: getHttpsOptions(),
    port: Number(process.env.FRONTEND_PORT || 5173),
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true
      },
      "/uploads": {
        target: backendTarget,
        changeOrigin: true
      },
      "/socket.io": {
        target: backendTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
