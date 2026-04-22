from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from telethon import TelegramClient, functions, types
from telethon.errors import (
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
        code = await self._client.send_code_request(phone=phone)
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
        except RPCError as exc:
            raise TelegramClientManagerError(f"2FA sign_in failed: {exc}") from exc

        if not isinstance(result, types.User):
            raise TelegramClientManagerError("Unexpected 2FA sign_in response type.")
        return result

    async def join_channel(self, channel: str | types.TypeInputChannel) -> Any:
        await self.connect()
        await self._enforce_write_delay()
        entity = await self._client.get_input_entity(channel)
        return await self._client(functions.channels.JoinChannelRequest(channel=entity))

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

        peer = await self._client.get_input_entity(chat)
        normalized_reaction = self._normalize_reaction_input(reaction)
        await self._client(
            functions.messages.SendReactionRequest(
                peer=peer,
                msg_id=msg_id,
                reaction=normalized_reaction,
            )
        )

        is_chosen = await self.verify_reaction_chosen(chat=chat, msg_id=msg_id, reaction=reaction)
        if not is_chosen:
            raise ReactionVerificationError(
                f"Reaction verification failed for msg_id={msg_id} and reaction={reaction!r}."
            )
        return True

    async def verify_reaction_chosen(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
        reaction: str,
    ) -> bool:
        """
        Fetch message state and verify that the given reaction is marked as chosen.
        """
        await self.connect()
        message = await self._client.get_messages(chat, ids=msg_id)
        if message is None or message.reactions is None:
            return False

        for reaction_result in message.reactions.results:
            reaction_obj = reaction_result.reaction
            if isinstance(reaction_obj, types.ReactionEmoji):
                if reaction_obj.emoticon == reaction and bool(reaction_result.chosen):
                    return True
        return False

    async def post_reply(
        self,
        chat: str | int | types.TypeInputPeer,
        msg_id: int,
        text: str,
    ) -> types.Message:
        await self.connect()
        await self._enforce_write_delay()
        message = await self._client.send_message(entity=chat, message=text, reply_to=msg_id)
        if not isinstance(message, types.Message):
            raise TelegramClientManagerError("Unexpected send_message response type.")
        return message
