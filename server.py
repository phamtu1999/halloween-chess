#!/usr/bin/env python3
"""
Halloween 3D Chess — Unified HTTP & WebSocket Multiplayer Server (Hardened & Authoritative)
"""

import asyncio
import json
import os
import secrets
import string
import time
from collections import defaultdict
from http.server import SimpleHTTPRequestHandler, HTTPServer
import threading
import chess
import websockets

HTTP_PORT = 8080
WS_PORT = 8081
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

ALLOWED_ORIGINS = {
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://phamtu1999.github.io",
}

def is_origin_allowed(origin: str) -> bool:
    if not origin:
        return True # Allow direct tools / dev scripts without Origin header
    origin_clean = origin.rstrip("/").lower()
    if origin_clean in ALLOWED_ORIGINS:
        return True
    if origin_clean.startswith("http://localhost:") or origin_clean.startswith("http://127.0.0.1:"):
        return True
    return False

# ── Cryptographic Room ID Generation ──────────────────────────────────────────
ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

def generate_room_id(length=6):
    return "HLW-" + "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(length))

# ── Game Rooms & State ────────────────────────────────────────────────────────
rooms = {}       # room_id -> GameRoom instance
ws_to_room = {}  # websocket -> GameRoom instance (P0-5: bidirectional mapping)
quick_queue = [] # list of (websocket, time_control, player_name)

class GameRoom:
    def __init__(self, room_id, time_control=300, host_color="random"):
        self.room_id = room_id
        self.time_control = int(time_control) # in seconds (0 = unlimited)
        self.white_time = float(self.time_control)
        self.black_time = float(self.time_control)
        self.status = "waiting" # waiting, playing, ended
        
        self.board = chess.Board()
        self.host_pref_color = host_color
        self.white_ws = None
        self.black_ws = None
        self.white_name = "Player 1"
        self.black_name = "Player 2"
        
        self.last_tick = None
        self.draw_offered_by = None
        self.rematch_votes = set()
        self.moves = []

    @property
    def turn(self):
        return "w" if self.board.turn == chess.WHITE else "b"

    def assign_player(self, ws, name="Người chơi"):
        name = str(name)[:25] if name else "Người chơi"
        if not self.white_ws and not self.black_ws:
            # First player (Host)
            if self.host_pref_color == "w":
                self.white_ws = ws
                self.white_name = name
                return "w"
            elif self.host_pref_color == "b":
                self.black_ws = ws
                self.black_name = name
                return "b"
            else: # Random
                color = secrets.choice(["w", "b"])
                if color == "w":
                    self.white_ws = ws
                    self.white_name = name
                else:
                    self.black_ws = ws
                    self.black_name = name
                return color
        else:
            # Second player (Guest)
            if not self.white_ws:
                self.white_ws = ws
                self.white_name = name
                return "w"
            elif not self.black_ws:
                self.black_ws = ws
                self.black_name = name
                return "b"
        return None

    def get_color(self, ws):
        if ws == self.white_ws: return "w"
        if ws == self.black_ws: return "b"
        return None

    def get_opponent(self, ws):
        if ws == self.white_ws: return self.black_ws
        if ws == self.black_ws: return self.white_ws
        return None

    async def broadcast(self, payload):
        msg = json.dumps(payload)
        for ws in [self.white_ws, self.black_ws]:
            if ws and not ws.closed:
                try:
                    await ws.send(msg)
                except Exception:
                    pass

    def start_game(self):
        self.board.reset()
        self.status = "playing"
        self.white_time = float(self.time_control)
        self.black_time = float(self.time_control)
        self.last_tick = time.monotonic()
        self.moves = []
        self.draw_offered_by = None
        self.rematch_votes.clear()

    def update_clock(self):
        if self.status != "playing" or self.time_control <= 0:
            return None
        now = time.monotonic()
        elapsed = now - (self.last_tick or now)
        self.last_tick = now

        if self.board.turn == chess.WHITE:
            self.white_time = max(0.0, self.white_time - elapsed)
            if self.white_time <= 0:
                self.status = "ended"
                return "b" # Black wins on time
        else:
            self.black_time = max(0.0, self.black_time - elapsed)
            if self.black_time <= 0:
                self.status = "ended"
                return "w" # White wins on time
        return None

# ── Rate Limiter ─────────────────────────────────────────────────────────────
ws_message_counts = defaultdict(list)

