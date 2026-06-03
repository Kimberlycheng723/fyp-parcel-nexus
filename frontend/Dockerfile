FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace frontend --include-workspace-root

COPY frontend ./frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "frontend"]
