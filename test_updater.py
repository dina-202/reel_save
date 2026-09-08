import subprocess
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
import backend
import updater


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.saved = updater.state.copy()
        updater.state.update(status='idle', latest=None, error=None, checked_at=0, current='2026.3.17')
        self.client = TestClient(backend.app)
        self.headers = {'X-ReelSave-Update-Token': updater.token}

    def tearDown(self):
        updater.state.update(self.saved)
        if updater.operation_lock.locked():
            updater.operation_lock.release()

    def registry(self, latest='2026.8.19'):
        return httpx.Response(200, json={'info': {'version': latest}}, request=httpx.Request('GET', 'https://pypi.org'))

    def test_new_version_and_cache(self):
        with patch('updater.httpx.get', return_value=self.registry()) as get, patch('updater.version', return_value='2026.3.17'):
            data = self.client.get('/updates').json()
            self.assertTrue(data['available'])
            self.assertEqual(data['latest'], '2026.8.19')
            self.client.get('/updates')
        self.assertEqual(get.call_count, 1)

    def test_offline_is_not_up_to_date(self):
        with patch('updater.httpx.get', side_effect=httpx.ConnectError('offline')):
            data = self.client.get('/updates').json()
        self.assertEqual(data['status'], 'check_failed')
        self.assertIn('internet', data['error'])

    def test_remote_host_and_missing_token_rejected(self):
        self.assertEqual(self.client.post('/updates').status_code, 403)
        self.assertEqual(self.client.get('/updates', headers={'host': 'untrusted.example'}).status_code, 403)

    def test_busy_download_blocks_update_and_updater_blocks_download(self):
        updater.operation_lock.acquire()
        with patch.dict('updater.os.environ', {'REELSAVE_BUNDLED_PYTHON': '1'}):
            self.assertEqual(self.client.post('/updates', headers=self.headers).status_code, 409)
        self.assertEqual(self.client.post('/download', json={'url': 'https://youtu.be/example'}).status_code, 409)

    def test_update_starts_only_once(self):
        with patch.dict('updater.os.environ', {'REELSAVE_BUNDLED_PYTHON': '1'}), patch('updater.version', return_value='2026.3.17'), patch('updater.httpx.get', return_value=self.registry()), patch('updater.threading.Thread') as thread:
            result = self.client.post('/updates', headers=self.headers)
            self.assertEqual(result.json()['status'], 'updating')
            self.assertEqual(self.client.post('/updates', headers=self.headers).status_code, 409)
            thread.return_value.start.assert_called_once()

    def test_install_verifies_version_and_releases_downloads(self):
        updater.operation_lock.acquire()
        with patch('updater.subprocess.run', side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=0, stdout='2026.08.19')]) as run:
            updater.install('2026.8.19')
        self.assertEqual(updater.state['status'], 'updated')
        self.assertFalse(updater.operation_lock.locked())
        self.assertIn('yt-dlp[default]==2026.8.19', run.call_args_list[0].args[0])

    def test_failed_install_is_retryable(self):
        updater.operation_lock.acquire()
        with patch('updater.subprocess.run', side_effect=subprocess.TimeoutExpired('pip', 300)):
            updater.install('2026.8.19')
        self.assertEqual(updater.state['status'], 'failed')
        self.assertFalse(updater.operation_lock.locked())

    def test_missing_package_keeps_repair_available(self):
        with patch('updater.version', side_effect=updater.PackageNotFoundError('yt-dlp')):
            status = updater.snapshot()
        self.assertEqual(status['status'], 'failed')
        self.assertIn('repair', status['error'])

    def test_app_restart_reservation_can_be_cancelled(self):
        self.assertEqual(self.client.post('/updates/prepare-restart', headers=self.headers).status_code, 200)
        self.assertTrue(self.client.get('/updates/activity').json()['busy'])
        self.assertEqual(self.client.post('/updates/cancel-restart', headers=self.headers).status_code, 200)
        self.assertFalse(self.client.get('/updates/activity').json()['busy'])

    def test_app_restart_waits_for_file_transfer(self):
        updater.begin_transfer()
        try:
            self.assertEqual(self.client.post('/updates/prepare-restart', headers=self.headers).status_code, 409)
            self.assertTrue(self.client.get('/updates/activity').json()['busy'])
        finally:
            updater.finish_transfer()

    def test_no_update_does_not_install(self):
        with patch.dict('updater.os.environ', {'REELSAVE_BUNDLED_PYTHON': '1'}), patch('updater.version', return_value='2026.8.19'), patch('updater.httpx.get', return_value=self.registry()), patch('updater.threading.Thread') as thread:
            self.assertFalse(self.client.post('/updates', headers=self.headers).json()['available'])
            thread.assert_not_called()
        self.assertFalse(updater.operation_lock.locked())


if __name__ == '__main__':
    unittest.main()
