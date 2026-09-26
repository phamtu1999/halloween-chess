import hashlib
import re
import unittest
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]

class AssetCacheTest(unittest.TestCase):
    def test_preloads_match_content_versions(self):
        js = (ROOT / 'game.js').read_text()
        html = (ROOT / 'index.html').read_text()
        assets = re.findall(r"'(models 3d glb/[^']+\.glb)\?v=([a-f0-9]{12})'", js)
        self.assertEqual(len(assets), 13)
        for path, version in assets:
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest()[:12], version,
                             'Update the asset version and HTML preload when changing a model')
            self.assertIn('href="' + quote(path + '?v=' + version, safe='/?=') + '"', html)

if __name__ == '__main__':
    unittest.main()
