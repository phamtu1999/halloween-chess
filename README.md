# 🎃 Halloween 3D Chess — Cờ Vua Ma Quái 3D

Một tựa game cờ vua 3D thời gian thực mang phong cách Gothic Dark Fantasy ma mị đêm Halloween. Game được xây dựng hoàn toàn từ các mô hình 3D Blender tùy chỉnh, kết hợp đồ họa WebGL với Three.js, engine logic Chess.js và hệ thống máy chủ mạng WebSocket (Python).

![Halloween Chess 3D Preview](https://img.shields.io/badge/Three.js-r128-orange?style=for-the-badge&logo=threedotjs)
![Python](https://img.shields.io/badge/Python-3.8+-blue?style=for-the-badge&logo=python)
![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time-green?style=for-the-badge)
![Blender](https://img.shields.io/badge/Blender-Custom%203D-EA7600?style=for-the-badge&logo=blender)

---

## 🌟 Tính năng nổi bật

### 1. 🎨 Đồ họa 3D & Hiệu ứng Ma Mị
- **Bộ quân cờ 3D độc quyền:** Được thiết kế trong Blender theo phong cách Halloween:
  - ⚪ **Phe Bạch Hồn (Ghost Bone / Ivory):** Tốt Bí Ngô Vàng, Xe Thành Trì, Mã Quỷ Đầu Đỏ, Tượng Pháp Sư Ma Quái, Hậu Phù Thủy và Vua Bí Ngô Thần Bí.
  - ⚫ **Phe Hắc Ám (Obsidian Dark):** Bộ quân hắc ám ma vương với hào quang bóng đêm.
- **Ánh sáng ma mị & Hạt ma trơi (Floating Fog & Sparks):** Hiệu ứng lửa đuốc cam/tím, đổ bóng mềm thực tế (PCF Soft Shadows) và ánh kim ACES Filmic Tone Mapping.
- **Âm thanh tổng hợp thời gian thực (Web Audio Synth):** Hiệu ứng di chuyển, ăn quân, chiếu tướng và chiến thắng chân thực không cần file audio ngoài.

### 2. 🤖 Chế độ Đấu với Máy (AI Lich King)
- **3 Cấp độ Thử thách:**
  - 🟢 **Hồn Ma Tập Sự:** Đánh ngẫu nhiên & ăn quân cơ bản, phù hợp người mới.
  - 🟡 **Kỵ Sĩ Bóng Đêm:** Tính toán 2 nước đi, tư duy chiến thuật cân bằng.
  - 🔴 **Chúa Tể Lich King:** Thuật toán Minimax sâu kết hợp bảng đánh giá vị trí quân cờ (Piece-Square Tables).
- **Chọn phe chủ động:** Người chơi có thể cầm quân **⚪ Trắng** (đi trước) hoặc **⚫ Đen** (AI đi trước, bàn cờ tự xoay góc nhìn).
- **Công cụ hỗ trợ:** Nút **💡 Gợi ý nước đi** (Hint) và **↩ Đi lại** (Undo).

### 3. 🌐 Đấu Online Thời Gian Thực (Multiplayer WebSocket)
- **Tìm trận nhanh (Quick Match):** Ghép đôi tự động giữa 2 người chơi online.
- **Tạo & Tham gia phòng kín (Custom Rooms):** 
  - Mời bạn bè với **1-click link mời** dạng `http://localhost:8080/?room=HLW-XXXX`.
  - Hộp thoại nhập mã phòng kính mờ Gothic chuyên nghiệp (hỗ trợ phím Enter / Esc).
- **Đồng hồ thi đấu (Chess Clocks):** Tùy chọn 3 phút (Blitz), 5 phút (Rapid) hoặc 10 phút.
- **Trò chuyện & Cảm xúc 3D:** Khung chat trực tiếp và thả cảm xúc 🎃 👻 💀 🔥 bay lơ lửng trên không gian 3D.
- **Cơ chế thi đấu chuẩn:** Xin hòa (Offer Draw), Đầu hàng (Resign), Yêu cầu tái đấu (Rematch).

### 4. 📱 Giao diện Gothic Glassmorphism Tối Ưu
- Hệ thống **Toast Notification** nổi thời thượng thay thế hoàn toàn dialog trình duyệt.
- Hỗ trợ đổi 6 góc quay camera nhanh: *Phối cảnh, Từ trên xuống, Góc nhìn Trắng, Góc nhìn Đen, Cận cảnh, Xoay tự do*.
- Hiển thị lịch sử nước đi dạng PGN và Nghĩa địa quân cờ đã bị tiêu diệt.

---

## 📁 Cấu trúc thư mục dự án

```text
halloween chess/
├── 📁 blender source/             # File thiết kế 3D gốc từ Blender (.blend)
│   ├── halloween_chess.blend
│   └── halloween_chess.blend1
├── 📁 models 3d glb/              # Xuất bản mô hình 3D định dạng GLB
│   ├── board.glb                  # Bàn cờ 3D
│   ├── pawn_w.glb / pawn_b.glb    # Tốt Trắng / Đen
│   ├── rook_w.glb / rook_b.glb    # Xe Trắng / Đen
│   ├── knight_w.glb / knight_b.glb# Mã Trắng / Đen
│   ├── bishop_w.glb / bishop_b.glb# Tượng Trắng / Đen
│   ├── queen_w.glb / queen_b.glb  # Hậu Trắng / Đen
│   ├── king_w.glb / king_b.glb    # Vua Trắng / Đen
│   └── halloween_chess_full.glb   # File tổng hợp toàn bộ bàn cờ
├── index.html                     # Giao diện UI/UX Gothic Dark Glassmorphism
├── game.js                        # Engine WebGL Three.js, Chess.js, WebSocket & AI
├── server.py                      # Server Python HTTP (8080) + WebSocket (8081)
├── start_game.sh                  # Script khởi chạy 1 chạm cho Linux / Mac
├── .gitignore
└── README.md
```

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### Yêu cầu môi trường:
- **Python 3.8+**
- Thư viện Python: `websockets`

### 1. Cài đặt thư viện:
```bash
pip install websockets
```

### 2. Khởi chạy:
#### Cách 1: Chạy bằng script 1-chạm (Linux / macOS):
```bash
chmod +x start_game.sh
./start_game.sh
```

#### Cách 2: Chạy trực tiếp bằng Python:
```bash
python3 server.py
```

Sau đó mở trình duyệt truy cập: **`http://localhost:8080`**

---

## 🎮 Hướng dẫn điều khiển
- **Chuột trái:** Nhấp chọn quân cờ và click ô đích có dấu tròn phát sáng để di chuyển.
- **Giữ chuột trái & kéo:** Xoay tự do góc nhìn 3D (OrbitControls).
- **Cuộn chuột:** Thu phóng phóng to / thu nhỏ.
- **Giữ chuột phải & kéo:** Di chuyển vùng nhìn (Pan).

---

## 📜 Giấy phép & Tác giả
- Phát triển bởi **[phamtu1999](https://github.com/phamtu1999)**
- Thiết kế 3D & Lập trình WebGL Three.js / WebSocket.
- Giấy phép: MIT License.
