from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_SRC = Path(__file__).resolve().parents[1]
if str(PROJECT_SRC) not in sys.path:
    sys.path.insert(0, str(PROJECT_SRC))

from config.telegram_integration_service import (  # noqa: E402
    Socks5ProxyConfig,
    TelegramClientManager,
    TelegramClientManagerError,
    TwoFactorRequiredError,
)


def _proxy_from_payload(payload: dict[str, Any]) -> Socks5ProxyConfig | None:
    proxy = payload.get("proxy")
    if not isinstance(proxy, dict):
        return None
    host = proxy.get("host")
    port = proxy.get("port")
    if not host or not port:
        return None
    return Socks5ProxyConfig(
        host=str(host),
        port=int(port),
        username=str(proxy["username"]) if proxy.get("username") else None,
        password=str(proxy["password"]) if proxy.get("password") else None,
    )


async def _run(operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    manager = TelegramClientManager(
        api_id=int(payload["apiId"]),
        api_hash=str(payload["apiHash"]),
        session_string=str(payload["sessionString"]) if payload.get("sessionString") else None,
        proxy=_proxy_from_payload(payload),
    )
    async with manager:
        if operation == "send_code":
            phone_code_hash = await manager.send_code_request(phone=str(payload["phone"]))
            return {"ok": True, "phoneCodeHash": phone_code_hash}

        if operation == "sign_in":
            try:
                user = await manager.sign_in(
                    phone=str(payload["phone"]),
                    phone_code=str(payload["phoneCode"]),
                    phone_code_hash=str(payload["phoneCodeHash"]) if payload.get("phoneCodeHash") else None,
                )
                return {
                    "ok": True,
                    "requires2fa": False,
                    "sessionString": manager.session_string,
                    "user": {"id": user.id, "username": user.username, "phone": user.phone},
                }
            except TwoFactorRequiredError:
                return {
                    "ok": False,
                    "requires2fa": True,
                    "sessionString": manager.session_string,
                }

        if operation == "sign_in_password":
            user = await manager.sign_in_with_password(password=str(payload["password"]))
            return {
                "ok": True,
                "sessionString": manager.session_string,
                "user": {"id": user.id, "username": user.username, "phone": user.phone},
            }

        if operation == "join_channel":
            await manager.join_channel(channel=str(payload["channel"]))
            return {"ok": True}

        if operation == "react":
            chosen = await manager.react_to_message(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
                reaction=str(payload["reaction"]),
            )
            return {"ok": True, "chosen": bool(chosen)}

        if operation == "reply":
            message = await manager.post_reply(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
                text=str(payload["text"]),
            )
            return {"ok": True, "messageId": message.id}

        raise TelegramClientManagerError(f"Unsupported operation: {operation}")


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("Missing operation argument\n")
        return 1

    operation = sys.argv[1]
    raw_payload = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        sys.stderr.write("Invalid JSON payload\n")
        return 1

    try:
        result = asyncio.run(_run(operation, payload))
        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
