from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from telethon import TelegramClient, functions, types, utils
from telethon.errors import (
    FloodWaitError,
    RPCError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession

logger = logging.getLogger(__name__)


class TelegramClientManagerError(Exception):
    """Base exception for TelegramClientManager failures."""


class TwoFactorRequiredError(TelegramClientManagerError):
    """Raised when Telegram account requires 2FA password."""


class ReactionVerificationError(TelegramClientManagerError):
    """Raised when a sent reaction cannot be verified as chosen."""


@dataclass(slots=True, frozen=True)
class Socks5ProxyConfig:
    host: str
    port: int
    username: str | None = None
    password: str | None = None


class TelegramClientManager:
    """
    Async manager for user-authorized Telegram account synchronization.

    - Uses `StringSession` for DB-friendly session serialization.
    - Supports SOCKS5 proxy isolation per client.
    - Implements login handshake, interaction APIs, and reaction verification.
    - Enforces a 5-second delay between all write operations.
    """

    WRITE_OPERATION_DELAY_SECONDS = 5.0
    REACTION_VERIFY_RETRIES = 6
    REACTION_VERIFY_DELAY_SECONDS = 0.6

    def __init__(
        self,
        api_id: int,
        api_hash: str,
        *,
        session_string: str | None = None,
        proxy: Socks5ProxyConfig | None = None,
        request_retries: int = 3,
        connection_retries: int = 3,
        timeout_seconds: int = 10,
    ) -> None:
        self._api_id = api_id
        self._api_hash = api_hash
        self._proxy = proxy

        self._write_lock = asyncio.Lock()
        self._last_write_monotonic: float | None = None
        self._phone_code_hash: dict[str, str] = {}

        self._client = TelegramClient(
            session=StringSession(session_string or ""),
            api_id=self._api_id,
            api_hash=self._api_hash,
            proxy=self._build_proxy_tuple(proxy),
            request_retries=request_retries,
            connection_retries=connection_retries,
            timeout=timeout_seconds,
        )

    @staticmethod
    def _build_proxy_tuple(
        proxy: Socks5ProxyConfig | None,
    ) -> tuple[Any, str, int, bool, Optional[str], Optional[str]] | None:
        if proxy is None:
            return None

        try:
            import socks  # type: ignore
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise TelegramClientManagerError(
                "PySocks is required for SOCKS5 support. Install with `pip install pysocks`."
            ) from exc

        return (
            socks.SOCKS5,
            proxy.host,
            proxy.port,
            True,  # rdns enabled for better isolation
            proxy.username,
            proxy.password,
        )

    async def connect(self) -> None:
        if not self._client.is_connected():
            await self._client.connect()

    async def disconnect(self) -> None:
        if self._client.is_connected():
            await self._client.disconnect()

    async def __aenter__(self) -> TelegramClientManager:
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.disconnect()

    @property
    def session_string(self) -> str:
        """Return serialized `StringSession` suitable for DB storage."""
        return self._client.session.save()

    async def is_authorized(self) -> bool:
        await self.connect()
        return await self._client.is_user_authorized()

    async def _enforce_write_delay(self) -> None:
        async with self._write_lock:
            now = time.monotonic()
            if self._last_write_monotonic is not None:
                elapsed = now - self._last_write_monotonic
                remaining = self.WRITE_OPERATION_DELAY_SECONDS - elapsed
                if remaining > 0:
                    await asyncio.sleep(remaining)
            self._last_write_monotonic = time.monotonic()

    async def send_code_request(self, phone: str) -> str:
        """
        Request login code from Telegram and store phone_code_hash.

        Returns:
            phone_code_hash used by sign_in.
        """
        await self.connect()
        await self._enforce_write_delay()
        try:
            code = await self._client.send_code_request(phone=phone)
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"send_code_request failed: {exc}") from exc
        self._phone_code_hash[phone] = code.phone_code_hash
        return code.phone_code_hash

    async def sign_in(
        self,
        phone: str,
        phone_code: str,
        *,
        phone_code_hash: str | None = None,
    ) -> types.User:
        """
        Sign in with phone code.

        Raises:
            TwoFactorRequiredError: account is protected by 2FA password.
        """
        await self.connect()
        await self._enforce_write_delay()

        resolved_hash = phone_code_hash or self._phone_code_hash.get(phone)
        if not resolved_hash:
            raise TelegramClientManagerError(
                "phone_code_hash is required. Call send_code_request first or pass it explicitly."
            )

        try:
            result = await self._client.sign_in(
                phone=phone,
                code=phone_code,
                phone_code_hash=resolved_hash,
            )
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except SessionPasswordNeededError as exc:
            raise TwoFactorRequiredError(
                "Two-factor authentication is enabled; password is required."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"sign_in failed: {exc}") from exc

        if not isinstance(result, types.User):
            raise TelegramClientManagerError("Unexpected sign_in response type.")
        return result

    async def sign_in_with_password(self, password: str) -> types.User:
        """Complete 2FA login handshake after SessionPasswordNeededError."""
        await self.connect()
        await self._enforce_write_delay()
        try:
            result = await self._client.sign_in(password=password)
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"2FA sign_in failed: {exc}") from exc

        if not isinstance(result, types.User):
            raise TelegramClientManagerError("Unexpected 2FA sign_in response type.")
        return result

    async def join_channel(self, channel: str | types.TypeInputChannel) -> Any:
        await self.connect()
        await self._enforce_write_delay()
        try:
            entity = await self._resolve_input_entity(channel)
            return await self._client(functions.channels.JoinChannelRequest(channel=entity))
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"join_channel failed: {exc}") from exc

    async def leave_channel(self, channel: str | types.TypeInputChannel) -> Any:
        await self.connect()
        await self._enforce_write_delay()
        try:
            entity = await self._resolve_input_entity(channel)
            return await self._client(functions.channels.LeaveChannelRequest(channel=entity))
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"leave_channel failed: {exc}") from exc

    @staticmethod
    def _normalize_reaction_input(reaction: str) -> list[types.TypeReaction]:
        return [types.ReactionEmoji(emoticon=reaction)]

    async def react_to_message(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
        reaction: str,
    ) -> bool:
        """
        Send a reaction and verify Telegram marks it as chosen.
        """
        await self.connect()
        await self._enforce_write_delay()

        peer = await self._resolve_input_entity(chat)
        normalized_reaction = self._normalize_reaction_input(reaction)
        try:
            await self._client(
                functions.messages.SendReactionRequest(
                    peer=peer,
                    msg_id=msg_id,
                    reaction=normalized_reaction,
                )
            )
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"react_to_message failed: {exc}") from exc

        is_chosen = False
        for _ in range(self.REACTION_VERIFY_RETRIES):
            is_chosen = await self.verify_reaction_chosen(chat=chat, msg_id=msg_id, reaction=reaction)
            if is_chosen:
                break
            await asyncio.sleep(self.REACTION_VERIFY_DELAY_SECONDS)
        if not is_chosen:
            logger.warning(
                "Reaction sent but not confirmed as chosen yet for msg_id=%s reaction=%r",
                msg_id,
                reaction,
            )
            return False
        return True

    async def verify_reaction_chosen(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
        reaction: str,
    ) -> bool | None:
        """
        Fetch message state and verify that the given reaction is marked as chosen.
        Returns:
          - True: chosen by current user
          - False: deterministically not chosen
          - None: cannot determine reliably from this Telegram response shape
        """
        await self.connect()
        message = await self._client.get_messages(chat, ids=msg_id)
        if message is None or message.reactions is None:
            return False

        # Telethon objects differ across versions:
        # - some expose reaction_result.chosen
        # - some only provide aggregate counts in results and user picks in recent_reactions
        had_chosen_field = False
        reaction_present_in_counts = False
        for reaction_result in message.reactions.results:
            reaction_obj = reaction_result.reaction
            if isinstance(reaction_obj, types.ReactionEmoji):
                if reaction_obj.emoticon == reaction:
                    reaction_present_in_counts = True
                if hasattr(reaction_result, "chosen"):
                    had_chosen_field = True
                chosen_attr = bool(getattr(reaction_result, "chosen", False))
                if reaction_obj.emoticon == reaction and chosen_attr:
                    return True

        recent = getattr(message.reactions, "recent_reactions", None) or []
        had_recent_chosen_field = False
        for recent_item in recent:
            reaction_obj = getattr(recent_item, "reaction", None)
            if hasattr(recent_item, "chosen"):
                had_recent_chosen_field = True
            chosen_attr = bool(getattr(recent_item, "chosen", False))
            if isinstance(reaction_obj, types.ReactionEmoji):
                if reaction_obj.emoticon == reaction and chosen_attr:
                    return True
        if had_chosen_field or had_recent_chosen_field:
            return False
        if reaction_present_in_counts:
            return None
        return False

    async def clear_reaction(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
    ) -> bool:
        """
        Remove current user's reaction from a message.
        """
        await self.connect()
        await self._enforce_write_delay()
        peer = await self._resolve_input_entity(chat)
        try:
            await self._client(
                functions.messages.SendReactionRequest(
                    peer=peer,
                    msg_id=msg_id,
                    reaction=[],
                )
            )
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"clear_reaction failed: {exc}") from exc
        return True

    async def post_reply(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
        text: str,
    ) -> types.Message:
        await self.connect()
        await self._enforce_write_delay()
        try:
            # For channel post comments, Telegram expects `comment_to` (discussion flow).
            # Using only `reply_to` can fail with admin-required errors on channels.
            message = await self._client.send_message(entity=chat, message=text, comment_to=msg_id)
        except RPCError as exc:
            raw = str(exc).lower()
            can_retry_as_reply = (
                "comment_to" in raw
                or "reply message not found" in raw
                or "invalid" in raw
            )
            if not can_retry_as_reply:
                raise TelegramClientManagerError(f"post_reply failed: {exc}") from exc
            try:
                message = await self._client.send_message(entity=chat, message=text, reply_to=msg_id)
            except FloodWaitError as exc2:
                raise TelegramClientManagerError(
                    f"FLOOD_WAIT:{exc2.seconds}:Too many requests. Retry after {exc2.seconds} seconds."
                ) from exc2
            except RPCError as exc2:
                raise TelegramClientManagerError(f"post_reply failed: {exc2}") from exc2
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        if not isinstance(message, types.Message):
            raise TelegramClientManagerError("Unexpected send_message response type.")
        return message

    async def delete_message(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
    ) -> bool:
        await self.connect()
        await self._enforce_write_delay()
        try:
            peer = await self._resolve_input_entity(chat)
            deleted = await self._client.delete_messages(entity=peer, message_ids=[msg_id], revoke=True)
        except FloodWaitError as exc:
            raise TelegramClientManagerError(
                f"FLOOD_WAIT:{exc.seconds}:Too many requests. Retry after {exc.seconds} seconds."
            ) from exc
        except RPCError as exc:
            raise TelegramClientManagerError(f"delete_message failed: {exc}") from exc
        return bool(deleted)

    async def message_exists(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
    ) -> bool:
        await self.connect()
        try:
            peer = await self._resolve_input_entity(chat)
            message = await self._client.get_messages(peer, ids=msg_id)
        except RPCError as exc:
            raise TelegramClientManagerError(f"message_exists failed: {exc}") from exc
        if message is None:
            return False
        mid = getattr(message, "id", None)
        return bool(mid and int(mid) == int(msg_id))

    async def _resolve_input_entity(self, chat: str | int | dict[str, Any] | types.TypeInputPeer) -> types.TypeInputPeer:
        """
        Resolve chat to input peer with dialog-scan fallback for numeric ids.
        Helps with cases where raw -100... ids are not yet cached.
        """
        if isinstance(chat, dict):
            chat_id = chat.get("chatId")
            access_hash = chat.get("accessHash")
            if chat_id is not None and access_hash is not None:
                chat_id_num = int(str(chat_id))
                access_hash_num = int(str(access_hash))
                channel_id = abs(chat_id_num)
                if str(chat_id_num).startswith("-100"):
                    channel_id = int(str(chat_id_num)[4:])
                return types.InputPeerChannel(channel_id=channel_id, access_hash=access_hash_num)

        try:
            return await self._client.get_input_entity(chat)
        except Exception:
            pass

        target_ids: set[int] = set()
        try:
            target_ids.add(int(str(chat)))
        except Exception:
            target_ids = set()

        if not target_ids:
            raise TelegramClientManagerError(f"Cannot resolve Telegram entity for chat={chat!r}")

        try:
            async for dialog in self._client.iter_dialogs():
                peer_id = utils.get_peer_id(dialog.entity)
                if int(peer_id) in target_ids:
                    return dialog.input_entity
        except Exception as exc:
            raise TelegramClientManagerError(f"Cannot resolve Telegram entity for chat={chat!r}: {exc}") from exc

        raise TelegramClientManagerError(f"Cannot resolve Telegram entity for chat={chat!r}")
