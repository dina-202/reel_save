import unittest

from youtube_fallback import is_youtube_url, should_retry_android, android_fallback_format


class YouTubeFallbackTests(unittest.TestCase):
    def test_only_real_youtube_hosts(self):
        for url in ("https://www.youtube.com/watch?v=abc",
                    "https://m.youtube.com/shorts/abc",
                    "https://youtu.be/abc",
                    "https://music.youtube.com/watch?v=abc"):
            self.assertTrue(is_youtube_url(url))
        for url in ("https://youtube.com.evil.test/watch?v=x",
                    "https://notyoutube.com/watch?v=x",
                    "https://example.com/youtube.com",
                    "file:///youtube.com", "bad url"):
            self.assertFalse(is_youtube_url(url))

    def test_only_403_retries(self):
        url = "https://www.youtube.com/watch?v=abc"
        self.assertTrue(should_retry_android(url, "ERROR: unable to download video data: HTTP Error 403: Forbidden"))
        self.assertTrue(should_retry_android(url, "ERROR: HTTP 403 Forbidden"))
        self.assertFalse(should_retry_android(url, "HTTP Error 404: Not Found"))
        self.assertFalse(should_retry_android(url, "Requested format is not available"))
        self.assertFalse(should_retry_android("https://www.instagram.com/reel/x", "HTTP Error 403"))

    def test_android_video_and_audio_formats(self):
        self.assertEqual(android_fallback_format(False, "best"), ["--format", "bv*+ba/b"])
        self.assertEqual(android_fallback_format(False, "hd"), ["--format", "bv*+ba/b", "--format-sort", "res:1080"])
        self.assertEqual(android_fallback_format(True, "hi"), ["--format", "ba/b"])


if __name__ == "__main__":
    unittest.main()
