FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "src/index.js"]
