from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import Mock, patch

import pytz

from app.services.priority_service import PriorityService


class PriorityTimezoneTest(TestCase):
    def test_today_window_uses_user_timezone_then_returns_utc_bounds(self):
        service = PriorityService(Mock())
        user_timezone = pytz.timezone("America/Los_Angeles")
        evening = user_timezone.localize(datetime(2026, 6, 7, 20, 30, 0))

        class FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return evening.astimezone(tz) if tz else evening.replace(tzinfo=None)

        with (
            patch.object(service, "_timezone_for_user", return_value=user_timezone),
            patch("app.services.priority_service.datetime", FixedDateTime),
        ):
            start, end = service._today_window("user-1")

        self.assertEqual(start, datetime(2026, 6, 7, 7, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 6, 8, 6, 59, 59, 999999, tzinfo=timezone.utc))
