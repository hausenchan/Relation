FROM node:20

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

# 复制依赖文件
COPY package*.json ./
COPY client/package*.json ./client/

# 安装依赖
RUN npm install --omit=dev
RUN cd client && npm install

# 复制源码
COPY . .

# 构建前端
RUN cd client && npm run build

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
