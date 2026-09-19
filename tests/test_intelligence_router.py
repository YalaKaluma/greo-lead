import os
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.routers.intelligence import model_section  # noqa: E402


def test_model_section_routes_the_broader_user_model():
    assert model_section(SimpleNamespace(object_type="intent", claim_type="goal")) == "direction"
    assert model_section(SimpleNamespace(object_type="state", claim_type="state")) == "current_context"
    assert model_section(SimpleNamespace(object_type="pattern", claim_type="pattern")) == "how_i_operate"
    assert model_section(SimpleNamespace(object_type="relationship", claim_type="relationship")) == "relationships"
    assert model_section(SimpleNamespace(object_type="capability", claim_type="strength")) == "growth"
