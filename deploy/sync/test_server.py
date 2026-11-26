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
        server.SOCIAL = {"profiles": {}, "posts": {}, "follows": {}, "photos": {}}
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
        # Фото: прикрепить к посту можно только своё.
        import base64
        jpeg = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"0" * 100).decode()
        mine = server.upload_photo("222", {"data": jpeg, "w": 1080, "h": 1350})
        theirs = server.upload_photo("111", {"data": jpeg, "w": 10, "h": 10})
        snap2 = dict(snap, photos=[{"id": mine["id"]}, {"id": theirs["id"]}])
        server.publish("222", {"upsert": [{"sid": "s1", "hash": "h2", "snap": snap2}]})
        photos = server.feed("111", {})["posts"][0]["snap"]["photos"]
        self.assertEqual([p["id"] for p in photos], [mine["id"]])
        self.assertEqual(photos[0]["h"], 1350)
        self.assertIsNotNone(server.serve_photo(mine["id"]))
        # Подписка: только на открытый профиль, наружу — числа.
        anna = server.own_profile("222")["pid"]
        pr = server.follow("111", {"pid": anna, "on": True})
        self.assertEqual((pr["followers"], pr["followed"]), (1, True))
        with self.assertRaises(server.ApiError):
            server.follow("111", {"pid": server.own_profile("111")["pid"], "on": True})
        # Удаление аккаунта стирает соцданные.
        server.delete_account("111")
        p = server.feed("222", {})["posts"][0]
        self.assertEqual((p["likes"], p["comments"]), (0, 0))
        self.assertEqual(server.public_profile("222", anna)["followers"], 0)
        self.assertIsNone(server.serve_photo(theirs["id"]))

    def test_agent_key_mcp_and_inbox(self):
        agent = server.agent
        server.hello(self.ident(ADMIN), {})
        server.sync("111", {"since": 0, "changes": [
            {"c": "sessions", "id": "s1", "ts": 1, "data": {"id": "s1", "date": "2026-11-20", "kind": "strength", "notes": "секрет",
             "mood": {"x": 0.1, "y": 0.9}, "startedAt": "2026-11-20T10:00:00Z", "endedAt": "2026-11-20T11:00:00Z",
             "exercises": [{"exerciseId": "base:Жим штанги лёжа", "sets": [{"weight": 60, "reps": 10, "warmup": True, "done": True}, {"weight": 90, "reps": 8, "done": True}]}]}},
        ]})
        ro = agent.create_key("111", {"name": "Чтение", "scope": "read"})["token"]
        rw = agent.create_key("111", {"name": "Claude Code", "scope": "write"})["token"]
        self.assertTrue(ro.startswith("rpk_"))
        # Без токена — 401 с адресом метаданных OAuth.
        code, hdr, _ = agent.handle_mcp("", {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        self.assertEqual(code, 401)
        self.assertIn("oauth-protected-resource", hdr["WWW-Authenticate"])
        code, _, res = agent.handle_mcp("Bearer " + rw, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})
        self.assertEqual((code, res["result"]["protocolVersion"]), (200, "2025-06-18"))
        self.assertEqual(agent.handle_mcp("Bearer " + rw, {"jsonrpc": "2.0", "method": "notifications/initialized"})[0], 202)
        names = [t["name"] for t in agent.handle_mcp("Bearer " + ro, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})[2]["result"]["tools"]]
        self.assertNotIn("submit_plan", names)  # ключ «только чтение» писать не может
        _, _, res = agent.handle_mcp("Bearer " + ro, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "list_workouts", "arguments": {"from": "2026-11-01", "to": "2026-11-30"}}})
        text = res["result"]["content"][0]["text"]
        data = json.loads(text)
        self.assertEqual(data["workouts"][0]["exercises"][0]["exercise"], "Жим штанги лёжа")
        self.assertNotIn("секрет", text)
        self.assertNotIn("mood", text)
        ctx = json.loads(agent.call_tool({"uid": "111", "scope": "read"}, "get_context", {})["content"][0]["text"])
        self.assertIn("today", ctx)
        # Запись: ошибки формата видны сразу, правильный план — во «входящие».
        _, _, bad = agent.handle_mcp("Bearer " + rw, {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "submit_plan", "arguments": {"plan": {"format": "repeat-plan"}}}})
        self.assertTrue(bad["result"]["isError"])
        plan = {"format": "repeat-plan", "version": 1, "name": "Тест", "start": "2026-11-30",
                "days": [{"date": "2026-11-30", "sessions": [{"slot": "morning", "kind": "cardio", "cardioKind": "run", "durationMin": 30}]}]}
        _, _, ok = agent.handle_mcp("Bearer " + rw, {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "submit_plan", "arguments": {"plan": plan, "note": "на декабрь"}}})
        self.assertFalse(ok["result"].get("isError"))
        pulled = server.sync("111", {"since": 0, "changes": []})["changes"]
        inbox = [c for c in pulled if c["c"] == "inbox"]
        self.assertEqual(len(inbox), 1)
        self.assertEqual((inbox[0]["data"]["type"], inbox[0]["data"]["source"], inbox[0]["data"]["note"]), ("plan", "Claude Code", "на декабрь"))
        with self.assertRaises(server.ApiError):
            agent.submit({"uid": "111", "scope": "read", "name": "x"}, "plan", plan)
        # Отзыв ключа — сразу без доступа.
        gid = [g["id"] for g in agent.list_grants("111")["grants"] if g["name"] == "Claude Code"][0]
        agent.revoke("111", {"id": gid})
        self.assertEqual(agent.handle_mcp("Bearer " + rw, {"jsonrpc": "2.0", "id": 6, "method": "ping"})[0], 401)
        with self.assertRaises(server.ApiError):
            agent.revoke("222", {"id": [g["id"] for g in agent.list_grants("111")["grants"]][0]})

    def test_agent_oauth_flow(self):
        import base64
        agent = server.agent
        server.hello(self.ident(ADMIN), {})
        meta = agent.auth_server_meta()
        self.assertTrue(meta["token_endpoint"].endswith("/api/oauth/token"))
        code, client = agent.register_client({"client_name": "Claude", "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"]})
        self.assertEqual(code, 201)
        self.assertEqual(agent.register_client({"redirect_uris": ["javascript:alert(1)"]})[0], 400)
        verifier = "v" * 50
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        q = {"client_id": client["client_id"], "redirect_uri": "https://claude.ai/api/mcp/auth_callback", "response_type": "code",
             "code_challenge": challenge, "code_challenge_method": "S256", "state": "xyz", "scope": "read write"}
        status, page = agent.authorize_page({k: [v] for k, v in q.items()})
        self.assertEqual(status, 200)
        self.assertIn("Claude", page)
        self.assertEqual(agent.authorize_page({**{k: [v] for k, v in q.items()}, "redirect_uri": ["https://evil.example/cb"]})[0], 400)
        redirect = agent.approve("111", {**q, "write": True})["redirect"]
        parsed = urllib.parse.parse_qs(urllib.parse.urlsplit(redirect).query)
        self.assertEqual(parsed["state"], ["xyz"])
        form = {"grant_type": "authorization_code", "code": parsed["code"][0], "redirect_uri": q["redirect_uri"], "client_id": client["client_id"]}
        self.assertEqual(agent.token({**form, "code_verifier": "wrong"}, "")[0], 400)
        # Код одноразовый: после неудачной попытки — новый.
        redirect = agent.approve("111", {**q, "write": True})["redirect"]
        form["code"] = urllib.parse.parse_qs(urllib.parse.urlsplit(redirect).query)["code"][0]
        code, tok = agent.token({**form, "code_verifier": verifier}, "")
        self.assertEqual((code, tok["scope"]), (200, "write"))
        self.assertEqual(agent.token({**form, "code_verifier": verifier}, "")[0], 400)
        code, _, res = agent.handle_mcp("Bearer " + tok["access_token"], {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        self.assertIn("submit_workouts", [t["name"] for t in res["result"]["tools"]])
        code, tok2 = agent.token({"grant_type": "refresh_token", "refresh_token": tok["refresh_token"], "client_id": client["client_id"]}, "")
        self.assertEqual(code, 200)
        self.assertEqual(agent.handle_mcp("Bearer " + tok["access_token"], {"jsonrpc": "2.0", "id": 2, "method": "ping"})[0], 401)
        self.assertEqual(agent.handle_mcp("Bearer " + tok2["access_token"], {"jsonrpc": "2.0", "id": 2, "method": "ping"})[0], 200)
        grants = agent.list_grants("111")["grants"]
        self.assertEqual([(g["kind"], g["name"]) for g in grants], [("oauth", "Claude")])
        # Удаление аккаунта убирает и доступы ИИ.
        server.delete_account("111")
        self.assertEqual(agent.handle_mcp("Bearer " + tok2["access_token"], {"jsonrpc": "2.0", "id": 3, "method": "ping"})[0], 401)


if __name__ == "__main__":
    unittest.main()
