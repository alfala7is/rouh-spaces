#!/usr/bin/env python3
"""
Startup validation script for AI service dependencies.
Run this to verify all dependencies are properly installed and compatible.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traceback

def test_imports():
    """Test all critical imports."""
    print("Testing imports...")

    try:
        import fastapi
        print(f"✅ FastAPI {fastapi.__version__}")
    except ImportError as e:
        print(f"❌ FastAPI import failed: {e}")
        return False

    try:
        import pydantic
        print(f"✅ Pydantic {pydantic.__version__}")
        # Test new validators
        from pydantic import field_validator, model_validator
        print("✅ Pydantic v2 validators available")
    except ImportError as e:
        print(f"❌ Pydantic import failed: {e}")
        return False

    try:
        import guardrails as gd
        print(f"✅ Guardrails available")
    except ImportError:
        print("⚠️  Guardrails not available (will use fallback)")

    try:
        import openai
        print(f"✅ OpenAI {openai.__version__}")
    except ImportError as e:
        print(f"❌ OpenAI import failed: {e}")
        return False

    return True

def test_template_models():
    """Test template model validation."""
    print("\nTesting template models...")

    try:
        from template_models import (
            CoordinationTemplateModel, TemplateRoleModel, TemplateStateModel,
            TemplateSlotModel, CoordinationPatternModel, CoordinationPhaseModel,
            CoordinationCommitModel, CoordinationEvidenceModel, CoordinationConfirmModel,
            CoordinationStateType, SlotType, ProcessComplexity, TemplateCategory
        )
        print("✅ Template models imported successfully")

        # Test basic model creation
        role = TemplateRoleModel(
            name="test_role",
            description="Test role",
            capabilities=["create", "read"]
        )
        print("✅ Template role validation works")

        # Test root model validation with minimal valid template
        try:
            # Create coordination pattern
            pattern = CoordinationPatternModel(
                express=CoordinationPhaseModel(),
                explore=CoordinationPhaseModel(),
                commit=CoordinationCommitModel(),
                evidence=CoordinationEvidenceModel(),
                confirm=CoordinationConfirmModel()
            )

            # Create a minimal valid state
            state = TemplateStateModel(
                name="initial_state",
                type=CoordinationStateType.collect,
                description="Initial state for testing",
                sequence=0
            )

            # Create a minimal slot
            slot = TemplateSlotModel(
                name="testSlot",
                type=SlotType.text,
                description="Test slot"
            )

            # Create a minimal valid coordination template
            template = CoordinationTemplateModel(
                name="Test Template",
                description="A test coordination template with minimal valid configuration",
                schemaJson=pattern,
                roles=[role],
                states=[state],
                slots=[slot]
            )

            print("✅ Root model validation works - CoordinationTemplateModel created successfully")
            print(f"✅ Template has {len(template.roles)} role(s), {len(template.states)} state(s), {len(template.slots)} slot(s)")

        except Exception as template_error:
            print(f"❌ Root model validation failed: {template_error}")
            traceback.print_exc()
            return False

        return True
    except Exception as e:
        print(f"❌ Template model test failed: {e}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("AI Service Dependency Validation")
    print("=" * 40)

    success = True
    success &= test_imports()
    success &= test_template_models()

    print("\n" + "=" * 40)
    if success:
        print("✅ All tests passed! AI service should start successfully.")
        sys.exit(0)
    else:
        print("❌ Some tests failed. Check dependencies and fix issues.")
        sys.exit(1)