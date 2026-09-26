#!/usr/bin/env python3
"""
Halloween 3D Chess — Unified HTTP & WebSocket Multiplayer Server
"""

import asyncio
import json
import os
import random
import string
import time
from http.server import SimpleHTTPRequestHandler, HTTPServer
import threading
import websockets

HTTP_PORT = 8080
WS_PORT = 8081
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Game Rooms & State ────────────────────────────────────────────────────────
rooms = {}       # room_id -> Room instance
quick_queue = [] # list of (websocket, time_control)

def generate_room_id():
    return "HLW-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=4))

class GameRoom:
    def __init__(self, room_id, time_control=300, host_color="random"):
        self.room_id = room_id
        self.time_control = time_control # in seconds (0 = unlimited)
        self.white_time = time_control
        self.black_time = time_control
        self.turn = "w"
        self.status = "waiting" # waiting, playing, ended
        
        self.host_pref_color = host_color
        self.white_ws = None
        self.black_ws = None
        self.white_name = "Player 1"
        self.black_name = "Player 2"
        
        self.last_tick = None
        self.draw_offered_by = None
        self.rematch_votes = set()
        self.moves = []

    def assign_player(self, ws, name="Người chơi"):
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
                color = random.choice(["w", "b"])
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
                except:
                    pass

    def start_game(self):
        self.status = "playing"
        self.turn = "w"
        self.last_tick = time.time()
        self.moves = []

    def update_clock(self):
        if self.status != "playing" or self.time_control <= 0:
            return None
        now = time.time()
        elapsed = now - (self.last_tick or now)
        self.last_tick = now

        if self.turn == "w":
            self.white_time = max(0, self.white_time - elapsed)
            if self.white_time <= 0:
                self.status = "ended"
                return "b" # Black wins on time
        else:
            self.black_time = max(0, self.black_time - elapsed)
            if self.black_time <= 0:
                self.status = "ended"
                return "w" # White wins on time
        return None

# ── WebSocket Handler ─────────────────────────────────────────────────────────
async def ws_handler(websocket):
    current_room = None
    player_color = None

    try:
        async for raw_msg in websocket:
            try:
                data = json.loads(raw_msg)
            except:
                continue

            action = data.get("action")

            # 1. CREATE CUSTOM ROOM
            if action == "create_room":
                time_ctl = int(data.get("time_control", 300))
                pref_col = data.get("color", "random")
                name = data.get("name", "Chủ phòng")

                room_id = generate_room_id()
                while room_id in rooms:
                    room_id = generate_room_id()

                room = GameRoom(room_id, time_control=time_ctl, host_color=pref_col)
                player_color = room.assign_player(websocket, name)
                rooms[room_id] = room
                current_room = room

                await websocket.send(json.dumps({
                    "type": "room_created",
                    "room_id": room_id,
                    "color": player_color,
                    "time_control": time_ctl,
                    "status": "waiting"
                }))

            # 2. JOIN ROOM
            elif action == "join_room":
                room_id = data.get("room_id", "").strip().upper()
                name = data.get("name", "Khách")

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
                current_room = room
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

            # 3. QUICK MATCH (GHÉP TRẬN NHANH)
            elif action == "quick_match":
                time_ctl = int(data.get("time_control", 300))
                name = data.get("name", "Người chơi")

                # Check if someone is waiting in queue
                matched = None
                for item in list(quick_queue):
                    other_ws, other_time, other_name = item
                    if not other_ws.closed and other_time == time_ctl:
                        matched = item
                        quick_queue.remove(item)
                        break

                if matched:
                    other_ws, _, other_name = matched
                    room_id = generate_room_id()
                    room = GameRoom(room_id, time_control=time_ctl, host_color="random")
                    
                    c1 = room.assign_player(other_ws, other_name)
                    c2 = room.assign_player(websocket, name)
                    rooms[room_id] = room
                    current_room = room
                    player_color = c2
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

            # 4. MOVE PIECE
            elif action == "move":
                if not current_room or current_room.status != "playing":
                    continue
                if current_room.get_color(websocket) != current_room.turn:
                    continue # Not player's turn

                mv_from = data.get("from")
                mv_to = data.get("to")
                promo = data.get("promo", "q")

                current_room.moves.append({"from": mv_from, "to": mv_to, "promo": promo})
                current_room.turn = "b" if current_room.turn == "w" else "w"
                current_room.draw_offered_by = None # Reset draw offer on move

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
                if accepted and current_room.draw_offered_by:
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

            # 8. EMOTE / REACTION (🎃, 👻, 💀, 🔥)
            elif action == "emote":
                if not current_room:
                    continue
                icon = data.get("icon", "🎃")
                color = current_room.get_color(websocket)
                await current_room.broadcast({
                    "type": "emote_sent",
                    "color": color,
                    "icon": icon
                })

            # 9. CHAT MESSAGE
            elif action == "chat":
                if not current_room:
                    continue
                text = data.get("text", "").strip()
                if text:
                    color = current_room.get_color(websocket)
                    sender_name = current_room.white_name if color == "w" else current_room.black_name
                    await current_room.broadcast({
                        "type": "chat_msg",
                        "sender": sender_name,
                        "color": color,
                        "text": text
                    })

            # 10. REMATCH (TÁI ĐẤU)
            elif action == "rematch":
                if not current_room:
                    continue
                current_room.rematch_votes.add(websocket)
                opp_ws = current_room.get_opponent(websocket)
                if len(current_room.rematch_votes) == 2:
                    # Swap colors and start fresh
                    current_room.white_ws, current_room.black_ws = current_room.black_ws, current_room.white_ws
                    current_room.white_name, current_room.black_name = current_room.black_name, current_room.white_name
                    current_room.white_time = current_room.time_control
                    current_room.black_time = current_room.time_control
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
        # Cleanup on disconnect
        for q in list(quick_queue):
            if q[0] == websocket:
                quick_queue.remove(q)

        if current_room:
            opp_ws = current_room.get_opponent(websocket)
            if opp_ws and not opp_ws.closed:
                await opp_ws.send(json.dumps({
                    "type": "opponent_disconnected",
                    "message": "Đối thủ đã mất kết nối!"
                }))
            # If both disconnected, clean room
            if (not current_room.white_ws or current_room.white_ws.closed) and \
               (not current_room.black_ws or current_room.black_ws.closed):
                rooms.pop(current_room.room_id, None)

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
                    # Sync clock every second
                    await room.broadcast({
                        "type": "time_sync",
                        "white_time": room.white_time,
                        "black_time": room.black_time,
                        "turn": room.turn
                    })

# ── Static HTTP Server ────────────────────────────────────────────────────────
def run_http_server():
    os.chdir(STATIC_DIR)
    handler = SimpleHTTPRequestHandler
    httpd = HTTPServer(("", HTTP_PORT), handler)
    print(f"🌐 HTTP Static Server running at http://localhost:{HTTP_PORT}")
    httpd.serve_forever()

# ── Main Entrypoint ───────────────────────────────────────────────────────────
async def main():
    # Start HTTP server thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # Start WebSocket Server & Timer loop
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        print(f"⚡ WebSocket Multiplayer Server running on ws://localhost:{WS_PORT}")
        await timer_loop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🎃 Server stopped.")
