from contextlib import redirect_stdout
import io
import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import backend
from diagnostics import emit_report, platform_name


class DiagnosticTests(unittest.TestCase):
    def test_download_failure_emits_categories_without_private_data(self):
        output = io.StringIO()
        private_error = 'ERROR: [Instagram] SECRET_VIDEO: Requested format is not available. C:\\Users\\PRIVATE_USER https://instagram.com/reel/SECRET_VIDEO/?token=SECRET_TOKEN'
        with patch.dict(os.environ, {'REELSAVE_DESKTOP_TOKEN': 'test'}), redirect_stdout(output), \
                patch('backend.subprocess.run', return_value=SimpleNamespace(returncode=1, stderr=private_error)):
            response = TestClient(backend.app).post('/download', json={
                'url': 'https://www.instagram.com/reel/SECRET_VIDEO/?token=SECRET_TOKEN', 'quality': 'hd'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('Requested format', response.json()['detail'])
        payload = json.loads(output.getvalue().split('REELSAVE_DIAGNOSTIC=')[1])
        self.assertEqual(payload['code'], 'format_unavailable')
        self.assertEqual(payload['platform'], 'instagram')
        self.assertEqual(payload['stage'], 'metadata')
        self.assertEqual(payload['quality'], 'hd')
        self.assertNotIn('SECRET', output.getvalue())
        self.assertNotIn('PRIVATE_USER', output.getvalue())
        self.assertNotIn('https:', output.getvalue())

    def test_actual_download_failure_is_captured(self):
        output = io.StringIO()
        with patch.dict(os.environ, {'REELSAVE_DESKTOP_TOKEN': 'test'}), redirect_stdout(output), \
                patch('backend.download_file', side_effect=HTTPException(504, 'Timed out')):
            response = TestClient(backend.app).post('/download-video', json={'url': 'https://youtu.be/private'})
        self.assertEqual(response.status_code, 504)
        self.assertIn('"stage": "download"', output.getvalue())
        self.assertIn('"code": "timeout"', output.getvalue())
        self.assertNotIn('private', output.getvalue())

    def test_busy_and_invalid_requests_are_not_reported(self):
        output = io.StringIO()
        with patch.dict(os.environ, {'REELSAVE_DESKTOP_TOKEN': 'test'}), redirect_stdout(output):
            emit_report('download', HTTPException(409, 'Busy'))
            emit_report('download', HTTPException(422, 'Bad input'))
        self.assertEqual(output.getvalue(), '')

    def test_platform_checks_hostname_only(self):
        self.assertEqual(platform_name('https://evil.test/instagram.com/secret'), 'other')
        self.assertEqual(platform_name('https://instagram.com.evil.test/secret'), 'other')
        self.assertEqual(platform_name('https://www.reddit.com/r/private'), 'reddit')
        self.assertEqual(platform_name('https://[invalid'), 'other')

    def test_failed_diagnostic_output_does_not_replace_original_error(self):
        with patch.dict(os.environ, {'REELSAVE_DESKTOP_TOKEN': 'test'}), patch('builtins.print', side_effect=OSError('disk')):
            emit_report('metadata', HTTPException(400, 'failure'))


if __name__ == '__main__':
    unittest.main()
