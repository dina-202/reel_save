import json
import os
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
import backend
from yt_dlp import YoutubeDL


class VideoFormatTests(unittest.TestCase):
    def select(self, quality, formats, options=None):
        options = options or backend.video_options(quality)
        params = {'quiet': True, 'no_warnings': True, 'format': options[1],
                  'format_sort': [options[3]] if len(options) > 3 else []}
        with YoutubeDL(params) as downloader:
            return downloader.process_ie_result({'id': 'test', 'title': 'Test reel', 'formats': formats}, download=False)

    def video(self, name, width=None, height=None, audio=False):
        return {'format_id': name, 'url': f'https://media.example/{name}.mp4', 'ext': 'mp4',
                'vcodec': 'h264', 'acodec': 'aac' if audio else 'none', 'width': width, 'height': height}

    def audio(self):
        return {'format_id': 'audio', 'url': 'https://media.example/audio.m4a', 'ext': 'm4a',
                'vcodec': 'none', 'acodec': 'aac'}

    def test_portrait_hd_uses_shorter_edge(self):
        info = self.select('hd', [self.video('720', 720, 1280), self.video('1080', 1080, 1920), self.audio()])
        self.assertEqual(info['width'], 1080)
        self.assertEqual(info['height'], 1920)
        self.assertEqual(len(info['requested_formats']), 2)

    def test_sd_prefers_480_when_available(self):
        info = self.select('sd', [self.video('480', 480, 854), self.video('720', 720, 1280), self.audio()])
        self.assertEqual(info['width'], 480)

    def test_sd_falls_back_when_no_480_variant_exists(self):
        info = self.select('sd', [self.video('720', 720, 1280), self.video('1080', 1080, 1920), self.audio()])
        self.assertEqual(info['width'], 720)

    def test_unknown_dimensions_are_downloadable(self):
        info = self.select('hd', [self.video('unknown', audio=True)])
        self.assertEqual(info['format_id'], 'unknown')

    def test_silent_video_is_downloadable(self):
        info = self.select('hd', [self.video('silent', 1080, 1920)])
        self.assertEqual(info['format_id'], 'silent')


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
