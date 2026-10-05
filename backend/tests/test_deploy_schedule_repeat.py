"""Repeating scheduled deploys: next-occurrence math and how a series advances between runs.

Plain unittest, like the rest of tests/: the Docker build runs `python -m unittest discover`.
"""
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.services.deploy_schedule_service as svc  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.schemas.deploy_schedule import ScheduleDeployRequest  # noqa: E402
from app.services.deploy_schedule_service import DeployScheduleService, ScheduleError  # noqa: E402
from app.services.recurrence import describe, next_occurrence  # noqa: E402

BKK = timezone(timedelta(hours=7))
THU_02 = datetime(2026, 9, 24, 2, 0, tzinfo=BKK)  # a Thursday


def local(dt):
    return dt.astimezone(BKK).strftime("%a %Y-%m-%d %H:%M")


class NextOccurrenceTest(unittest.TestCase):
    def test_once_has_no_next_run(self):
        self.assertIsNone(next_occurrence(THU_02, "once"))

    def test_hourly_steps_by_interval_and_skips_past_slots(self):
        self.assertEqual(local(next_occurrence(THU_02, "hourly", 6)), "Thu 2026-09-24 08:00")
        late = datetime(2026, 9, 24, 20, 30, tzinfo=BKK)
        self.assertEqual(local(next_occurrence(THU_02, "hourly", 6, after=late)), "Fri 2026-09-25 02:00")

    def test_daily_keeps_wall_clock_time(self):
        self.assertEqual(local(next_occurrence(THU_02, "daily", 2, tz=BKK)), "Sat 2026-09-26 02:00")

    def test_weekly_picks_the_next_chosen_weekday(self):
        self.assertEqual(local(next_occurrence(THU_02, "weekly", 1, [0, 3], BKK)), "Mon 2026-09-28 02:00")
        after_mon = datetime(2026, 9, 29, tzinfo=BKK)
        self.assertEqual(local(next_occurrence(THU_02, "weekly", 1, [0, 3], BKK, after_mon)), "Thu 2026-10-01 02:00")

    def test_describe(self):
        self.assertEqual(describe("hourly", 6), "every 6 hours, until cancelled")
        self.assertEqual(describe("weekly", 1, [0, 3], 4), "weekly on Mon, Thu, 4 times")
        self.assertEqual(describe("once"), "once")


