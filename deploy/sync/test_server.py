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
        # Повтор того же документа и повтор по idempotencyKey — без второго «входящего».
        w = {"uid": "111", "scope": "write", "name": "Claude Code"}
        again = agent.submit(w, "plan", plan, "на декабрь")
        self.assertTrue(again["duplicate"])
        wk = [{"date": "2026-12-01", "kind": "cardio", "cardioKind": "run", "done": True, "durationMin": 30}]
        first = agent.submit(w, "workout", wk, None, "run-1")
        server.sync("111", {"since": 0, "changes": [{"c": "inbox", "id": first["inboxId"], "ts": 10**13, "data": None}]})
        repeat = agent.submit(w, "workout", wk, None, "run-1")
        self.assertEqual((repeat["inboxId"], repeat.get("duplicate")), (first["inboxId"], True))
        pending = [c for c in server.sync("111", {"since": 0, "changes": []})["changes"] if c["c"] == "inbox" and c["data"]]
        self.assertEqual(len(pending), 1)
        # archive_plan: только активный план, по id или точному названию; дубль просьбы не создаётся.
        server.sync("111", {"since": 0, "changes": [
            {"c": "plans", "id": "p1", "ts": 1, "data": {"id": "p1", "name": "Гибрид: декабрь 2026", "start": "2026-11-30", "end": "2026-12-27"}},
            {"c": "plans", "id": "p2", "ts": 1, "data": {"id": "p2", "name": "Гибрид: декабрь 2026 (v2)", "start": "2026-11-30", "end": "2026-12-27"}},
        ]})
        miss = agent.submit_archive(w, None, "нет такого")
        self.assertFalse(miss["ok"])
        self.assertEqual(len(miss["activePlans"]), 2)
        ok = agent.submit_archive(w, None, "гибрид: декабрь 2026", "дубль")
        self.assertTrue(ok["ok"])
        self.assertTrue(agent.submit_archive(w, "p1")["duplicate"])
        item = [c for c in server.sync("111", {"since": 0, "changes": []})["changes"] if c["c"] == "inbox" and c["id"] == ok["inboxId"]][0]["data"]
        self.assertEqual((item["type"], item["payload"]["planId"]), ("archive_plan", "p1"))
        # submit_checkin: числа вне диапазона отбрасываются, повтор не плодится.
        ck = agent.submit_checkin(w, [{"date": "2026-11-26", "hrvMs": 44, "restingHr": 55, "sleepMin": 412}, {"date": "2026-11-25", "hrvMs": 999}])
        self.assertEqual((ck["ok"], ck["days"]), (True, 1))
        self.assertIn("skipped", ck)
        self.assertTrue(agent.submit_checkin(w, [{"date": "2026-11-26", "hrvMs": 44, "restingHr": 55, "sleepMin": 412}])["duplicate"])
        self.assertFalse(agent.submit_checkin(w, [])["ok"])
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

    def test_morning_summary(self):
        morning = server.morning
        server.hello(self.ident(ADMIN), {})
        day = morning.local_now().date()
        days = {}
        for i in range(1, 21):
            d = (day - __import__("datetime").timedelta(days=i)).isoformat()
            days[d] = {"date": d, "hrvMs": 60, "restingHr": 48, "sleepMin": 450}
        y = (day - __import__("datetime").timedelta(days=1)).isoformat()
        days[y]["hrvMs"] = 50
        days[day.isoformat()] = {"date": day.isoformat(), "hrvMs": 51, "restingHr": 49, "sleepMin": 400, "sleepScore": 70}
        morning.collect = lambda d, back=30: {"days": days, "garmin": {"status": "LOW"}}
        morning.configured = lambda: True
        morning.night_ready = lambda d: True
        server.sync("111", {"since": 0, "changes": [
            {"c": "plans", "id": "p", "ts": 1, "data": {"id": "p", "name": "План", "start": "2026-01-01", "end": "2027-01-01"}},
            {"c": "plannedSessions", "id": "c", "ts": 1, "data": {"id": "c", "planId": "p", "date": day.isoformat(), "time": "05:45", "kind": "strength", "title": "Зал Б", "status": "planned"}},
        ]})
        sent = []
        server.bot_api = lambda m, p, timeout=10: sent.append(p) or {}
        r = morning.run("111")
        self.assertEqual(r["status"], "sent")
        self.assertTrue(r["summary"]["overreach"])
        text = sent[0]["text"]
        self.assertIn("день полегче", text)
        self.assertIn("05:45 Зал Б", text)
        self.assertIn("заменить дорожкой", text)
        # Второй запуск в тот же день — без повтора; без цифр — цифр нет.
        self.assertEqual(morning.run("111")["status"], "already_sent")
        server.sync("111", {"since": 0, "changes": [{"c": "settings", "id": "morning", "ts": 2, "data": {"telegram": True, "hideNumbers": True}}]})
        morning.run("111", force=True)
        self.assertNotIn("HRV", sent[-1]["text"])
        inbox = [c for c in server.sync("111", {"since": 0, "changes": []})["changes"] if c["c"] == "inbox" and c["data"]]
        self.assertEqual(inbox[0]["data"]["type"], "checkin")
        self.assertEqual(len(inbox[0]["data"]["payload"]["days"]), 21)  # первый раз — месяц для нормы
        # Heartbeat: окно закрылось без отправки — одна строка «часы не синхронизировались», не чаще раза в день.
        server.META["morning"]["111"]["date"] = "2000-01-01"
        real_now = morning.local_now
        late = real_now().replace(hour=11, minute=5)
        morning.local_now = lambda: late
        try:
            before = len(sent)
            morning.tick()
            morning.tick()
            self.assertEqual(len(sent), before + 1)
            self.assertIn("не отдали ночь", sent[-1]["text"])
        finally:
            morning.local_now = real_now

    def test_details_enrich_from_fit(self):
        import base64, struct
        agent = server.agent
        server.hello(self.ident(ADMIN), {})
        server.sync("111", {"since": 0, "changes": [{"c": "sessions", "id": "s1", "ts": 1, "data": {"id": "s1", "date": "2026-11-25", "kind": "cardio"}}]})

        def defn(local, num, fields):
            b = bytes([0x40 | local, 0, 0]) + struct.pack("<HB", num, len(fields))
            return b + b"".join(bytes([f, size, bt]) for f, size, bt in fields)

        T0 = 1100000000
        body = b""
        body += defn(0, 20, [(253, 4, 0x86), (5, 4, 0x86), (3, 1, 0x02), (0, 4, 0x85), (1, 4, 0x85)])
        for i in range(0, 1300, 10):  # 13 км за 1300 с, пауза 600–700
            if 600 < i < 700:
                continue
            body += bytes([0]) + struct.pack("<IIBii", T0 + i, i * 1000, 150, int(55.75 / 180 * 2**31), int(37.6 / 180 * 2**31))
        body += defn(1, 21, [(253, 4, 0x86), (0, 1, 0x00), (1, 1, 0x00)])
        body += bytes([1]) + struct.pack("<IBB", T0 + 600, 0, 1) + bytes([1]) + struct.pack("<IBB", T0 + 700, 0, 0)
        body += defn(2, 19, [(2, 4, 0x86), (7, 4, 0x86), (8, 4, 0x86), (9, 4, 0x86), (15, 1, 0x02)])
        body += bytes([2]) + struct.pack("<IIIIB", T0, 1290000, 1190000, 1290000, 150)
        body += defn(3, 18, [(2, 4, 0x86), (7, 4, 0x86), (8, 4, 0x86), (9, 4, 0x86), (16, 1, 0x02), (17, 1, 0x02), (5, 1, 0x00)])
        body += bytes([3]) + struct.pack("<IIIIBBB", T0, 1290000, 1190000, 1290000, 150, 170, 1)
        fit = struct.pack("<BBHI4s", 12, 0x20, 2100, len(body), b".FIT") + body + b"\x00\x00"

        w = {"uid": "111", "scope": "write", "name": "Claude"}
        self.assertFalse(server.details.enrich(w, {"source": "coros", "externalActivityId": 482013868569166128})["ok"])  # ID — только строкой
        args = {"source": "coros", "externalActivityId": "482013868569166128", "sportType": 100,
                "summary": {"trainingLoad": 199, "aerobicTE": 3.3, "anaerobicTE": 3.5, "elapsedSec": 5485, "bogus": 1},
                "laps": [{"group": "recorded", "index": 1, "distanceM": 0.0, "timerSec": 1.98, "avgHr": 107}],
                "fitBase64": base64.b64encode(fit).decode()}
        r = server.details.enrich(w, args)
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["level"], "streams")
        doc = server.details.load("111", "coros", "482013868569166128")
        self.assertEqual(doc["summary"]["timerSec"], 1190)       # из FIT
        self.assertEqual(doc["summary"]["elapsedSec"], 5485)     # сводка источника поверх FIT
        self.assertEqual(doc["summary"]["trainingLoad"], 199)
        self.assertNotIn("bogus", doc["summary"])
        self.assertEqual(doc["pauses"], [[600, 700]])
        self.assertEqual([lp["group"] for lp in doc["laps"] if lp["group"] == "recorded"], ["recorded"])  # круги источника заменили FIT-круги
        km = [lp for lp in doc["laps"] if lp["group"] == "km"]
        self.assertTrue(km and all(lp["timerSec"] < 200 for lp in km))  # отрезки по активному времени, пауза не внутри
        self.assertAlmostEqual(doc["streams"]["lat"][0], 55.75, places=4)
        # Повтор того же — один документ и одно «входящее»; чужой не видит.
        server.details.enrich(w, args)
        inbox = [c for c in server.sync("111", {"since": 0, "changes": []})["changes"] if c["c"] == "inbox" and c["data"] and c["data"]["type"] == "enrich"]
        self.assertEqual(len(inbox), 1)
        self.assertIsNone(server.details.load("222", "coros", "482013868569166128"))
        # Очередь: связанная тренировка уже с рядами, лимит FIT уменьшился.
        server.sync("111", {"since": 0, "changes": [
            {"c": "sessions", "id": "s2", "ts": 5, "data": {"id": "s2", "date": "2026-11-26", "kind": "cardio", "source": {"provider": "coros", "externalId": "999"}}},
            {"c": "sessions", "id": "s3", "ts": 5, "data": {"id": "s3", "date": "2026-11-24", "kind": "cardio", "source": {"provider": "coros", "externalId": "482013868569166128"}}},
        ]})
        q = server.details.queue("111")
        self.assertEqual((q["total"], q["counts"]["streams"], q["counts"]["none"]), (2, 1, 1))
        self.assertEqual(q["next"]["fit"][0]["externalActivityId"], "999")
        self.assertEqual(q["fitLeftToday"], 43)  # два FIT за сутки
        # Ссылка на FIT — только https и хранилища источника.
        bad = server.details.enrich(w, {"source": "coros", "externalActivityId": "1", "summary": {"timerSec": 10}, "fitUrl": "http://127.0.0.1/x.fit"})
        self.assertIn("warnings", bad)
        server.delete_account("111")
        self.assertIsNone(server.details.load("111", "coros", "482013868569166128"))

    def test_garmin_auto_import(self):
        morning = server.morning
        server.hello(self.ident(ADMIN), {})
        server.sync("111", {"since": 0, "changes": [{"c": "sessions", "id": "x", "ts": 1, "data": {"id": "x", "date": "2026-11-20", "kind": "cardio"}}]})
        acts = [{"activityId": 25190042001, "activityName": "Убуд Бег", "startTimeLocal": "2026-11-25 06:02:59",
                 "activityType": {"typeKey": "running"}, "distance": 5009.97, "duration": 2355.7, "movingDuration": 2079.9, "averageHR": 151, "calories": 478},
                {"activityId": 7, "activityName": None, "startTimeLocal": "2026-11-25 18:00:00", "activityType": {"typeKey": "walking"}, "duration": 1800}]
        morning.garmin_get = lambda path, params=None: acts
        def no_fit(path):
            raise RuntimeError("offline")
        morning.garmin_raw = no_fit
        r = morning.import_new("111")
        self.assertEqual(r["added"], ["25190042001", "7"])
        inbox = [c["data"] for c in server.sync("111", {"since": 0, "changes": []})["changes"] if c["c"] == "inbox" and c["data"]]
        self.assertEqual(len(inbox), 1)  # один день — одна пачка
        ws = {w["source"]["externalId"]: w for w in inbox[0]["payload"]["workouts"]}
        run = ws["25190042001"]
        self.assertEqual((run["kind"], run["cardioKind"], run["time"], run["summary"]["distanceM"], run["summary"]["movingSec"]), ("cardio", "run", "06:02", 5009.97, 2079.9))
        walk = ws["7"]
        self.assertEqual(walk["cardioKind"], "Прогулка")
        self.assertEqual(morning.import_new("111")["added"], [])  # уже видели — без повтора


if __name__ == "__main__":
    unittest.main()
