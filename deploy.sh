#!/bin/bash
# 生产环境部署脚本

echo "开始构建生产版本..."

# 1. 构建前端
echo "1. 构建前端..."
cd client
npm run build
cd ..

# 2. 安装生产依赖
echo "2. 检查后端依赖..."
npm install --production

echo ""
echo "✅ 构建完成！"
echo ""
echo "启动生产服务器："
echo "  NODE_ENV=production node server/index.js"
echo ""
echo "或使用 PM2 守护进程："
echo "  pm2 start server/index.js --name relation-manager -i 1 --env production"
