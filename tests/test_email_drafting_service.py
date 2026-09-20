from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import ANY, Mock, patch

from app.services.email_drafting_service import draft_email
from app.services.twin_context_service import TwinContext


class EmailDraftingServiceTest(TestCase):
    @patch("app.services.email_drafting_service.client.chat.completions.create")
    @patch("app.services.email_drafting_service.load_conversation_history")
    @patch("app.services.email_drafting_service.get_twin_context")
    def test_draft_uses_email_twin_and_prior_email_history(
        self,
        get_twin_context,
        load_history,
        create_completion,
    ):
        get_twin_context.return_value = TwinContext(
            prompt_context="Prefers concise and direct communication.",
            applied=True,
            surface="email",
        )
        load_history.return_value = [
            {"role": "user", "content": "Earlier context"},
            {"role": "assistant", "content": "Earlier draft"},
        ]
        create_completion.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="Subject: Update\n\nDraft body"))]
        )

        result = draft_email(Mock(), "+15555550123", "Share the latest update")

        self.assertEqual(result, "Subject: Update\n\nDraft body")
        get_twin_context.assert_called_once_with(
            ANY,
            "+15555550123",
            surface="email",
            query="Share the latest update",
            limit=8,
        )
        messages = create_completion.call_args.kwargs["messages"]
        self.assertIn("Prefers concise and direct communication.", messages[0]["content"])
        self.assertEqual(messages[-1], {"role": "user", "content": "Share the latest update"})
