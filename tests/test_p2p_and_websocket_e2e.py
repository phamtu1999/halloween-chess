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
        server.quick_queue.clear()
        self.port = 8999
        self.server = await websockets.serve(server.ws_handler, "127.0.0.1", self.port)
        self.uri = f"ws://127.0.0.1:{self.port}"

    async def asyncTearDown(self):
        self.server.close()
        await self.server.wait_closed()

    async def test_full_match_and_illegal_move_rejection(self):
        """Test room creation, joining, turn alternation, and illegal move rejection over WebSocket"""
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

            # 6. Black makes legal move: e7e5
            await ws_black.send(json.dumps({
                "action": "move",
                "from": "e7",
                "to": "e5"
            }))
            mv2_w = json.loads(await ws_white.recv())
            mv2_b = json.loads(await ws_black.recv())
            self.assertEqual(mv2_w["type"], "move_made")
            self.assertEqual(mv2_b["type"], "move_made")

            # 7. Resign works cleanly
            await ws_black.send(json.dumps({"action": "resign"}))
            end_w = json.loads(await ws_white.recv())
            end_b = json.loads(await ws_black.recv())
            self.assertEqual(end_w["type"], "game_over")
            self.assertEqual(end_w["reason"], "resigned")
            self.assertEqual(end_w["winner"], "w")

if __name__ == '__main__':
    unittest.main()
