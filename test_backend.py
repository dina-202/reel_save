import json
import os
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
import backend


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(backend.app)

    def test_extractor_error_is_visible(self):
        with patch('backend.subprocess.run', return_value=SimpleNamespace(returncode=1, stderr='Video unavailable')):
            response = self.client.post('/download', json={'url': 'https://youtu.be/example'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['detail'], 'Video unavailable')

    def test_timeout_is_json(self):
        with patch('backend.subprocess.run', side_effect=subprocess.TimeoutExpired('yt-dlp', 120)):
            response = self.client.post('/download', json={'url': 'https://youtu.be/example'})
        self.assertEqual(response.status_code, 504)
        self.assertIn('timed out', response.json()['detail'])

    def test_split_stream_metadata_supported(self):
        info = {'title': 'Example', 'requested_formats': [{'url': 'video'}, {'url': 'audio'}]}
        with patch('backend.run_ytdlp', return_value=SimpleNamespace(stdout=json.dumps(info))):
            response = self.client.post('/download', json={'url': 'https://www.facebook.com/watch/?v=1'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['platform'], 'Facebook')

    def test_empty_url(self):
        self.assertEqual(self.client.post('/download', json={'url': ' '}).status_code, 400)

    def test_missing_ffmpeg(self):
        with patch('backend.shutil.which', return_value=None):
            response = self.client.post('/download-video', json={'url': 'https://youtu.be/example'})
        self.assertEqual(response.status_code, 503)

    def check_file(self, audio):
        paths = []
        def produce(args, timeout):
            template = args[args.index('-o') + 1]
            path = template.replace('%(ext)s', 'mp3' if audio else 'mp4')
            paths.append(path)
            with open(path, 'wb') as file:
                file.write(b'media-test-bytes')
            if audio:
                self.assertEqual(args[args.index('--audio-quality') + 1], '128K')
            else:
                self.assertIn('--merge-output-format', args)
            self.assertEqual(args[-2], '--')
        with patch('backend.shutil.which', return_value='ffmpeg'), patch('backend.run_ytdlp', side_effect=produce):
            response = self.client.post('/download-audio' if audio else '/download-video',
                                        json={'url': 'https://youtu.be/example', 'quality': 'lo' if audio else 'hd'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'media-test-bytes')
        self.assertIn('.mp3' if audio else '.mp4', response.headers['content-disposition'])
        self.assertFalse(os.path.exists(paths[0]))

    def test_mp3_stream_and_cleanup(self):
        self.check_file(True)

    def test_mp4_stream_and_cleanup(self):
        self.check_file(False)


if __name__ == '__main__':
    unittest.main()
