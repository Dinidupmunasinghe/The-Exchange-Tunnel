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
    ReactionVerificationError,
    Socks5ProxyConfig,
    TelegramClientManager,
    TelegramClientManagerError,
    TwoFactorRequiredError,
)
from telethon import types as telethon_types  # noqa: E402


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
            return {"ok": True, "phoneCodeHash": phone_code_hash, "sessionString": manager.session_string}

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

        if operation == "leave_channel":
            await manager.leave_channel(channel=str(payload["channel"]))
            return {"ok": True}

        if operation == "react":
            chosen = await manager.react_to_message(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
                reaction=str(payload["reaction"]),
            )
            return {"ok": True, "chosen": bool(chosen)}

        if operation == "verify_reaction":
            chosen = await manager.verify_reaction_chosen(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
                reaction=str(payload["reaction"]),
            )
            return {
                "ok": True,
                "chosen": bool(chosen) if isinstance(chosen, bool) else False,
                "known": isinstance(chosen, bool),
            }

        if operation == "clear_reaction":
            await manager.clear_reaction(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
            )
            return {"ok": True}

        if operation == "reply":
            message = await manager.post_reply(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
                text=str(payload["text"]),
            )
            peer = getattr(message, "peer_id", None)
            chat_id = None
            chat_access_hash = None
            if isinstance(peer, telethon_types.PeerChannel):
                chat_id = f"-100{peer.channel_id}"
                try:
                    entity = await manager._client.get_entity(peer)  # noqa: SLF001
                    chat_access_hash = str(getattr(entity, "access_hash", "") or "")
                except Exception:
                    chat_access_hash = None
            elif isinstance(peer, telethon_types.PeerChat):
                chat_id = f"-{peer.chat_id}"
            elif isinstance(peer, telethon_types.PeerUser):
                chat_id = str(peer.user_id)
            return {"ok": True, "messageId": message.id, "chatId": chat_id, "chatAccessHash": chat_access_hash}

        if operation == "forward_message":
            message = await manager.forward_message(
                from_chat=payload["fromChat"],
                msg_id=int(payload["msgId"]),
                to_chat=payload["toChat"],
            )
            return {"ok": True, "messageId": message.id}

        if operation == "delete_message":
            deleted = await manager.delete_message(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
            )
            return {"ok": True, "deleted": bool(deleted)}

        if operation == "message_exists":
            exists = await manager.message_exists(
                chat=payload["chat"],
                msg_id=int(payload["msgId"]),
            )
            return {"ok": True, "exists": bool(exists)}

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
    except ReactionVerificationError as exc:
        sys.stdout.write(json.dumps({"ok": False, "code": "REACTION_NOT_VERIFIED", "message": str(exc)}))
        return 2
    except TelegramClientManagerError as exc:
        raw = str(exc)
        if raw.startswith("FLOOD_WAIT:"):
            parts = raw.split(":", 2)
            wait_seconds = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
            message = parts[2] if len(parts) > 2 else raw
            sys.stdout.write(
                json.dumps(
                    {
                        "ok": False,
                        "code": "FLOOD_WAIT",
                        "waitSeconds": wait_seconds,
                        "message": message
                    }
                )
            )
            return 2
        sys.stdout.write(json.dumps({"ok": False, "code": "MTPROTO_ERROR", "message": raw}))
        return 2
    except Exception as exc:  # noqa: BLE001
        sys.stdout.write(json.dumps({"ok": False, "code": "BRIDGE_ERROR", "message": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
