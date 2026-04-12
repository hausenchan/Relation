#!/bin/bash
echo "启动关系管理系统..."
echo ""
echo "后端: http://localhost:3001"
echo "前端: http://localhost:3000"
echo ""
# 启动后端
node server/index.js &
SERVER_PID=$!
echo "后端进程 PID: $SERVER_PID"

# 启动前端
cd client && npm start &
CLIENT_PID=$!
echo "前端进程 PID: $CLIENT_PID"

echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待并处理退出
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; echo '已停止所有服务'; exit 0" INT TERM
wait
