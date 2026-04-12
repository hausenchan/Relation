# 部署指南

## 方案1：单服务器部署（推荐）

### 本地构建后上传

1. **本地构建**
```bash
./deploy.sh
```

2. **上传到服务器**
```bash
# 将整个项目打包上传（排除 node_modules）
tar --exclude='node_modules' --exclude='.git' -czf relation-manager.tar.gz .
scp relation-manager.tar.gz user@your-server:/path/to/app/
```

3. **服务器端操作**
```bash
# 解压
cd /path/to/app
tar -xzf relation-manager.tar.gz

# 安装依赖
npm install --production
cd client && npm install && npm run build && cd ..

# 启动服务
NODE_ENV=production PORT=3001 node server/index.js
```

### 使用 PM2 守护进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start server/index.js --name relation-manager --env production

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs relation-manager

# 重启
pm2 restart relation-manager
```

### Nginx 反向代理（可选）

如果需要使用域名和 HTTPS：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 方案2：Docker 部署

创建 `Dockerfile`：
```dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
COPY client/package*.json ./client/

# 安装依赖
RUN npm install --production
RUN cd client && npm install

# 复制源码
COPY . .

# 构建前端
RUN cd client && npm run build

# 暴露端口
EXPOSE 3001

# 启动
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
```

构建和运行：
```bash
docker build -t relation-manager .
docker run -d -p 3001:3001 -v $(pwd)/server/data.db:/app/server/data.db --name relation-manager relation-manager
```

## 方案3：云平台部署

### Vercel / Railway / Render

这些平台支持自动部署，只需：
1. 将代码推送到 GitHub
2. 连接仓库到平台
3. 配置构建命令和启动命令

**注意**：SQLite 数据库在这些平台上会丢失，需要改用云数据库（PostgreSQL/MySQL）。

## 数据备份

定期备份数据库：
```bash
# 手动备份
cp server/data.db server/data.db.backup.$(date +%Y%m%d)

# 定时备份（crontab）
0 2 * * * cp /path/to/app/server/data.db /path/to/backup/data.db.$(date +\%Y\%m\%d)
```

## 环境变量

可选配置：
```bash
export NODE_ENV=production
export PORT=3001
```

## 访问应用

部署后访问：`http://your-server-ip:3001`

如果配置了 Nginx 和域名：`https://your-domain.com`
