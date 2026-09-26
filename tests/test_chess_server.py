#!/usr/bin/env python3
"""
Automated Test Suite for Halloween Chess Server & Security Defenses
"""

import asyncio
import json
import unittest
import chess
import websockets

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import GameRoom, generate_room_id, is_rate_limited, is_safe_static_path, ROOM_CODE_ALPHABET

class TestChessLogicAndRules(unittest.TestCase):
    def setUp(self):
        self.room = GameRoom("HLW-TEST01", time_control=300, host_color="w")
        self.room.white_ws = "dummy_white_ws"
        self.room.black_ws = "dummy_black_ws"
        self.room.start_game()

    def test_room_id_entropy_and_alphabet(self):
        """Verify room codes are 10 chars (HLW-XXXXXX) using base32 unambiguous alphabet"""
        for _ in range(50):
            code = generate_room_id(6)
            self.assertTrue(code.startswith("HLW-"))
            clean = code.replace("HLW-", "")
            self.assertEqual(len(clean), 6)
            for c in clean:
                self.assertIn(c, ROOM_CODE_ALPHABET)

    def test_legal_moves(self):
        """Test standard legal chess moves (e2e4 -> e7e5 -> g1f3)"""
        # White moves e2e4
        m1 = chess.Move.from_uci("e2e4")
        self.assertIn(m1, self.room.board.legal_moves)
        self.room.board.push(m1)
        self.assertEqual(self.room.turn, "b")

        # Black moves e7e5
        m2 = chess.Move.from_uci("e7e5")
        self.assertIn(m2, self.room.board.legal_moves)
        self.room.board.push(m2)
        self.assertEqual(self.room.turn, "w")

        # White moves g1f3
        m3 = chess.Move.from_uci("g1f3")
        self.assertIn(m3, self.room.board.legal_moves)
        self.room.board.push(m3)
        self.assertEqual(self.room.turn, "b")

    def test_illegal_move_rejection(self):
        """Test that illegal moves are correctly detected as not in legal_moves"""
        illegal_m1 = chess.Move.from_uci("a1a5")
        self.assertNotIn(illegal_m1, self.room.board.legal_moves)

        illegal_m2 = chess.Move.from_uci("e2e8")
        self.assertNotIn(illegal_m2, self.room.board.legal_moves)

    def test_fools_mate_checkmate_detection(self):
        """Test Scholar's / Fool's Mate detection"""
        self.room.board.push(chess.Move.from_uci("f2f3"))
        self.room.board.push(chess.Move.from_uci("e7e5"))
        self.room.board.push(chess.Move.from_uci("g2g4"))
        self.room.board.push(chess.Move.from_uci("d8h4"))

        self.assertTrue(self.room.board.is_checkmate())
        self.assertEqual(self.room.turn, "w")

    def test_rate_limiter(self):
        """Test that rate limiter triggers when sending > 10 messages/sec"""
        dummy_ws = object()
        for _ in range(10):
            self.assertFalse(is_rate_limited(dummy_ws, max_per_second=10))
        self.assertTrue(is_rate_limited(dummy_ws, max_per_second=10))

class TestHttpFileExposureDefense(unittest.TestCase):
    def test_blocked_extensions(self):
        blocked = ['test.blend', 'backup.blend1', 'server.py', 'start_game.sh', '.env', '.git/config', 'subdir/.env']
        for b in blocked:
            self.assertFalse(is_safe_static_path(b), f"{b} should be blocked")

        allowed = ['index.html', 'game.js', 'models 3d glb/board.glb', 'styles.css', 'models 3d glb/pawn_w.glb']
        for a in allowed:
            self.assertTrue(is_safe_static_path(a), f"{a} should be allowed")

if __name__ == '__main__':
    unittest.main()