def is_rate_limited(ws, max_per_second=10):
    now = time.monotonic()
    timestamps = ws_message_counts[id(ws)]
    ws_message_counts[id(ws)] = [t for t in timestamps if now - t < 1.0]
    if len(ws_message_counts[id(ws)]) >= max_per_second:
        return True
    ws_message_counts[id(ws)].append(now)
    return False

# ── WebSocket Handler ─────────────────────────────────────────────────────────
async def ws_handler(websocket, path=None):
    # P1: Enforce ALLOWED_ORIGINS validation
    origin = getattr(websocket, "request_headers", {}).get("Origin", "")
    if origin and not is_origin_allowed(origin):
        await websocket.close(1008, "Origin not allowed")
        return

    try:
        async for raw_msg in websocket:
            if is_rate_limited(websocket):
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Bạn gửi tin nhắn quá nhanh. Vui lòng chờ giây lát!"
                }))
                continue

            try:
                data = json.loads(raw_msg)
            except Exception:
                continue

            if not isinstance(data, dict):
                continue

            action = data.get("action")
            current_room = ws_to_room.get(websocket)

            # 1. CREATE CUSTOM ROOM
            if action == "create_room":
                if current_room:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Bạn đã ở trong một phòng!"
                    }))
                    continue
                try:
                    time_ctl = int(data.get("time_control", 300))
                    if time_ctl not in [0, 60, 180, 300, 600, 900, 1800]:
                        time_ctl = 300
                except (ValueError, TypeError):
                    time_ctl = 300

                pref_col = data.get("color", "random")
                if pref_col not in ["w", "b", "random"]:
                    pref_col = "random"
                name = str(data.get("name", "Chủ phòng"))[:25]

                room_id = generate_room_id()
                while room_id in rooms:
                    room_id = generate_room_id()

                room = GameRoom(room_id, time_control=time_ctl, host_color=pref_col)
                player_color = room.assign_player(websocket, name)
                rooms[room_id] = room
                ws_to_room[websocket] = room

                await websocket.send(json.dumps({
                    "type": "room_created",
                    "room_id": room_id,
                    "color": player_color,
                    "time_control": time_ctl,
                    "status": "waiting"
                }))

            # 2. JOIN ROOM
            elif action == "join_room":
                room_id = str(data.get("room_id", "")).strip().upper()
                name = str(data.get("name", "Khách"))[:25]

                if room_id not in rooms:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Không tìm thấy phòng cờ này!"
                    }))
                    continue

                room = rooms[room_id]
                if room.white_ws and room.black_ws:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Phòng đã đủ 2 người chơi!"
                    }))
                    continue

                player_color = room.assign_player(websocket, name)
                ws_to_room[websocket] = room
                room.start_game()

                # Notify both players
                await room.broadcast({
                    "type": "game_start",
                    "room_id": room_id,
                    "white_name": room.white_name,
                    "black_name": room.black_name,
                    "white_time": room.white_time,
                    "black_time": room.black_time,
                    "time_control": room.time_control,
                    "turn": "w"
                })

            # 3. QUICK MATCH (GHÉP TRẬN NHANH - P0-5 FIX)
            elif action == "quick_match":
                try:
                    time_ctl = int(data.get("time_control", 300))
                    if time_ctl not in [0, 60, 180, 300, 600, 900, 1800]:
                        time_ctl = 300
                except (ValueError, TypeError):
                    time_ctl = 300
                name = str(data.get("name", "Người chơi"))[:25]

                # Clean previous entries of this socket from queue
                for q in list(quick_queue):
                    if q[0] == websocket:
                        quick_queue.remove(q)

                # Check if someone else is waiting
                matched = None
                for item in list(quick_queue):
                    other_ws, other_time, other_name = item
                    if other_ws != websocket and not other_ws.closed and other_time == time_ctl:
                        matched = item
                        quick_queue.remove(item)
                        break

                if matched:
                    other_ws, _, other_name = matched
                    room_id = generate_room_id()
                    room = GameRoom(room_id, time_control=time_ctl, host_color="random")
                    
                    room.assign_player(other_ws, other_name)
                    room.assign_player(websocket, name)
                    rooms[room_id] = room
                    
                    # P0-5: Map BOTH sockets to the room instance
                    ws_to_room[other_ws] = room
                    ws_to_room[websocket] = room
                    room.start_game()

                    await room.broadcast({
                        "type": "game_start",
                        "room_id": room_id,
                        "white_name": room.white_name,
                        "black_name": room.black_name,
                        "white_time": room.white_time,
                        "black_time": room.black_time,
                        "time_control": room.time_control,
                        "turn": "w"
                    })
                else:
                    quick_queue.append((websocket, time_ctl, name))
                    await websocket.send(json.dumps({
                        "type": "queue_waiting",
                        "message": "Đang tìm kiếm đối thủ xứng tầm..."
                    }))

            # 4. MOVE PIECE (P0-6: update_clock BEFORE MOVE, AUTHORITATIVE VALIDATION)
            elif action == "move":
                if not current_room or current_room.status != "playing":
                    continue

                # P0-6: Update clock before processing move
                timeout_winner = current_room.update_clock()
                if timeout_winner:
                    await current_room.broadcast({
                        "type": "game_over",
                        "reason": "timeout",
                        "winner": timeout_winner,
                        "white_time": current_room.white_time,
                        "black_time": current_room.black_time
                    })
                    continue

                player_col = current_room.get_color(websocket)
                if player_col != current_room.turn:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Chưa tới lượt của bạn!"
                    }))
                    continue

                mv_from = str(data.get("from", "")).lower().strip()
                mv_to = str(data.get("to", "")).lower().strip()
                promo = str(data.get("promo", "q")).lower().strip()
                if promo not in ["q", "r", "b", "n"]:
                    promo = "q"

                uci_str = f"{mv_from}{mv_to}"
                try:
                    move = chess.Move.from_uci(f"{uci_str}{promo}")
                    if move not in current_room.board.legal_moves:
                        move = chess.Move.from_uci(uci_str)
                except Exception:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Định dạng nước cờ không hợp lệ!"
                    }))
                    continue

                if move not in current_room.board.legal_moves:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Nước cờ không hợp lệ theo luật cờ vua!"
                    }))
                    continue

                # Execute authoritative move
                current_room.board.push(move)
                current_room.moves.append({"from": mv_from, "to": mv_to, "promo": promo})
                current_room.draw_offered_by = None

                # Broadcast move to both players
                await current_room.broadcast({
                    "type": "move_made",
                    "from": mv_from,
                    "to": mv_to,
                    "promo": promo,
                    "turn": current_room.turn,
                    "white_time": current_room.white_time,
                    "black_time": current_room.black_time
                })

                # Check game termination conditions
                if current_room.board.is_checkmate():
                    current_room.status = "ended"
                    winner = player_col
                    await current_room.broadcast({
                        "type": "game_over",
                        "reason": "checkmate",
                        "winner": winner
                    })
                elif current_room.board.is_stalemate() or current_room.board.is_insufficient_material() or current_room.board.is_seventyfive_moves() or current_room.board.is_fivefold_repetition():
                    current_room.status = "ended"
                    await current_room.broadcast({
                        "type": "game_over",
                        "reason": "draw",
                        "winner": None
                    })

            # 5. RESIGN (ĐẦU HÀNG)
            elif action == "resign":
                if not current_room or current_room.status != "playing":
                    continue
                color = current_room.get_color(websocket)
                winner = "b" if color == "w" else "w"
                current_room.status = "ended"

                await current_room.broadcast({
                    "type": "game_over",
                    "reason": "resigned",
                    "resigned_by": color,
                    "winner": winner
                })

            # 6. OFFER DRAW (XIN HÒA)
            elif action == "offer_draw":
                if not current_room or current_room.status != "playing":
                    continue
                color = current_room.get_color(websocket)
                current_room.draw_offered_by = color
                opp_ws = current_room.get_opponent(websocket)
                if opp_ws:
                    await opp_ws.send(json.dumps({
                        "type": "draw_offered",
                        "from_color": color
                    }))

            # 7. DRAW RESPONSE (CHẤP NHẬN / TỪ CHỐI HÒA)
            elif action == "draw_response":
                if not current_room or current_room.status != "playing":
                    continue
                accepted = bool(data.get("accept", False))
                if accepted and current_room.draw_offered_by and current_room.draw_offered_by != current_room.get_color(websocket):
                    current_room.status = "ended"
                    await current_room.broadcast({
                        "type": "game_over",
                        "reason": "draw_agreed",
                        "winner": None
                    })
                else:
                    opp_ws = current_room.get_opponent(websocket)
                    if opp_ws:
                        await opp_ws.send(json.dumps({
                            "type": "draw_declined"
                        }))
                current_room.draw_offered_by = None

            # 8. EMOTE / REACTION (RATE LIMITED)
            elif action == "emote":
                if not current_room:
                    continue
                allowed_icons = {"🎃", "👻", "💀", "🧙", "🦇", "🕷️", "🔥", "👏"}
                icon = str(data.get("icon", "🎃"))
                if icon in allowed_icons:
                    color = current_room.get_color(websocket)
                    await current_room.broadcast({
                        "type": "emote_sent",
                        "color": color,
                        "icon": icon
                    })

            # 9. CHAT MESSAGE (SANITIZED & BOUNDED)
            elif action == "chat":
                if not current_room:
                    continue
                text = str(data.get("text", "")).strip()[:150]
                if text:
                    color = current_room.get_color(websocket)
                    sender_name = current_room.white_name if color == "w" else current_room.black_name
                    await current_room.broadcast({
                        "type": "chat_msg",
                        "sender": sender_name,
                        "color": color,
                        "text": text
                    })

            # 10. REMATCH (TÁI ĐẤU - MUTUAL AGREEMENT)
            elif action == "rematch":
                if not current_room:
                    continue
                current_room.rematch_votes.add(websocket)
                opp_ws = current_room.get_opponent(websocket)
                if len(current_room.rematch_votes) == 2:
                    current_room.white_ws, current_room.black_ws = current_room.black_ws, current_room.white_ws
                    current_room.white_name, current_room.black_name = current_room.black_name, current_room.white_name
                    current_room.rematch_votes.clear()
                    current_room.start_game()

                    await current_room.broadcast({
                        "type": "game_start",
                        "room_id": current_room.room_id,
                        "white_name": current_room.white_name,
                        "black_name": current_room.black_name,
                        "white_time": current_room.white_time,
                        "black_time": current_room.black_time,
                        "time_control": current_room.time_control,
                        "turn": "w"
                    })
                elif opp_ws:
                    await opp_ws.send(json.dumps({
                        "type": "rematch_requested"
                    }))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        ws_message_counts.pop(id(websocket), None)
        room = ws_to_room.pop(websocket, None)

        for q in list(quick_queue):
            if q[0] == websocket:
                quick_queue.remove(q)

        if room:
            opp_ws = room.get_opponent(websocket)
            if room.white_ws == websocket:
                room.white_ws = None
            if room.black_ws == websocket:
                room.black_ws = None
            if opp_ws and not opp_ws.closed:
                await opp_ws.send(json.dumps({
                    "type": "opponent_disconnected",
                    "message": "Đối thủ đã mất kết nối!"
                }))
            if (not room.white_ws or room.white_ws.closed) and \
               (not room.black_ws or room.black_ws.closed):
                rooms.pop(room.room_id, None)

