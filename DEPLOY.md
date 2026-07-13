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
docker run -d \
  -p 3001:3001 \
  -p 8888:8888 \
  -v $(pwd)/server/data.db:/app/server/data.db \
  --name relation-manager \
  relation-manager
```

如果要使用“网络抓包”，除了容器映射 `-p 8888:8888`，还需要在云服务器安全组、防火墙或宝塔面板里放行 TCP `8888`。手机浏览器能打开 `http://你的域名或服务器IP:8888/__network_capture_ping` 后，手机 Wi-Fi 代理再填同一个主机和端口。

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
export NETWORK_CAPTURE_PORT=8888
export ALIYUN_OSS_BUCKET=mid-relation
export ALIYUN_OSS_ENDPOINT=oss-cn-shenzhen.aliyuncs.com
export ALIYUN_OSS_ACCESS_KEY_ID=你的OSS AccessKey ID
export ALIYUN_OSS_ACCESS_KEY_SECRET=你的OSS AccessKey Secret
```

配置 OSS 后，新上传的图片和附件会持久化到 OSS，仍按业务目录写入，例如 `attachments/yyyy/MM/dd/`、`documents/yyyy/MM/dd/`、`company-subjects/yyyy/MM/dd/`。

历史 `server/uploads` 文件可整体复制到 OSS 的 `uploads/` 目录。数据库里的旧路径不需要立刻修改，系统读取旧路径时会优先访问 `oss://mid-relation/uploads/<旧文件名>`，OSS 不存在时再兜底读取本地 `server/uploads/<旧文件名>`。

```bash
cd /path/to/relation/server/uploads
ossutil cp -r . oss://mid-relation/uploads/
```

注意复制的是 `server/uploads` 目录里的文件内容，目标应为 `uploads/<旧文件名>`，不要变成 `uploads/server/uploads/<旧文件名>`。

### MySQL 数据库

默认仍使用本地 SQLite。切换到 MySQL 时配置：
```bash
export DB_CLIENT=mysql
export MYSQL_HOST=midongad.rwlb.rds.aliyuncs.com
export MYSQL_PORT=3306
export MYSQL_DATABASE=relation
export MYSQL_USER=relation
export MYSQL_PASSWORD=你的MySQL密码
```

正式服应用连接 MySQL 使用内网地址 `midongad.rwlb.rds.aliyuncs.com:3306`。
本地导入/核对数据时使用公网地址 `120.79.151.103:33306`。

将本地 `data.db` 导入 MySQL：
```bash
npm run db:migrate:mysql -- --sqlite data.db --reset
```

`--reset` 会先清空目标库已有表，请只在确认目标库可覆盖时使用。

## 访问应用

部署后访问：`http://your-server-ip:3001`

如果配置了 Nginx 和域名：`https://your-domain.com`
