#!/usr/bin/env python3
"""
End-to-End WebSocket Integration Tests for Halloween Chess Server
"""

import asyncio
import json
import unittest
import websockets
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server

class TestWebSocketMultiplayerE2E(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server.rooms.clear()
        server.ws_to_room.clear()
        server.quick_queue.clear()
        self.server = await websockets.serve(server.ws_handler, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        self.uri = f"ws://127.0.0.1:{self.port}"

    async def asyncTearDown(self):
        self.server.close()
        await self.server.wait_closed()

    async def test_quick_match_two_real_clients(self):
        """P1: Test quick_match pairing of 2 real concurrent WebSocket clients and bidirectional play"""
        async with websockets.connect(self.uri) as ws_client1, websockets.connect(self.uri) as ws_client2:
            # Client 1 joins quick match
            await ws_client1.send(json.dumps({
                "action": "quick_match",
                "time_control": 300,
                "name": "PlayerA"
            }))
            wait_msg = json.loads(await ws_client1.recv())
            self.assertEqual(wait_msg["type"], "queue_waiting")

            # Client 2 joins quick match with same time control
            await ws_client2.send(json.dumps({
                "action": "quick_match",
                "time_control": 300,
                "name": "PlayerB"
            }))

            # Both receive game_start
            start_1 = json.loads(await ws_client1.recv())
            start_2 = json.loads(await ws_client2.recv())
            self.assertEqual(start_1["type"], "game_start")
            self.assertEqual(start_2["type"], "game_start")
            self.assertEqual(start_1["room_id"], start_2["room_id"])

            # Identify which client is White and which is Black
            room = server.rooms[start_1["room_id"]]
            ws_white = ws_client1 if room.white_ws == ws_client1 else ws_client2
            ws_black = ws_client2 if room.white_ws == ws_client1 else ws_client1

            # White moves e2e4
            await ws_white.send(json.dumps({
                "action": "move",
                "from": "e2",
                "to": "e4"
            }))
            mv1_w = json.loads(await ws_white.recv())
            mv1_b = json.loads(await ws_black.recv())
            self.assertEqual(mv1_w["type"], "move_made")
            self.assertEqual(mv1_b["type"], "move_made")
            self.assertEqual(mv1_w["from"], "e2")
            self.assertEqual(mv1_w["to"], "e4")

            # Black moves e7e5 (tests P0-5 fix: second client has active current_room mapping)
            await ws_black.send(json.dumps({
                "action": "move",
                "from": "e7",
                "to": "e5"
            }))
            mv2_w = json.loads(await ws_white.recv())
            mv2_b = json.loads(await ws_black.recv())
            self.assertEqual(mv2_w["type"], "move_made")
            self.assertEqual(mv2_b["type"], "move_made")
            self.assertEqual(mv2_b["from"], "e7")
            self.assertEqual(mv2_b["to"], "e5")

    async def test_room_creation_and_rules_enforcement(self):
        """Test custom room creation, turn alternation, and illegal move rejection over WebSocket"""
        async with websockets.connect(self.uri) as ws_white, websockets.connect(self.uri) as ws_black:
            # 1. White creates room
            await ws_white.send(json.dumps({
                "action": "create_room",
                "time_control": 300,
                "color": "w",
                "name": "WhitePlayer"
            }))
            res = json.loads(await ws_white.recv())
            self.assertEqual(res["type"], "room_created")
            self.assertEqual(res["color"], "w")
            room_id = res["room_id"]

            # 2. Black joins room
            await ws_black.send(json.dumps({
                "action": "join_room",
                "room_id": room_id,
                "name": "BlackPlayer"
            }))
            start_w = json.loads(await ws_white.recv())
            start_b = json.loads(await ws_black.recv())
            self.assertEqual(start_w["type"], "game_start")
            self.assertEqual(start_b["type"], "game_start")

            # 3. Black tries to move first out of turn -> rejected
            await ws_black.send(json.dumps({
                "action": "move",
                "from": "e7",
                "to": "e5"
            }))
            err_b = json.loads(await ws_black.recv())
            self.assertEqual(err_b["type"], "error")
            self.assertIn("Chưa tới lượt", err_b["message"])

            # 4. White tries illegal move -> rejected
            await ws_white.send(json.dumps({
                "action": "move",
                "from": "b1",
                "to": "b5"
            }))
            err_w = json.loads(await ws_white.recv())
            self.assertEqual(err_w["type"], "error")
            self.assertIn("không hợp lệ", err_w["message"])

            # 5. White makes legal move: e2e4
            await ws_white.send(json.dumps({
                "action": "move",
                "from": "e2",
                "to": "e4"
            }))
            mv_w = json.loads(await ws_white.recv())
            mv_b = json.loads(await ws_black.recv())
            self.assertEqual(mv_w["type"], "move_made")
            self.assertEqual(mv_b["type"], "move_made")

            # 6. Resign works cleanly
            await ws_black.send(json.dumps({"action": "resign"}))
            end_w = json.loads(await ws_white.recv())
            end_b = json.loads(await ws_black.recv())
            self.assertEqual(end_w["type"], "game_over")
            self.assertEqual(end_w["reason"], "resigned")
            self.assertEqual(end_w["winner"], "w")

if __name__ == '__main__':
    unittest.main()
