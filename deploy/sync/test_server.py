"""Тесты сервера: python3 -m unittest deploy/sync/test_server.py (без сети)."""
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.parse

os.environ["BOT_TOKEN"] = "123:test"
os.environ["DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, os.path.dirname(__file__))
import server  # noqa: E402


def init_data(user: dict, age: int = 0) -> str:
    fields = {"auth_date": str(int(time.time()) - age), "user": json.dumps(user)}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", server.BOT_TOKEN.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(fields)


ADMIN = {"id": 111, "username": "DmKazanskiy", "first_name": "Дмитрий"}
OTHER = {"id": 222, "username": "someone", "first_name": "Ann"}


class Sent(list):
    def __call__(self, method, params, timeout=10):
        self.append((method, params))
        return {"username": "repeat_test_bot"} if method == "getMe" else {}


class ServerTest(unittest.TestCase):
    def setUp(self):
        for p in os.listdir(server.DATA_DIR):
            path = os.path.join(server.DATA_DIR, p)
            if os.path.isfile(path):
                os.remove(path)
        server.META = {"admin": None, "users": {}, "sessions": {}}
        server.SOCIAL = {"profiles": {}, "posts": {}}
        server.logins.clear()
        server.bot_info.update(username=None, polling="on")
        self.sent = Sent()
        server.bot_api = self.sent

    def ident(self, user):
        return {"uid": str(user["id"]), "via": "tg", "user": user}

    def test_init_data(self):
        self.assertEqual(server.verify_init_data(init_data(ADMIN))["id"], 111)
        self.assertIsNone(server.verify_init_data(init_data(ADMIN, age=2 * 86400)))
        self.assertIsNone(server.verify_init_data(init_data(ADMIN) + "x"))

    def test_admin_pinned_by_username_once(self):
        r = server.hello(self.ident(ADMIN), {"platform": "tg:ios"})
        self.assertTrue(r["admin"])
        self.assertEqual(server.META["admin"], "111")
        # Кто-то другой взял тот же юзернейм — админом не становится.
        imposter = {"id": 333, "username": "dmkazanskiy"}
        self.assertFalse(server.hello(self.ident(imposter), {})["admin"])
        self.assertFalse(server.hello(self.ident(OTHER), {})["admin"])

    def test_visits_are_deduplicated(self):
        server.hello(self.ident(OTHER), {"platform": "tg:android"})
        server.hello(self.ident(OTHER), {"platform": "tg:android"})
        self.assertEqual(server.META["users"]["222"]["visits"], 1)
        kinds = [e["e"] for e in server.read_events()]
        self.assertEqual(kinds.count("visit"), 1)
        self.assertIn("new_user", kinds)

    def test_web_login_flow(self):
        start = server.web_login_start()
        self.assertTrue(start["url"].startswith("https://t.me/repeat_test_bot?start=login_"))
        code = start["code"]
        self.assertEqual(server.web_login_poll({"code": code})["status"], "pending")
        server.handle_update({"message": {"text": f"/start login_{code}", "from": OTHER, "chat": {"id": 222}}})
        self.assertEqual(self.sent[-1][0], "sendMessage")
        server.handle_update({"callback_query": {"id": "q", "data": f"ok:{code}", "from": OTHER, "message": {"chat": {"id": 222}, "message_id": 5}}})
        res = server.web_login_poll({"code": code})
        self.assertEqual(res["status"], "ok")
        uid, _ = server.session_uid(res["token"])
        self.assertEqual(uid, "222")
        # Код одноразовый, токен хранится только хэшем.
        self.assertEqual(server.web_login_poll({"code": code})["status"], "expired")
        self.assertNotIn(res["token"], json.dumps(server.META))

    def test_denied_and_blocked(self):
        code = server.web_login_start()["code"]
        server.handle_update({"callback_query": {"id": "q", "data": f"no:{code}", "from": OTHER, "message": {}}})
        self.assertEqual(server.web_login_poll({"code": code})["status"], "denied")
        server.touch_user("222", OTHER)
        server.META["users"]["222"]["blocked"] = True
        code = server.web_login_start()["code"]
        server.handle_update({"callback_query": {"id": "q", "data": f"ok:{code}", "from": OTHER, "message": {}}})
        self.assertEqual(server.web_login_poll({"code": code})["status"], "denied")

    def test_admin_actions_and_delete(self):
        server.hello(self.ident(ADMIN), {})
        server.hello(self.ident(OTHER), {})
        token = server.new_session("222", "web")
        server.sync("222", {"since": 0, "changes": [{"c": "sessions", "id": "s1", "ts": 1, "data": {"secret": "x"}}]})
        ov = server.admin_overview()
        other = next(u for u in ov["users"] if u["id"] == "222")
        self.assertEqual((other["workouts"], other["webSessions"], other["username"]), (1, 1, "someone"))
        self.assertNotIn("secret", json.dumps(ov))
        with self.assertRaises(server.ApiError):
            server.admin_user("111", {"uid": "111", "action": "block"})
        server.admin_user("111", {"uid": "222", "action": "block"})
        self.assertTrue(server.is_blocked("222"))
        self.assertEqual(server.session_uid(token), (None, None))
        server.admin_user("111", {"uid": "222", "action": "delete"})
        self.assertNotIn("222", server.META["users"])
        self.assertFalse(any(e.get("uid") == "222" for e in server.read_events()))


    def test_social_flow(self):
        server.hello(self.ident(ADMIN), {})
        server.hello(self.ident(OTHER), {})
        snap = {"kind": "strength", "title": "Грудь", "date": "2026-11-21", "notes": "секрет", "avgHr": 150,
                "exercises": [{"name": "Жим", "sets": [{"w": 80, "r": 8}]}]}
        # Закрытый профиль публиковать не может; открыть — только с согласием.
        with self.assertRaises(server.ApiError):
            server.publish("222", {"upsert": [{"sid": "s1", "snap": snap}]})
        with self.assertRaises(server.ApiError):
            server.set_profile("222", {"public": True})
        server.set_profile("222", {"public": True, "consent": True, "bio": "бегаю", "acts": ["run", "hack"]})
        self.assertEqual(server.own_profile("222")["acts"], ["run"])
        server.publish("222", {"upsert": [{"sid": "s1", "hash": "h1", "snap": snap}]})
        self.assertEqual(server.published("222")["posts"], {"s1": "h1"})
        f = server.feed("111", {})
        self.assertEqual(len(f["posts"]), 1)
        dump = json.dumps(f)
        self.assertNotIn("секрет", dump)
        self.assertNotIn("150", dump)
        self.assertNotIn("222", dump)  # telegram id наружу не уходит
        post = f["posts"][0]["id"]
        server.like("111", {"post": post, "on": True})
        # Комментировать можно только с открытым профилем.
        with self.assertRaises(server.ApiError):
            server.comment("111", {"post": post, "text": "огонь"})
        server.set_profile("111", {"public": True, "consent": True})
        full = server.comment("111", {"post": post, "text": "огонь"})
        self.assertEqual((full["likes"], len(full["commentList"])), (1, 1))
        # Закрыл профиль — посты пропали из ленты.
        server.set_profile("222", {"public": False})
        self.assertEqual(server.feed("111", {})["posts"], [])
        server.set_profile("222", {"public": True, "consent": True})
        server.publish("222", {"upsert": [{"sid": "s1", "hash": "h1", "snap": snap}]})
        # Удаление аккаунта стирает соцданные.
        server.delete_account("111")
        p = server.feed("222", {})["posts"][0]
        self.assertEqual((p["likes"], p["comments"]), (0, 0))


if __name__ == "__main__":
    unittest.main()
