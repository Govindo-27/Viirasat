"""
Automated unit & integration tests for Virasat Flask Backend.
Run with:
    python -m unittest test_virasat.py
"""
import unittest
import json
from app import app


class VirasatBackendTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_status_endpoint(self):
        """Test the system status and health check."""
        response = self.app.get("/api/status")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data.get("status"), "online")
        self.assertIn("archiveEntries", data)
        self.assertIn("aiCurator", data)

    def test_list_contributions(self):
        """Test retrieving contributions with default seed entries."""
        response = self.app.get("/api/contributions")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("success"))
        self.assertGreaterEqual(data.get("count", 0), 1)

    def test_filter_by_category(self):
        """Test filtering contributions by category."""
        response = self.app.get("/api/contributions?category=Oral Histories")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        for item in data.get("data", []):
            self.assertEqual(item.get("category").lower(), "oral histories")

    def test_search_by_keyword(self):
        """Test searching traditions by keyword."""
        response = self.app.get("/api/contributions?q=Kutch")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("success"))
        found = any("kutch" in item.get("title", "").lower() or "kutch" in item.get("region", "").lower() for item in data.get("data", []))
        self.assertTrue(found)

    def test_preserve_validation_missing_consent(self):
        """Test that submission fails if consent notice is not accepted."""
        payload = {
            "title": "Folk Lullaby of the Sahyadri",
            "originalLanguage": "Marathi",
            "category": "Stories",
            "region": "Satara, Maharashtra",
            "originalText": "This is a sacred lullaby sung during harvest moon...",
            "consentGiven": False,
        }
        response = self.app.post("/api/contributions", json=payload)
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("consent", data.get("error", "").lower())

    def test_preserve_validation_short_text(self):
        """Test that submission fails if story text is too short."""
        payload = {
            "title": "Short Note",
            "originalLanguage": "Hindi",
            "category": "Recipes",
            "originalText": "Too short",
            "consentGiven": True,
        }
        response = self.app.post("/api/contributions", json=payload)
        self.assertEqual(response.status_code, 400)

    def test_ask_archive_fallback_on_unknown(self):
        """Test that Ask the Archive declares missing info when question is out of scope."""
        payload = {
            "question": "What is the orbital speed of the International Space Station?"
        }
        response = self.app.post("/api/ask", json=payload)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        answer = data.get("answer", "")
        self.assertTrue(
            "not present" in answer.lower() or "virasat" in answer.lower(),
            f"Expected archive disclaimer, got: {answer}"
        )


if __name__ == "__main__":
    unittest.main()