# ── Timer Background Loop ─────────────────────────────────────────────────────
async def timer_loop():
    while True:
        await asyncio.sleep(0.5)
        for room_id, room in list(rooms.items()):
            if room.status == "playing" and room.time_control > 0:
                winner = room.update_clock()
                if winner:
                    await room.broadcast({
                        "type": "game_over",
                        "reason": "timeout",
                        "winner": winner,
                        "white_time": room.white_time,
                        "black_time": room.black_time
                    })
                else:
                    await room.broadcast({
                        "type": "time_sync",
                        "white_time": room.white_time,
                        "black_time": room.black_time,
                        "turn": room.turn
                    })

# ── Safe Static HTTP Server (Blocks Directory Listing & Sensitive Files) ─────
def is_safe_static_path(path: str) -> bool:
    norm = path.replace("\\", "/").strip("/")
    parts = norm.split("/")
    if any(p.startswith(".") for p in parts if p):
        return False
    blocked_exts = ('.blend', '.blend1', '.blend2', '.py', '.sh', '.env', '.git', '.md')
    if any(norm.lower().endswith(ext) for ext in blocked_exts):
        return False
    return True

class SafeHTTPRequestHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(403, "Directory listing forbidden")
        return None

    def translate_path(self, path):
        if not is_safe_static_path(path):
            return "/dev/null"
        clean_path = super().translate_path(path)
        if not is_safe_static_path(clean_path):
            return "/dev/null"
        return clean_path

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()

def run_http_server():
    os.chdir(STATIC_DIR)
    httpd = HTTPServer(("", HTTP_PORT), SafeHTTPRequestHandler)
    print(f"🌐 Safe HTTP Static Server running at http://localhost:{HTTP_PORT}")
    httpd.serve_forever()

# ── Main Entrypoint ───────────────────────────────────────────────────────────
async def main():
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        print(f"⚡ Authoritative WebSocket Server running on ws://localhost:{WS_PORT}")
        await timer_loop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🎃 Server stopped.")
