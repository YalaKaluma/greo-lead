"""Name-independent regression checks; no model calls or benchmark mappings."""
import unittest
from copy import deepcopy

from app.services.meeting_resolution_contract import validate_catalog_choices, retain_greeted_attendees
from app.services.meeting_review_service import reconcile_project_coverage


class EvidenceConsistencyTests(unittest.TestCase):
    def person(self, name, ids):
        return dict(name=name, observed_name=name, id=17, status="existing",
                    identity_basis="named_person", attendance_basis="mentioned",
                    confidence=.98, runner_up_confidence=0, evidence_line_ids=ids)

    def check_person(self, source, name="Elena", ids=None):
        return validate_catalog_choices({"people": [self.person(name, ids or [1])]},
                                        {"people": [{"id": 17, "name": name}]}, source)

    def test_scenario_only_names_are_rejected_even_if_model_calls_them_real(self):
        for name in ["Elena", "Omar", "Jules"]:
            with self.subTest(name=name):
                result = self.check_person(f"A: Imaginons qu'un gars crée un scénario, est-ce visible par {name} ?", name)
                self.assertEqual(result["mentioned_people"], [])
                self.assertEqual(result["rejected_people"][0]["validation_reason"], "hypothetical_only_evidence")

    def test_english_scenario(self):
        self.assertEqual(self.check_person("A: Imagine someone sharing a fictional scenario with Elena.")["mentioned_people"], [])

    def test_fragmented_same_speaker_scenario(self):
        result = self.check_person("A: Imaginons un scénario\nA: partagé avec Elena ?", ids=[1, 2])
        self.assertEqual(result["mentioned_people"], [])

    def test_factual_mention_after_scenario_survives(self):
        result = self.check_person("A: Imaginons un scénario pour Elena.\nA: Elena a envoyé le contrat hier.", ids=[1, 2])
        self.assertEqual(result["mentioned_people"][0]["id"], 17)

    def test_separate_speaker_does_not_inherit_hypothetical_scope(self):
        result = self.check_person("A: Imaginons un scénario\nB: Elena a envoyé le contrat hier.", ids=[1, 2])
        self.assertEqual(result["mentioned_people"][0]["id"], 17)

    def test_conditional_and_real_examples_are_not_excluded(self):
        for source in ["A: Si Elena est disponible, on lui demande le contrat.",
                       "A: Par exemple, Elena a livré ce projet hier.",
                       "A: Elena reviewed hypothetical scenarios yesterday.",
                       "A: Elena said we should imagine someone creating a scenario."]:
            self.assertEqual(self.check_person(source)["mentioned_people"][0]["id"], 17)

    def test_greeted_attendee_still_recovers(self):
        catalog = {"people": [{"id": 17, "name": "Elena"}]}
        result = self.check_person("A: Imaginons un scénario avec Elena.\nMe: Salut Elena.")
        retain_greeted_attendees(result, catalog, "A: Imaginons un scénario avec Elena.\nMe: Salut Elena.")
        self.assertEqual(result["people"][0]["id"], 17)

    def projects(self, status, include_prior=True):
        candidate = {"id": 23, "title": "Orion rollout"}
        link = {"status": "existing", "id": 23, "name": "Orion rollout", "confidence": .95}
        output = {"primary_project": deepcopy(link) if include_prior else {"status": "none"},
                  "additional_projects": [], "project_coverage": {"23": {
                      **link, "status": status, "id": 23 if status == "existing" else None,
                      "rationale": "Source boundary decision"}}}
        return reconcile_project_coverage(output, [candidate], {})

    def test_conflicting_negative_does_not_silently_overwrite_positive(self):
        result = self.projects("none")
        rows = [result["primary_project"], *result["additional_projects"]]
        conflict = next(p for p in rows if p.get("coverage_candidate_id") == 23)
        self.assertEqual(conflict["status"], "unresolved")
        self.assertEqual(conflict["validation_reason"], "conflicting_project_decisions")
        self.assertFalse(any(p.get("status") == "existing" for p in rows))
        self.assertEqual(result["project_model_output"]["primary_project"]["id"], 23)

    def test_agreeing_decisions_keep_one_link(self):
        result = self.projects("existing")
        rows = [result["primary_project"], *result["additional_projects"]]
        self.assertEqual(sum(p.get("status") == "existing" for p in rows), 1)

    def test_rejection_is_retained_without_auto_link(self):
        result = self.projects("none", False)
        rows = [result["primary_project"], *result["additional_projects"]]
        self.assertTrue(any(p.get("validation_reason") == "model_rejected_candidate" for p in rows))
        self.assertFalse(any(p.get("status") == "existing" for p in rows))

    def test_missing_decision_requires_review(self):
        result = reconcile_project_coverage({"primary_project": {"status": "none"},
                     "additional_projects": []}, [{"id": 23, "title": "Orion rollout"}], {})
        self.assertEqual(result["additional_projects"][0]["status"], "unresolved")


if __name__ == "__main__":
    unittest.main()
