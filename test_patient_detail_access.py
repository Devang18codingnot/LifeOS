import unittest
from bson import ObjectId

import app as app_module


class PatientDetailAccessTest(unittest.TestCase):
    def setUp(self):
        app_module.app.config["TESTING"] = True
        self.client = app_module.app.test_client()

        self.user_id = ObjectId()
        self.other_user_id = ObjectId()
        self.authority_user_id = ObjectId()
        self.report_id = str(ObjectId())
        self.report_data = {
            "_id": ObjectId(self.report_id),
            "user_id": self.user_id,
            "status": "in_danger",
            "patient_details": {
                "name": "Jane Doe",
                "condition": "Severe dehydration",
                "notes": "Needs urgent care"
            }
        }

        def fake_find_one(query, *args, **kwargs):
            user_map = {
                str(self.user_id): {"_id": self.user_id, "email": "owner@example.com"},
                str(self.other_user_id): {"_id": self.other_user_id, "email": "other@example.com"},
                str(self.authority_user_id): {"_id": self.authority_user_id, "email": "authority@example.com"},
            }
            return user_map.get(str(query.get("_id")))

        app_module.client = object()
        app_module.db = object()
        app_module.users = type("UsersStub", (), {"find_one": staticmethod(fake_find_one)})()
        app_module.AUTHORITY_EMAILS = {"authority@example.com"}

        class ReportsStub:
            @staticmethod
            def find_one(query):
                if query.get("_id") == ObjectId(self.report_id):
                    return self.report_data
                return None

        app_module.reports = ReportsStub()

    def test_owner_can_fetch_patient_details(self):
        with self.client.session_transaction() as sess:
            sess["user_id"] = str(self.user_id)

        response = self.client.get(f"/api/reports/{self.report_id}/patient-details")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["patient_details"]["name"], "Jane Doe")

    def test_authority_can_fetch_patient_details(self):
        with self.client.session_transaction() as sess:
            sess["user_id"] = str(self.authority_user_id)

        response = self.client.get(f"/api/reports/{self.report_id}/patient-details")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["patient_details"]["condition"], "Severe dehydration")

    def test_non_owner_and_non_authority_cannot_fetch_patient_details(self):
        with self.client.session_transaction() as sess:
            sess["user_id"] = str(self.other_user_id)

        response = self.client.get(f"/api/reports/{self.report_id}/patient-details")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
