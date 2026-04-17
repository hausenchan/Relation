# ================= builder =================
FROM registry-vpc.cn-shenzhen.aliyuncs.com/md-devops/node:20 AS builder

WORKDIR /app

# ------------------------
# 1.先拷贝依赖文件，利用 Docker 缓存
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm install --omit=dev

# client 依赖单独缓存
WORKDIR /app/client
COPY client/package*.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm install

# ------------------------
# 2.拷贝源码（不影响依赖缓存）
WORKDIR /app
COPY server ./server
COPY client/src ./client/src
COPY client/public ./client/public

# ------------------------
# 3.构建前端
RUN cd client && npm run build

# ================= runner =================
FROM registry-vpc.cn-shenzhen.aliyuncs.com/md-devops/node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# ------------------------
# 4.拷贝生产所需文件
COPY package*.json ./
COPY server ./server

# ------------------------
# 5.拷贝依赖和前端构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/build ./client/build

# ------------------------
# 6.创建上传目录并挂载
RUN mkdir -p /app/server/uploads
VOLUME ["/app/server/uploads"]

EXPOSE 3001

# ------------------------
# 7.启动服务
CMD ["node", "server/index.js"]