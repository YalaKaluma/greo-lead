from unittest import TestCase
from unittest.mock import Mock, patch

from app.services import onboarding_seed_service


class JourneyRoadmapImportsTest(TestCase):
    def test_roadmap_compaction_helper_is_imported_by_router(self):
        with patch.dict("sys.modules", {"yaml": Mock(safe_load=lambda stream: {})}):
            from app.routers import journey

        self.assertIs(
            journey.ensure_starter_goal_samples_compacted,
            onboarding_seed_service.ensure_starter_goal_samples_compacted,
        )