class ScheduleStorageTest(unittest.TestCase):
    """Keeps the schedule file and the audit logs inside a temp dir"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._data_file = svc.DATA_FILE
        self._log_dir = settings.DEPLOY_LOG_DIR
        svc.DATA_FILE = os.path.join(self._tmp.name, "scheduled_deploys.json")
        settings.DEPLOY_LOG_DIR = os.path.join(self._tmp.name, "logs")

    def tearDown(self):
        svc.DATA_FILE = self._data_file
        settings.DEPLOY_LOG_DIR = self._log_dir
        self._tmp.cleanup()


def make_item(**over):
    item = {
        "id": "sched-test01",
        "title": "test",
        "status": "running",
        "run_at": THU_02.isoformat(),
        "first_run_at": THU_02.isoformat(),
        "deadline": None,
        "repeat": "hourly",
        "interval": 6,
        "weekdays": [],
        "occurrences": None,
        "repeat_until": None,
        "repeat_label": "every 6 hours",
        "run_count": 1,
        "missed_count": 0,
        "runs": [],
        "stop_repeat": False,
        "client_tz": "Asia/Bangkok",
        "client_offset_minutes": 420,
        "started_at": None,
        "finished_at": None,
        "job_id": "job-1",
        "summary": {"total": 1, "completed": 1, "success": 1, "failed": 0, "elapsed_seconds": 2},
        "error": None,
    }
    item.update(over)
    return item


class SeriesAdvanceTest(ScheduleStorageTest):
    def test_repeating_run_queues_the_next_occurrence(self):
        item = make_item()
        DeployScheduleService._end_run(item, "completed")
        self.assertEqual(item["status"], "scheduled")
        self.assertIsNone(item["job_id"])
        self.assertIsNone(item["summary"])
        self.assertGreater(datetime.fromisoformat(item["run_at"]), THU_02)
        self.assertEqual(item["runs"][0]["status"], "completed")
        self.assertEqual(item["runs"][0]["summary"]["success"], 1)

    def test_series_ends_after_the_requested_number_of_runs(self):
        item = make_item(occurrences=3, run_count=3)
        DeployScheduleService._end_run(item, "completed")
        self.assertEqual(item["status"], "completed")
        self.assertIsNotNone(item["finished_at"])
        self.assertEqual(len(item["runs"]), 1)

    def test_series_ends_at_repeat_until(self):
        item = make_item(repeat_until=(THU_02 + timedelta(hours=3)).isoformat())
        DeployScheduleService._end_run(item, "completed")
        self.assertEqual(item["status"], "completed")

    def test_cancel_while_running_stops_the_series(self):
        item = make_item(stop_repeat=True)
        DeployScheduleService._end_run(item, "cancelled")
        self.assertEqual(item["status"], "cancelled")

    def test_one_shot_schedule_keeps_its_terminal_status(self):
        item = make_item(repeat="once")
        DeployScheduleService._end_run(item, "completed")
        self.assertEqual(item["status"], "completed")
        self.assertEqual(item["runs"], [])

    def test_missed_occurrence_jumps_to_the_next_future_slot(self):
        long_ago = datetime.now(timezone.utc) - timedelta(days=5)
        item = make_item(status="scheduled", repeat="daily", interval=1, run_at=long_ago.isoformat(), run_count=0)
        DeployScheduleService._end_run(item, "missed")
        self.assertEqual(item["status"], "scheduled")
        self.assertGreater(datetime.fromisoformat(item["run_at"]), datetime.now(timezone.utc))
        self.assertEqual(item["run_count"], 0)  # a missed slot does not use up an occurrence


class CreateScheduleTest(ScheduleStorageTest):
    @staticmethod
    def request(**over):
        payload = {
            "devices": [{"name": "SW1", "host": "10.0.0.1", "username": "admin", "password": "x"}],
            "config_commands": ["vlan 100"],
            "run_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "client_tz": "Asia/Bangkok",
            "client_offset_minutes": 420,
        }
        payload.update(over)
        return ScheduleDeployRequest(**payload)

    def test_create_stores_the_repeat_rule(self):
        item = DeployScheduleService.create(self.request(repeat="hourly", interval=4, occurrences=3))
        self.assertEqual(item["repeat"], "hourly")
        self.assertEqual(item["interval"], 4)
        self.assertEqual(item["occurrences"], 3)
        self.assertEqual(item["repeat_label"], "every 4 hours, 3 times")
        self.assertEqual(item["run_count"], 0)

    def test_create_moves_a_weekly_start_onto_a_chosen_weekday(self):
        start = datetime.now(BKK).replace(hour=2, minute=0, second=0, microsecond=0) + timedelta(days=1)
        weekdays = sorted({(start.weekday() + 2) % 7, (start.weekday() + 4) % 7})
        item = DeployScheduleService.create(self.request(run_at=start, repeat="weekly", weekdays=weekdays))
        moved = datetime.fromisoformat(item["run_at"]).astimezone(BKK)
        self.assertIn(moved.weekday(), weekdays)
        self.assertGreater(moved, start)
        self.assertEqual((moved.hour, moved.minute), (2, 0))

    def test_create_rejects_a_deadline_on_a_repeating_schedule(self):
        req = self.request(repeat="daily", deadline=datetime.now(timezone.utc) + timedelta(hours=2))
        with self.assertRaises(ScheduleError):
            DeployScheduleService.create(req)

    def test_weekly_without_weekdays_is_rejected_by_the_schema(self):
        with self.assertRaises(ValueError):
            self.request(repeat="weekly")


if __name__ == "__main__":
    unittest.main()
