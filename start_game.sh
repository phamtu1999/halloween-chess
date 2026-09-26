#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🎃 ==================================================="
echo "   HALLOWEEN 3D CHESS — MULTIPLAYER SERVER (WEBSOCKET)"
echo "==================================================="
echo "📂 Thư mục: $DIR"
echo "🌐 Đang mở game tại: http://localhost:8080"
echo "⚡ WebSocket Server tại: ws://localhost:8081"
echo "⚡ Nhấn Ctrl+C trong terminal để dừng server"
echo "==================================================="

# Tự động mở trình duyệt sau 1s
(sleep 1 && (xdg-open "http://localhost:8080" 2>/dev/null || sensible-browser "http://localhost:8080" 2>/dev/null || x-www-browser "http://localhost:8080" 2>/dev/null || true)) &

# Chạy server thống nhất
cd "$DIR" && python3 server.py
