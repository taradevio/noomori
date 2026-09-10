from __future__ import annotations

import ipaddress
import re
import socket
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import Message
from email.utils import parsedate_to_datetime
from importlib.metadata import version
from random import uniform
from time import monotonic, sleep
from urllib.parse import SplitResult, urljoin, urlsplit

import urllib3
from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from curl_cffi import Curl, CurlECode, CurlOpt
from curl_cffi import requests as curl_requests
from recipe_scrapers import scrape_html

from server.config import settings


FETCH_DEADLINE_SECONDS = 8.0
MAX_HTML_BYTES = 3 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
MAX_HTML_REQUEST_ROUNDS = 2
MAX_RETRY_DELAY_SECONDS = 1.0
USER_AGENT = "NoomoriRecipeImport/1.0"
HTML_BROWSER_PROFILE = "chrome150"
RECIPE_SCRAPERS_VERSION = version("recipe-scrapers")
HTML_USER_AGENT = (
    "Mozilla/5.0 (compatible; Windows NT 10.0; Win64; "
    f"x64; rv:{RECIPE_SCRAPERS_VERSION}) "
    f"recipe-scrapers/{RECIPE_SCRAPERS_VERSION}"
)
_HTML_CONTENT_TYPES = {"text/html", "application/xhtml+xml"}
_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
_RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}
# NOTE: Keep these aliases exact and intentionally small. Indonesian labels cover
# the Sasa fallback case without turning section detection into fuzzy matching.
_RECIPE_SECTION_NAMES = {
    "ingredient": "ingredients",
    "ingredients": "ingredients",
    "bahan": "ingredients",
    "bahan-bahan": "ingredients",
    "direction": "instructions",
    "directions": "instructions",
    "instruction": "instructions",
    "instructions": "instructions",
    "steps": "instructions",
    "step-by-step instructions": "instructions",
    "step by step instructions": "instructions",
    "method": "instructions",
    "baking instructions": "instructions",
    "cara membuat": "instructions",
    "cara memasak": "instructions",
    "langkah": "instructions",
    "langkah-langkah": "instructions",
}
_RECIPE_IDENTIFIER = re.compile(r"(?:^|[-_])recipe(?:$|[-_])", re.IGNORECASE)
_NOISE_IDENTIFIER = re.compile(
    r"(?:^|[-_])(?:ad|ads|advert|advertisement|author|comments?|hidden|nav|"
    r"navigation|newsletter|promotion|purchase|ratings?|related|"
    r"recommend(?:ation|ations|ed)?|share|sharing|sidebar|social|"
    r"sr-only|visually-hidden)(?:$|[-_])",
    re.IGNORECASE,
)
_HIDDEN_STYLE = re.compile(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", re.I)
_HEADING_TAGS = {"h1", "h2", "h3", "h4"}
_REMOVED_TAGS = {
    "script",
    "style",
    "template",
    "noscript",
    "nav",
    "footer",
    "aside",
    "form",
    "input",
    "select",
    "textarea",
    "svg",
}
_TRANSPORT_ERROR_KINDS = {
    "connection_error",
    "dns_error",
    "http_error",
    "timeout",
    "tls_error",
}
_FETCH_PHASES = {
    "body",
    "connect",
    "content_type",
    "deadline",
    "dns",
    "headers",
    "redirect",
    "request",
    "response",
    "validation",
}
_NOTES_HEADINGS = {"notes", "recipe notes", "tips & notes"}
_PASSIVE_TIME_LABELS = {
    "additional": "Additional",
    "additional time": "Additional",
    "chill": "Chill",
    "chill time": "Chill",
    "cooling": "Cooling",
    "cooling time": "Cooling",
    "marinate": "Marinate",
    "marinate time": "Marinate",
    "proof": "Proof",
    "proof time": "Proof",
    "rest": "Rest",
    "rest time": "Rest",
}


class WebsiteImportError(Exception):
    # Purpose: Store a stable import failure code alongside the exception message.
    # Connects to: Instantiated by server/src/server/recipe_url_import.py::{_validated_target(),_remaining(),_fetch_public_resource(),_lowest_common_ancestor(),_direct_branch(),_recipe_dom_candidate(),extract_recipe_container_text(),extract_recipe_group_structure(),extract_recipe()}; caught by server/src/server/modules/recipes/imports/website.py::{import_recipe_url(),import_recipe_image()}.
    def __init__(
        self,
        detail: str,
        *,
        hostname: str | None = None,
        upstream_status: int | None = None,
        redirect_count: int = 0,
        fetch_phase: str | None = None,
        content_type: str | None = None,
        response_size: int = 0,
        transport_error_kind: str | None = None,
        transport: str = "urllib3",
        browser_profile: str | None = None,
        request_round_count: int = 0,
        address_attempt_count: int = 0,
        retry_reason: str | None = None,
    ):
        super().__init__(detail)
        self.detail = detail
        self.hostname = (
            hostname
            if hostname
            and len(hostname) <= 253
            and re.fullmatch(r"[A-Za-z0-9.:-]+", hostname)
            else None
        )
        self.upstream_status = (
            upstream_status
            if isinstance(upstream_status, int) and 100 <= upstream_status <= 599
            else None
        )
        self.redirect_count = max(0, min(int(redirect_count), MAX_REDIRECTS))
        self.fetch_phase = fetch_phase if fetch_phase in _FETCH_PHASES else None
        self.content_type = (
            content_type
            if content_type
            and len(content_type) <= 100
            and re.fullmatch(r"[A-Za-z0-9!#$&^_.+/-]+", content_type)
            else None
        )
        self.response_size = max(0, int(response_size))
        self.transport_error_kind = (
            transport_error_kind
            if transport_error_kind in _TRANSPORT_ERROR_KINDS
            else None
        )
        self.transport = (
            transport if transport in {"urllib3", "curl_cffi"} else "urllib3"
        )
        self.browser_profile = browser_profile
        self.request_round_count = max(0, int(request_round_count))
        self.address_attempt_count = max(0, int(address_attempt_count))
        self.retry_reason = retry_reason


@dataclass(frozen=True)
class FetchedRecipePage:
    html: str
    url: str
    hostname: str
    response_size: int
    transport: str = "urllib3"
    browser_profile: str | None = None
    request_round_count: int = 1
    address_attempt_count: int = 1
    retry_reason: str | None = None


@dataclass(frozen=True)
class FetchedRecipeImage:
    body: bytes
    url: str
    hostname: str
    response_size: int
    content_type: str


@dataclass(frozen=True)
class _FetchedPublicResource:
    body: bytes
    url: str
    hostname: str
    response_size: int
    content_type: str
    content_type_header: str
    transport: str
    browser_profile: str | None
    request_round_count: int
    address_attempt_count: int
    retry_reason: str | None


@dataclass(frozen=True)
class _TransportResponse:
    status: int
    headers: Mapping[str, str]
    chunks: Iterable[bytes]
    close: Callable[[], None]


@dataclass(frozen=True)
class ExtractedIngredientGroup:
    title: str | None
    ingredients: list[str]


@dataclass(frozen=True)
class ExtractedInstructionGroup:
    title: str | None
    label_prefix: str | None
    instructions: list[str]


@dataclass(frozen=True)
class ExtractedRecipeGroupStructure:
    ingredient_groups: list[ExtractedIngredientGroup]
    instruction_groups: list[ExtractedInstructionGroup]


@dataclass(frozen=True)
class ExtractedRecipeDomMetadata:
    notes: str | None
    additional_time_label: str | None
    additional_time_text: str | None


@dataclass(frozen=True)
class ExtractedRecipe:
    title: str | None
    description: str | None
    ingredient_groups: list[ExtractedIngredientGroup]
    instructions: list[str]
    prep_time_minutes: int | None
    cook_time_minutes: int | None
    yield_text: str | None
    nutrients: dict[str, str]
    image_url: str | None
    total_time_minutes: int | None = None


# Purpose: Validate a URL and resolve only globally routable addresses on safe ports.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_public_resource(); calls socket.getaddrinfo() and supplies validated addresses to server/src/server/recipe_url_import.py::_fetch_from_address().
def _validated_target(url: str) -> tuple[SplitResult, list[str], int]:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except (TypeError, ValueError) as exc:
        raise WebsiteImportError("unsafe_url") from exc

    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise WebsiteImportError(
            "unsafe_url",
            hostname=parsed.hostname,
            fetch_phase="validation",
        )

    port = port or (443 if parsed.scheme.lower() == "https" else 80)
    if port not in {80, 443}:
        raise WebsiteImportError("unsafe_url")

    try:
        hostname = parsed.hostname.encode("idna").decode("ascii")
        answers = socket.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
        addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
        if not addresses or any(
            not ipaddress.ip_address(address).is_global for address in addresses
        ):
            raise WebsiteImportError(
                "unsafe_url",
                hostname=hostname,
                fetch_phase="validation",
            )
    except WebsiteImportError:
        raise
    except (OSError, UnicodeError, ValueError) as exc:
        raise WebsiteImportError(
            "page_unavailable",
            hostname=parsed.hostname,
            fetch_phase="dns",
            transport_error_kind="dns_error",
        ) from exc

    return parsed, addresses, port


# Purpose: Render the original hostname and any non-default port for the Host header.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_from_address(); has no downstream local function calls.
def _host_header(hostname: str, parsed: SplitResult, port: int) -> str:
    rendered_host = f"[{hostname}]" if ":" in hostname else hostname
    default_port = 443 if parsed.scheme.lower() == "https" else 80
    return rendered_host if port == default_port else f"{rendered_host}:{port}"


# Purpose: Build the origin-form path and query used for a direct HTTP request.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_from_address(); has no downstream local function calls.
def _request_path(parsed: SplitResult) -> str:
    path = parsed.path or "/"
    return f"{path}?{parsed.query}" if parsed.query else path


# Purpose: Return time left in the shared fetch deadline or stop with a timeout.
# Connects to: Called by server/src/server/recipe_url_import.py::{_fetch_from_address(),_fetch_public_resource()}; has no downstream local function calls.
def _remaining(deadline: float) -> float:
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise WebsiteImportError(
            "fetch_timeout",
            fetch_phase="deadline",
            transport_error_kind="timeout",
        )
    return remaining


# Purpose: Decode fetched HTML using its declared charset with a safe fallback.
# Connects to: Called by server/src/server/recipe_url_import.py::fetch_public_html(); has no downstream local function calls.
def _decode_html(body: bytes, content_type: str) -> str:
    message = Message()
    message["content-type"] = content_type
    charset = message.get_content_charset() or "utf-8"
    try:
        return body.decode(charset, errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


# Purpose: Open one urllib3 request against a previously validated IP address.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_public_resource(); calls server/src/server/recipe_url_import.py::{_remaining(),_request_path(),_host_header()} and urllib3 HTTP(S)ConnectionPool.urlopen().
def _fetch_from_address(
    parsed: SplitResult,
    address: str,
    port: int,
    deadline: float,
    accept: str,
    user_agent: str,
):
    hostname = parsed.hostname.encode("idna").decode("ascii")  # type: ignore[union-attr]
    timeout = urllib3.Timeout(
        total=_remaining(deadline),
        connect=_remaining(deadline),
        read=_remaining(deadline),
    )
    if parsed.scheme.lower() == "https":
        pool = urllib3.HTTPSConnectionPool(
            address,
            port=port,
            timeout=timeout,
            retries=False,
            server_hostname=hostname,
            assert_hostname=hostname,
        )
    else:
        pool = urllib3.HTTPConnectionPool(
            address,
            port=port,
            timeout=timeout,
            retries=False,
        )

    try:
        response = pool.urlopen(
            "GET",
            _request_path(parsed),
            headers={
                "Accept": accept,
                "Host": _host_header(hostname, parsed, port),
                "User-Agent": user_agent,
            },
            redirect=False,
            retries=False,
            preload_content=False,
            decode_content=True,
            assert_same_host=False,
            timeout=timeout,
        )
        def close() -> None:
            response.close()
            pool.close()

        return _TransportResponse(
            status=response.status,
            headers=response.headers,
            chunks=response.stream(amt=64 * 1024, decode_content=True),
            close=close,
        )
    except Exception:
        pool.close()
        raise


# Purpose: Fail fast when the pinned curl-cffi wheel lacks Noomori's fixed profile.
# Connects to: Called by server/src/server/core/lifespan.py::app_lifespan() and server/src/server/characterize_recipe_transport.py::run_characterization(); invokes curl-cffi without making a network request.
def assert_html_browser_profile_supported() -> None:
    curl = Curl()
    try:
        if curl.impersonate(HTML_BROWSER_PROFILE) != 0:
            raise RuntimeError(
                f"curl-cffi does not support {HTML_BROWSER_PROFILE}"
            )
    finally:
        curl.close()


# Purpose: Format one libcurl resolve rule without replacing the URL hostname.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_html_from_address(); has no downstream local function calls.
def _curl_resolve_rule(hostname: str, port: int, address: str) -> str:
    rendered_address = f"[{address}]" if ":" in address else address
    return f"{hostname}:{port}:{rendered_address}"


# Purpose: Fetch one bounded, decoded HTML response through a validated address.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_public_resource(); uses a request-scoped curl-cffi Session.
def _fetch_html_from_address(
    parsed: SplitResult,
    address: str,
    port: int,
    deadline: float,
    accept: str,
    max_bytes: int,
) -> _TransportResponse:
    hostname = parsed.hostname.encode("idna").decode("ascii")  # type: ignore[union-attr]
    chunks: list[bytes] = []
    response_size = 0

    def receive(chunk: bytes) -> None:
        nonlocal response_size
        _remaining(deadline)
        response_size += len(chunk)
        if response_size > max_bytes:
            raise WebsiteImportError(
                "page_too_large",
                hostname=hostname,
                fetch_phase="body",
                response_size=response_size,
                transport="curl_cffi",
                browser_profile=HTML_BROWSER_PROFILE,
            )
        chunks.append(chunk)

    curl_options = {CurlOpt.MAXFILESIZE_LARGE: max_bytes}
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        curl_options[CurlOpt.RESOLVE] = [
            _curl_resolve_rule(hostname, port, address)
        ]

    try:
        with curl_requests.Session(
            trust_env=False,
            allow_redirects=False,
            retry=0,
            impersonate=HTML_BROWSER_PROFILE,
            default_headers=True,
            curl_options=curl_options,
        ) as session:
            response = session.get(
                parsed.geturl(),
                headers={"Accept": accept},
                timeout=_remaining(deadline),
                allow_redirects=False,
                content_callback=receive,
                discard_cookies=True,
            )
    except WebsiteImportError:
        raise
    except curl_requests.exceptions.RequestException as exc:
        response = getattr(exc, "response", None)
        status = getattr(response, "status_code", None) or None
        if exc.code == CurlECode.FILESIZE_EXCEEDED:
            raise WebsiteImportError(
                "page_too_large",
                hostname=hostname,
                upstream_status=status,
                fetch_phase="headers",
                response_size=max_bytes + 1,
                transport="curl_cffi",
                browser_profile=HTML_BROWSER_PROFILE,
            ) from exc

        body_started = bool(response_size or status)
        if isinstance(exc, curl_requests.exceptions.Timeout):
            raise WebsiteImportError(
                "fetch_timeout",
                hostname=hostname,
                upstream_status=status,
                fetch_phase="body" if body_started else "request",
                response_size=response_size,
                transport_error_kind="timeout",
                transport="curl_cffi",
                browser_profile=HTML_BROWSER_PROFILE,
            ) from exc

        if (
            isinstance(exc, curl_requests.exceptions.IncompleteRead)
            or exc.code in {CurlECode.PARTIAL_FILE, CurlECode.RECV_ERROR}
            or body_started
        ):
            raise WebsiteImportError(
                "page_unavailable",
                hostname=hostname,
                upstream_status=status,
                fetch_phase="body",
                response_size=response_size,
                transport_error_kind="connection_error",
                transport="curl_cffi",
                browser_profile=HTML_BROWSER_PROFILE,
            ) from exc

        raise WebsiteImportError(
            "page_unavailable",
            hostname=hostname,
            fetch_phase="connect",
            transport_error_kind=(
                "tls_error"
                if isinstance(exc, curl_requests.exceptions.SSLError)
                else "connection_error"
            ),
            transport="curl_cffi",
            browser_profile=HTML_BROWSER_PROFILE,
        ) from exc

    return _TransportResponse(
        status=response.status_code,
        headers=response.headers,
        chunks=chunks,
        close=lambda: None,
    )


# Purpose: Return a bounded delay for one permitted HTML retry.
# Connects to: Called by server/src/server/recipe_url_import.py::_wait_before_retry(); uses only standard-library date parsing and jitter.
def _retry_delay(status: int | None, headers: Mapping[str, str]) -> float | None:
    if status != 429:
        return uniform(0.1, 0.3)

    value = headers.get("Retry-After")
    if not value:
        return uniform(0.1, 0.3)
    stripped_value = value.strip()
    if re.fullmatch(r"[0-9]+", stripped_value):
        delay = float(int(stripped_value))
    else:
        try:
            retry_at = parsedate_to_datetime(value)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            delay = (retry_at - datetime.now(timezone.utc)).total_seconds()
        except (TypeError, ValueError, OverflowError):
            return uniform(0.1, 0.3)

    delay = max(0.0, delay)
    return delay if delay <= MAX_RETRY_DELAY_SECONDS else None


# Purpose: Wait only when the retry delay fits inside the shared deadline.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_public_resource(); calls server/src/server/recipe_url_import.py::_retry_delay().
def _wait_before_retry(
    status: int | None,
    headers: Mapping[str, str],
    deadline: float,
) -> bool:
    delay = _retry_delay(status, headers)
    if delay is None or delay >= deadline - monotonic():
        return False
    sleep(delay)
    return True


# Purpose: Identify read-phase failures eligible for the one bounded retry.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_public_resource(); has no downstream local function calls.
def _is_retryable_read_failure(error: WebsiteImportError) -> bool:
    return (
        error.fetch_phase in {"request", "body"}
        and error.transport_error_kind in {"timeout", "connection_error"}
        and error.detail in {"fetch_timeout", "page_unavailable"}
    )


# Purpose: Attach aggregate transport diagnostics without changing public errors.
# Connects to: Called by server/src/server/recipe_url_import.py::_fetch_public_resource(); has no downstream local function calls.
def _annotate_transport_error(
    error: WebsiteImportError,
    *,
    transport: str,
    request_round_count: int,
    address_attempt_count: int,
    retry_reason: str | None,
) -> WebsiteImportError:
    error.transport = transport
    error.browser_profile = (
        HTML_BROWSER_PROFILE if transport == "curl_cffi" else None
    )
    error.request_round_count = request_round_count
    error.address_attempt_count = address_attempt_count
    error.retry_reason = retry_reason or error.retry_reason
    return error


# Purpose: Safely fetch bounded public content across revalidated redirects.
# Connects to: Called by server/src/server/recipe_url_import.py::{fetch_public_html(),fetch_public_image()}; calls server/src/server/recipe_url_import.py::{_remaining(),_validated_target(),_fetch_from_address(),_fetch_html_from_address()}.
def _fetch_public_resource(
    url: str,
    *,
    accepted_content_types: set[str],
    max_bytes: int,
    accept: str,
    user_agent: str,
    transport: str = "urllib3",
    max_request_rounds: int = 1,
) -> _FetchedPublicResource:
    deadline = monotonic() + FETCH_DEADLINE_SECONDS
    current_url = url
    request_round_count = 0
    address_attempt_count = 0
    retry_reason = None

    for redirect_count in range(MAX_REDIRECTS + 1):
        _remaining(deadline)
        followed_redirect = False
        for request_round in range(max_request_rounds):
            response_size = 0
            content_type = None
            response = None
            try:
                parsed, addresses, port = _validated_target(current_url)
            except WebsiteImportError as exc:
                exc.redirect_count = redirect_count
                raise _annotate_transport_error(
                    exc,
                    transport=transport,
                    request_round_count=request_round_count,
                    address_attempt_count=address_attempt_count,
                    retry_reason=retry_reason,
                )

            hostname = parsed.hostname.encode("idna").decode("ascii")  # type: ignore[union-attr]
            request_round_count += 1
            last_connection_error: Exception | None = None
            retry_round = False

            for address in addresses:
                address_attempt_count += 1
                try:
                    response = (
                        _fetch_html_from_address(
                            parsed,
                            address,
                            port,
                            deadline,
                            accept,
                            max_bytes,
                        )
                        if transport == "curl_cffi"
                        else _fetch_from_address(
                            parsed,
                            address,
                            port,
                            deadline,
                            accept,
                            user_agent,
                        )
                    )
                    break
                except WebsiteImportError as exc:
                    exc.hostname = exc.hostname or hostname
                    exc.redirect_count = redirect_count
                    if (
                        exc.fetch_phase == "connect"
                        and exc.transport_error_kind == "connection_error"
                    ):
                        last_connection_error = exc
                        continue
                    if (
                        request_round + 1 < max_request_rounds
                        and _is_retryable_read_failure(exc)
                        and _wait_before_retry(None, {}, deadline)
                    ):
                        retry_reason = "read_failure"
                        retry_round = True
                        break
                    raise _annotate_transport_error(
                        exc,
                        transport=transport,
                        request_round_count=request_round_count,
                        address_attempt_count=address_attempt_count,
                        retry_reason=retry_reason,
                    )
                except (
                    urllib3.exceptions.NewConnectionError,
                    urllib3.exceptions.ConnectTimeoutError,
                    ConnectionError,
                ) as exc:
                    last_connection_error = exc
                except (
                    urllib3.exceptions.ReadTimeoutError,
                    TimeoutError,
                    socket.timeout,
                ) as exc:
                    error = WebsiteImportError(
                        "fetch_timeout",
                        hostname=hostname,
                        redirect_count=redirect_count,
                        fetch_phase="request",
                        transport_error_kind="timeout",
                    )
                    if (
                        request_round + 1 < max_request_rounds
                        and _wait_before_retry(None, {}, deadline)
                    ):
                        retry_reason = "read_failure"
                        retry_round = True
                        break
                    raise _annotate_transport_error(
                        error,
                        transport=transport,
                        request_round_count=request_round_count,
                        address_attempt_count=address_attempt_count,
                        retry_reason=retry_reason,
                    ) from exc
                except (OSError, urllib3.exceptions.HTTPError) as exc:
                    error = WebsiteImportError(
                        "page_unavailable",
                        hostname=hostname,
                        redirect_count=redirect_count,
                        fetch_phase="request",
                        transport_error_kind=(
                            "tls_error"
                            if isinstance(exc, urllib3.exceptions.SSLError)
                            else "connection_error"
                        ),
                    )
                    raise _annotate_transport_error(
                        error,
                        transport=transport,
                        request_round_count=request_round_count,
                        address_attempt_count=address_attempt_count,
                        retry_reason=retry_reason,
                    ) from exc

            if retry_round:
                continue

            if response is None:
                connection_timed_out = isinstance(
                    last_connection_error,
                    (urllib3.exceptions.TimeoutError, TimeoutError, socket.timeout),
                ) and not isinstance(
                    last_connection_error,
                    urllib3.exceptions.NewConnectionError,
                )
                error = WebsiteImportError(
                    "fetch_timeout" if connection_timed_out else "page_unavailable",
                    hostname=hostname,
                    redirect_count=redirect_count,
                    fetch_phase="connect",
                    transport_error_kind=(
                        "timeout" if connection_timed_out else "connection_error"
                    ),
                )
                raise _annotate_transport_error(
                    error,
                    transport=transport,
                    request_round_count=request_round_count,
                    address_attempt_count=address_attempt_count,
                    retry_reason=retry_reason,
                ) from last_connection_error

            try:
                if response.status in _REDIRECT_STATUSES:
                    location = response.headers.get("Location")
                    if not location or redirect_count == MAX_REDIRECTS:
                        raise WebsiteImportError(
                            "page_unavailable",
                            hostname=hostname,
                            upstream_status=response.status,
                            redirect_count=redirect_count,
                            fetch_phase="redirect",
                            transport_error_kind="http_error",
                        )
                    current_url = urljoin(current_url, location)
                    followed_redirect = True
                    break

                if response.status != 200:
                    if (
                        response.status in _RETRYABLE_HTTP_STATUSES
                        and request_round + 1 < max_request_rounds
                        and _wait_before_retry(
                            response.status,
                            response.headers,
                            deadline,
                        )
                    ):
                        retry_reason = f"http_{response.status}"
                        continue
                    raise WebsiteImportError(
                        "page_unavailable",
                        hostname=hostname,
                        upstream_status=response.status,
                        redirect_count=redirect_count,
                        fetch_phase="response",
                        transport_error_kind="http_error",
                    )

                content_type_header = response.headers.get("Content-Type")
                if not content_type_header:
                    raise WebsiteImportError(
                        "unsupported_content_type",
                        hostname=hostname,
                        upstream_status=response.status,
                        redirect_count=redirect_count,
                        fetch_phase="content_type",
                    )
                content_type = content_type_header.split(";", 1)[0].strip().lower()
                if content_type not in accepted_content_types:
                    raise WebsiteImportError(
                        "unsupported_content_type",
                        hostname=hostname,
                        upstream_status=response.status,
                        redirect_count=redirect_count,
                        fetch_phase="content_type",
                        content_type=content_type,
                    )

                content_length = response.headers.get("Content-Length")
                try:
                    declared_size = int(content_length) if content_length else None
                except ValueError:
                    declared_size = None
                if declared_size is not None and declared_size > max_bytes:
                    raise WebsiteImportError(
                        "page_too_large",
                        hostname=hostname,
                        upstream_status=response.status,
                        redirect_count=redirect_count,
                        fetch_phase="headers",
                        content_type=content_type,
                        response_size=declared_size,
                    )

                chunks: list[bytes] = []
                for chunk in response.chunks:
                    _remaining(deadline)
                    response_size += len(chunk)
                    if response_size > max_bytes:
                        raise WebsiteImportError(
                            "page_too_large",
                            hostname=hostname,
                            upstream_status=response.status,
                            redirect_count=redirect_count,
                            fetch_phase="body",
                            content_type=content_type,
                            response_size=response_size,
                        )
                    chunks.append(chunk)

                return _FetchedPublicResource(
                    body=b"".join(chunks),
                    url=current_url,
                    hostname=hostname,
                    response_size=response_size,
                    content_type=content_type,
                    content_type_header=content_type_header,
                    transport=transport,
                    browser_profile=(
                        HTML_BROWSER_PROFILE if transport == "curl_cffi" else None
                    ),
                    request_round_count=request_round_count,
                    address_attempt_count=address_attempt_count,
                    retry_reason=retry_reason,
                )
            except (urllib3.exceptions.TimeoutError, TimeoutError, socket.timeout) as exc:
                error = WebsiteImportError(
                    "fetch_timeout",
                    hostname=hostname,
                    upstream_status=response.status,
                    redirect_count=redirect_count,
                    fetch_phase="body",
                    content_type=content_type,
                    response_size=response_size,
                    transport_error_kind="timeout",
                )
                if (
                    request_round + 1 < max_request_rounds
                    and _wait_before_retry(None, {}, deadline)
                ):
                    retry_reason = "read_failure"
                    continue
                raise _annotate_transport_error(
                    error,
                    transport=transport,
                    request_round_count=request_round_count,
                    address_attempt_count=address_attempt_count,
                    retry_reason=retry_reason,
                ) from exc
            except WebsiteImportError as exc:
                exc.hostname = exc.hostname or hostname
                exc.upstream_status = exc.upstream_status or response.status
                exc.redirect_count = redirect_count
                if exc.content_type is None and content_type in accepted_content_types:
                    exc.content_type = content_type
                exc.response_size = max(exc.response_size, response_size)
                raise _annotate_transport_error(
                    exc,
                    transport=transport,
                    request_round_count=request_round_count,
                    address_attempt_count=address_attempt_count,
                    retry_reason=retry_reason,
                )
            except (OSError, urllib3.exceptions.HTTPError) as exc:
                error = WebsiteImportError(
                    "page_unavailable",
                    hostname=hostname,
                    upstream_status=response.status,
                    redirect_count=redirect_count,
                    fetch_phase="body",
                    content_type=content_type,
                    response_size=response_size,
                    transport_error_kind=(
                        "tls_error"
                        if isinstance(exc, urllib3.exceptions.SSLError)
                        else "connection_error"
                    ),
                )
                if (
                    request_round + 1 < max_request_rounds
                    and _wait_before_retry(None, {}, deadline)
                ):
                    retry_reason = "read_failure"
                    continue
                raise _annotate_transport_error(
                    error,
                    transport=transport,
                    request_round_count=request_round_count,
                    address_attempt_count=address_attempt_count,
                    retry_reason=retry_reason,
                ) from exc
            finally:
                response.close()

        if followed_redirect:
            continue

    raise _annotate_transport_error(
        WebsiteImportError("page_unavailable"),
        transport=transport,
        request_round_count=request_round_count,
        address_attempt_count=address_attempt_count,
        retry_reason=retry_reason,
    )


# Purpose: Fetch and decode a size-limited public HTML recipe page.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/recipe_url_import.py::{_fetch_public_resource(),_decode_html()}.
def fetch_public_html(
    url: str,
    *,
    transport: str | None = None,
) -> FetchedRecipePage:
    selected_transport = transport or settings.recipe_html_transport
    if selected_transport not in {"urllib3", "curl_cffi"}:
        raise ValueError("unsupported HTML transport")
    resource = _fetch_public_resource(
        url,
        accepted_content_types=_HTML_CONTENT_TYPES,
        max_bytes=MAX_HTML_BYTES,
        accept="text/html, application/xhtml+xml",
        user_agent=HTML_USER_AGENT,
        transport=selected_transport,
        max_request_rounds=MAX_HTML_REQUEST_ROUNDS,
    )
    return FetchedRecipePage(
        html=_decode_html(resource.body, resource.content_type_header),
        url=resource.url,
        hostname=resource.hostname,
        response_size=resource.response_size,
        transport=resource.transport,
        browser_profile=resource.browser_profile,
        request_round_count=resource.request_round_count,
        address_attempt_count=resource.address_attempt_count,
        retry_reason=resource.retry_reason,
    )


# Purpose: Fetch a size- and type-limited public recipe image as raw bytes.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_image(); calls server/src/server/recipe_url_import.py::_fetch_public_resource().
def fetch_public_image(url: str) -> FetchedRecipeImage:
    resource = _fetch_public_resource(
        url,
        accepted_content_types=_IMAGE_CONTENT_TYPES,
        max_bytes=MAX_IMAGE_BYTES,
        accept="image/jpeg, image/png, image/webp",
        user_agent=USER_AGENT,
    )
    return FetchedRecipeImage(
        body=resource.body,
        url=resource.url,
        hostname=resource.hostname,
        response_size=resource.response_size,
        content_type=resource.content_type,
    )


# Purpose: Extract a tag's rendered text while preserving explicit line breaks.
# Connects to: Called by server/src/server/recipe_url_import.py::_normalized_dom_text() and server/src/server/recipe_url_import.py::_serialize_recipe_scope()::visit(); has no downstream local function calls.
def _dom_text_with_breaks(tag: Tag) -> str:
    parts: list[str] = []
    for descendant in tag.descendants:
        if isinstance(descendant, Comment):
            continue
        if isinstance(descendant, NavigableString):
            parts.append(str(descendant))
        elif isinstance(descendant, Tag) and descendant.name == "br":
            parts.append("\n")
    return "".join(parts).replace("\xa0", " ")


# Purpose: Collapse a tag's rendered text into a whitespace-normalized single line.
# Connects to: Called by server/src/server/recipe_url_import.py::{_standalone_emphasis_text(),_section_kind(),_leading_instruction_label(),_instruction_item_parts(),_recipe_dom_candidate(),extract_recipe_container_text(),_plain_list_label(),extract_recipe_group_structure(),_serialize_recipe_scope()::visit()}; calls server/src/server/recipe_url_import.py::_dom_text_with_breaks().
def _normalized_dom_text(tag: Tag) -> str:
    return " ".join(_dom_text_with_breaks(tag).split())


# Purpose: Check whether a tag's id or classes match a structural identifier pattern.
# Connects to: Called by server/src/server/recipe_url_import.py::{_is_recipe_root(),_clean_dom()}; has no downstream local function calls.
def _identifier_matches(tag: Tag, pattern: re.Pattern[str]) -> bool:
    identifier = tag.get("id")
    classes = tag.get("class", [])
    values = ([identifier] if isinstance(identifier, str) else []) + (
        classes if isinstance(classes, list) else [classes]
    )
    return any(isinstance(value, str) and pattern.search(value) for value in values)


# Purpose: Identify DOM elements eligible to anchor one recipe candidate.
# Connects to: Called by server/src/server/recipe_url_import.py::_clean_dom() and passed to BeautifulSoup.find_all() by server/src/server/recipe_url_import.py::_recipe_dom_candidate(); calls server/src/server/recipe_url_import.py::_identifier_matches().
def _is_recipe_root(tag: Tag) -> bool:
    return tag.name in {"article", "main"} or _identifier_matches(
        tag,
        _RECIPE_IDENTIFIER,
    )


# Purpose: Map an exact normalized heading label to its recipe section kind.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::{parse_recipe_text(),_dom_nutrition()} and server/src/server/recipe_url_import.py::{_section_kind(),_leading_instruction_label(),_plain_list_label(),extract_recipe_group_structure()}; has no downstream local function calls.
def recipe_section_name(value: str) -> str | None:
    # NOTE: Sasa renders "Bahan- Bahan"; normalizing whitespace around hyphens
    # handles that markup variation while the final alias lookup remains exact.
    normalized = value.strip().removesuffix(":").strip().casefold()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"\s*-\s*", "-", normalized)
    return _RECIPE_SECTION_NAMES.get(normalized)


# Purpose: Recognize paragraph/div elements made entirely from bold emphasis.
# Connects to: Called by server/src/server/recipe_url_import.py::{_section_kind(),extract_recipe_group_structure(),_serialize_recipe_scope()::visit()}; calls server/src/server/recipe_url_import.py::_normalized_dom_text().
def _standalone_emphasis_text(tag: Tag) -> str | None:
    if tag.name not in {"p", "div"}:
        return None
    emphasis = tag.find(["strong", "b"])
    if emphasis is None:
        return None
    text = _normalized_dom_text(tag)
    return text if text and text == _normalized_dom_text(emphasis) else None


# Purpose: Classify a semantic or standalone-emphasis tag as a recipe section heading.
# Connects to: Called by server/src/server/recipe_url_import.py::{_recipe_dom_candidate(),_serialize_recipe_scope()::visit()}; calls server/src/server/recipe_url_import.py::{_normalized_dom_text(),_standalone_emphasis_text(),recipe_section_name()}.
def _section_kind(tag: Tag) -> str | None:
    if tag.name not in _HEADING_TAGS | {"p", "div"}:
        return None

    text = _normalized_dom_text(tag)
    if tag.name in {"p", "div"}:
        emphasized_text = _standalone_emphasis_text(tag)
        if recipe_section_name(text) != recipe_section_name(emphasized_text or ""):
            return None

    return recipe_section_name(text)


# Purpose: Test whether a tag is contained by a candidate ancestor, including itself.
# Connects to: Called by server/src/server/recipe_url_import.py::_recipe_dom_candidate(); has no downstream local function calls.
def _is_descendant(tag: Tag, ancestor: Tag) -> bool:
    return tag is ancestor or any(parent is ancestor for parent in tag.parents)


# Purpose: Find the nearest DOM scope containing two recipe section headings.
# Connects to: Called by server/src/server/recipe_url_import.py::{extract_recipe_container_text(),extract_recipe_group_structure()}; has no downstream local function calls.
def _lowest_common_ancestor(first: Tag, second: Tag) -> Tag:
    first_ancestors = {id(first), *(id(parent) for parent in first.parents)}
    current: Tag | None = second
    while current is not None:
        if id(current) in first_ancestors:
            return current
        parent = current.parent
        current = parent if isinstance(parent, Tag) else None
    raise WebsiteImportError("recipe_not_found")


# Purpose: Remove hidden, navigational, advertising, and non-content DOM elements.
# Connects to: Called by server/src/server/recipe_url_import.py::{extract_recipe_container_text(),extract_recipe_group_structure()}; calls server/src/server/recipe_url_import.py::{_identifier_matches(),_is_recipe_root()}.
def _clean_dom(soup: BeautifulSoup) -> None:
    for tag in list(soup.find_all(True)):
        if tag.parent is None:
            continue
        style = tag.get("style")
        noise_identifier = _identifier_matches(tag, _NOISE_IDENTIFIER)
        if (
            tag.name in _REMOVED_TAGS
            or str(tag.get("role", "")).casefold() == "navigation"
            or tag.has_attr("hidden")
            or str(tag.get("aria-hidden", "")).casefold() == "true"
            or (isinstance(style, str) and _HIDDEN_STYLE.search(style))
            # Content sites sometimes mark the whole recipe article as an ad
            # container. Preserve structural roots; nested ad blocks are still
            # removed and roots without recipe sections cannot become candidates.
            or (noise_identifier and tag.name not in {"article", "main", "body"})
        ):
            tag.decompose()

    # Site chrome is noise, but an article-local header may contain the recipe title.
    for header in list(soup.find_all("header")):
        if header.find_parent(["article", "main"]) is None and not any(
            _is_recipe_root(parent)
            for parent in header.parents
            if isinstance(parent, Tag)
        ):
            header.decompose()


# Purpose: Normalize and append non-empty rendered lines to a serialized recipe.
# Connects to: Called by the nested server/src/server/recipe_url_import.py::_serialize_recipe_scope()::visit(); has no downstream local function calls.
def _append_dom_line(lines: list[str], value: str, *, subgroup: bool = False) -> None:
    for raw_line in value.replace("\xa0", " ").splitlines():
        line = " ".join(raw_line.split())
        if line:
            if subgroup and not line.endswith(":"):
                line += ":"
            lines.append(line)


# Purpose: Detect a structured label at the beginning of one instruction list item.
# Connects to: Called by server/src/server/recipe_url_import.py::_instruction_item_parts(); calls server/src/server/recipe_url_import.py::{_normalized_dom_text(),recipe_section_name()}.
def _leading_instruction_label(tag: Tag) -> str | None:
    # NOTE: Some recipe cards place a short action heading inside each <li>
    # (for example, "Preheat oven"), while others use a leading bold label.
    # Semantic h3/h4 headings are sufficient structure on their own; bold text
    # still needs a trailing colon so ordinary emphasized prose is not promoted.
    for descendant in tag.descendants:
        if isinstance(descendant, Comment):
            continue
        if isinstance(descendant, NavigableString):
            if str(descendant).strip():
                return None
            continue
        if isinstance(descendant, Tag):
            if descendant.name not in {"strong", "b", "h3", "h4"}:
                continue
            text = _normalized_dom_text(descendant)
            if (
                text
                and recipe_section_name(text) is None
                and (
                    descendant.name in {"h3", "h4"}
                    or text.endswith(":")
                )
                and _normalized_dom_text(tag).casefold().startswith(text.casefold())
            ):
                return text
            return None
    return None


# Purpose: Split an instruction item into optional label, body, and comparison text.
# Connects to: Called by server/src/server/recipe_url_import.py::{extract_recipe_group_structure(),_serialize_recipe_scope()::visit()}; calls server/src/server/recipe_url_import.py::{_leading_instruction_label(),_normalized_dom_text()}.
def _instruction_item_parts(item: Tag) -> tuple[str | None, str, str]:
    label = _leading_instruction_label(item)
    # NOTE: One ordered-list item remains one editable instruction even when its
    # body has several paragraphs. Figure captions are presentation metadata and
    # must not become cooking text or break exact primary/DOM verification.
    paragraphs = [
        _normalized_dom_text(paragraph)
        for paragraph in item.find_all("p")
        if not paragraph.find_parent(["figure", "figcaption"])
        and _normalized_dom_text(paragraph)
    ]
    content = " ".join(paragraphs) or _normalized_dom_text(item)
    body = content
    if label and content.casefold().startswith(label.casefold()):
        body = content[len(label):].strip()

    # A heading alone cannot form a canonical group because every group needs a
    # real instruction body. Reject it rather than duplicating the label as text.
    if label and body:
        return label, body, f"{label} {body}".strip()
    if label:
        return None, "", ""
    return None, content, content


# Purpose: Serialize the selected recipe DOM scope into deterministic parser input.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe_container_text(); defines and invokes server/src/server/recipe_url_import.py::_serialize_recipe_scope()::visit().
def _serialize_recipe_scope(
    scope: Tag,
    *,
    title: Tag,
    stop_after: Tag | None,
    instruction_heading: Tag,
) -> list[str]:
    lines: list[str] = []
    instruction_heading_level = (
        int(instruction_heading.name[1])
        if instruction_heading.name in _HEADING_TAGS
        else None
    )
    inside_instructions = False

    # Purpose: Recursively emit relevant content until the recipe scope boundary.
    # Connects to: Defined and first called by server/src/server/recipe_url_import.py::_serialize_recipe_scope(); recursively calls server/src/server/recipe_url_import.py::_serialize_recipe_scope()::visit() plus server/src/server/recipe_url_import.py::{_section_kind(),_append_dom_line(),_normalized_dom_text(),_standalone_emphasis_text(),_instruction_item_parts(),_dom_text_with_breaks()}.
    def visit(tag: Tag) -> bool:
        nonlocal inside_instructions
        if tag is title:
            return False
        section_kind = _section_kind(tag)
        if section_kind is not None:
            _append_dom_line(lines, _normalized_dom_text(tag))
            if tag is instruction_heading:
                inside_instructions = True
            return False

        if (
            inside_instructions
            and instruction_heading_level is not None
            and tag.name in _HEADING_TAGS
            and int(tag.name[1]) <= instruction_heading_level
            and not _normalized_dom_text(tag).endswith(":")
        ):
            return True

        emphasized_text = _standalone_emphasis_text(tag)
        if emphasized_text is not None:
            _append_dom_line(lines, emphasized_text, subgroup=True)
            return False

        if tag.name in _HEADING_TAGS:
            _append_dom_line(lines, _normalized_dom_text(tag), subgroup=True)
            return False

        if tag.name in {"ul", "ol"}:
            for index, item in enumerate(tag.find_all("li", recursive=False), start=1):
                if tag.name == "ol" and inside_instructions:
                    label, item_text, _comparison_text = _instruction_item_parts(
                        item
                    )
                else:
                    label = None
                    item_text = _normalized_dom_text(item)
                if label is not None:
                    _append_dom_line(lines, label, subgroup=True)
                prefix = "-" if tag.name == "ul" else f"{index}."
                _append_dom_line(lines, f"{prefix} {item_text}")
            if tag.name == "ol" and inside_instructions:
                # Preserve the DOM block boundary so later sibling prose remains
                # a separate step under the text parser's wrapping rules.
                lines.append("")
            return False

        if tag.name == "p":
            _append_dom_line(lines, _dom_text_with_breaks(tag))
            return False

        if tag.name == "br":
            return False

        if tag.name == "button":
            # NOTE: Recipe accordions may place their h2 label inside a button.
            # Preserve that heading, but exclude controls such as "Print Resep".
            for heading in tag.find_all(_HEADING_TAGS):
                if visit(heading):
                    return True
            return False

        for child in tag.children:
            if isinstance(child, Tag):
                if visit(child):
                    return True
                if tag is scope and child is stop_after:
                    break
            elif isinstance(child, Comment):
                continue
            elif isinstance(child, NavigableString):
                _append_dom_line(lines, str(child))
        return False

    visit(scope)
    return lines


# Purpose: Find the immediate child of a scope that contains a descendant tag.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe_container_text(); has no downstream local function calls.
def _direct_branch(scope: Tag, descendant: Tag) -> Tag:
    branch = descendant
    while branch.parent is not scope:
        parent = branch.parent
        if not isinstance(parent, Tag):
            raise WebsiteImportError("recipe_not_found")
        branch = parent
    return branch


# Purpose: Select one unambiguous recipe root, title, and ordered section pair.
# Connects to: Called by server/src/server/recipe_url_import.py::{extract_recipe_container_text(),extract_recipe_group_structure()}; calls server/src/server/recipe_url_import.py::{_section_kind(),_normalized_dom_text(),_is_descendant()} and uses server/src/server/recipe_url_import.py::_is_recipe_root() as a BeautifulSoup predicate.
def _recipe_dom_candidate(soup: BeautifulSoup) -> tuple[Tag, Tag, Tag, Tag]:
    dom_order = {id(tag): index for index, tag in enumerate(soup.find_all(True))}
    ingredients = [
        tag
        for tag in soup.find_all(True)
        if isinstance(tag, Tag) and _section_kind(tag) == "ingredients"
    ]
    instructions = [
        tag
        for tag in soup.find_all(True)
        if isinstance(tag, Tag) and _section_kind(tag) == "instructions"
    ]

    candidates: list[tuple[Tag, Tag, Tag, Tag]] = []
    seen_roots: set[int] = set()
    for root in soup.find_all(_is_recipe_root):
        if id(root) in seen_roots:
            continue
        seen_roots.add(id(root))
        root_ingredients = [tag for tag in ingredients if _is_descendant(tag, root)]
        root_instructions = [tag for tag in instructions if _is_descendant(tag, root)]
        if len(root_ingredients) != 1 or len(root_instructions) != 1:
            continue

        ingredient_heading = root_ingredients[0]
        instruction_heading = root_instructions[0]
        if dom_order[id(instruction_heading)] <= dom_order[id(ingredient_heading)]:
            continue

        preceding_titles = [
            tag
            for tag in root.find_all(_HEADING_TAGS)
            if _section_kind(tag) is None
            and _normalized_dom_text(tag)
            and dom_order[id(tag)] < dom_order[id(ingredient_heading)]
        ]
        if not preceding_titles:
            continue
        h1_titles = [tag for tag in preceding_titles if tag.name == "h1"]
        title = max(h1_titles or preceding_titles, key=lambda tag: dom_order[id(tag)])
        candidates.append((root, title, ingredient_heading, instruction_heading))

    minimal_candidates = [
        candidate
        for candidate in candidates
        if not any(
            other[0] is not candidate[0] and _is_descendant(other[0], candidate[0])
            for other in candidates
        )
    ]
    if len(minimal_candidates) != 1:
        raise WebsiteImportError("recipe_not_found")
    return minimal_candidates[0]


# Purpose: Extract a bounded recipe-only text candidate from cleaned page HTML.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/recipe_url_import.py::{_clean_dom(),_recipe_dom_candidate(),_lowest_common_ancestor(),_direct_branch(),_normalized_dom_text(),_serialize_recipe_scope()}.
def extract_recipe_container_text(
    html: str,
    *,
    max_chars: int,
) -> str:
    soup = BeautifulSoup(html, "html.parser")
    _clean_dom(soup)
    _root, title, ingredient_heading, instruction_heading = _recipe_dom_candidate(soup)
    scope = _lowest_common_ancestor(ingredient_heading, instruction_heading)
    ingredient_branch = _direct_branch(scope, ingredient_heading)
    instruction_branch = _direct_branch(scope, instruction_heading)
    # NOTE: A wrapped instruction section gives us a safe structural end point;
    # flat heading/list markup has no such boundary and keeps existing behavior.
    stop_after = (
        instruction_branch
        if ingredient_branch is not instruction_branch
        and instruction_branch is not instruction_heading
        else None
    )
    lines = [
        _normalized_dom_text(title),
        *_serialize_recipe_scope(
            scope,
            title=title,
            stop_after=stop_after,
            instruction_heading=instruction_heading,
        ),
    ]
    serialized = "\n".join(lines).strip()
    if not serialized or len(serialized) > max_chars:
        raise WebsiteImportError("recipe_not_found")
    return serialized


# Purpose: Return descendant tags located between two section markers in DOM order.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe_group_structure(); has no downstream local function calls.
def _section_tags(
    scope: Tag,
    start: Tag,
    end: Tag | None,
) -> list[Tag]:
    tags = [tag for tag in scope.find_all(True) if isinstance(tag, Tag)]
    positions = {id(tag): index for index, tag in enumerate(tags)}
    start_index = positions.get(id(start))
    if start_index is None:
        return []
    end_index = positions.get(id(end)) if end is not None else None
    return tags[start_index + 1:end_index]


# Purpose: Recognize a colon-ended plain-text label immediately followed by a list.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe_group_structure(); calls server/src/server/recipe_url_import.py::{_normalized_dom_text(),recipe_section_name()}.
def _plain_list_label(tag: Tag) -> str | None:
    if tag.name not in {"p", "div"}:
        return None
    text = _normalized_dom_text(tag)
    if not text.endswith(":") or recipe_section_name(text) is not None:
        return None
    sibling = tag.find_next_sibling()
    return text if sibling is not None and sibling.name in {"ul", "ol"} else None


# Purpose: Recognize a bounded label-only ingredient row followed by ingredients.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe_group_structure(); calls server/src/server/recipe_url_import.py::_normalized_dom_text().
def _ingredient_item_label(item: Tag, has_following_item: bool) -> str | None:
    text = _normalized_dom_text(item)
    if (
        not has_following_item
        or not text.endswith(":")
        or len(text) > 80
        or re.match(r"^[\d.,/\s¼½¾⅓⅔⅛]+", text)
    ):
        return None
    return text.removesuffix(":").strip() or None


# Purpose: Extract verified ingredient and instruction group boundaries from HTML.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::_enrich_primary_groups(); calls server/src/server/recipe_url_import.py::{_clean_dom(),_recipe_dom_candidate(),_lowest_common_ancestor(),_section_tags(),_standalone_emphasis_text(),_normalized_dom_text(),_plain_list_label(),recipe_section_name(),_instruction_item_parts()}.
def extract_recipe_group_structure(html: str) -> ExtractedRecipeGroupStructure:
    soup = BeautifulSoup(html, "html.parser")
    _clean_dom(soup)
    _root, _title, ingredient_heading, instruction_heading = (
        _recipe_dom_candidate(soup)
    )
    scope = _lowest_common_ancestor(ingredient_heading, instruction_heading)

    ingredient_groups: list[ExtractedIngredientGroup] = []
    pending_title: str | None = None
    for tag in _section_tags(scope, ingredient_heading, instruction_heading):
        label = (
            _standalone_emphasis_text(tag)
            or (_normalized_dom_text(tag) if tag.name in _HEADING_TAGS else None)
            or _plain_list_label(tag)
        )
        if label and recipe_section_name(label) is None:
            pending_title = label.removesuffix(":").strip()
            continue
        if tag.name not in {"ul", "ol"} or tag.find_parent(["ul", "ol"]):
            continue
        list_items = [
            item
            for item in tag.find_all("li", recursive=False)
            if _normalized_dom_text(item)
        ]
        current_title = pending_title
        current_items: list[str] = []
        for index, item in enumerate(list_items):
            item_label = _ingredient_item_label(
                item,
                has_following_item=index + 1 < len(list_items),
            )
            if item_label is not None:
                if current_items:
                    ingredient_groups.append(
                        ExtractedIngredientGroup(current_title, current_items)
                    )
                current_title = item_label
                current_items = []
                continue
            current_items.append(_normalized_dom_text(item))
        if current_items:
            ingredient_groups.append(
                ExtractedIngredientGroup(current_title, current_items)
            )
        pending_title = None

    instruction_groups: list[ExtractedInstructionGroup] = []
    # NOTE: A plain item after a labeled item stays in the current group. This
    # preserves trailing directions such as "Enjoy!" without inventing a label.
    current_title: str | None = None
    current_label_prefix: str | None = None
    current_steps: list[str] = []
    instruction_level = (
        int(instruction_heading.name[1])
        if instruction_heading.name in _HEADING_TAGS
        else None
    )
    instruction_tags = _section_tags(scope, instruction_heading, None)
    for tag in instruction_tags:
        if (
            instruction_level is not None
            and tag.name in _HEADING_TAGS
            and int(tag.name[1]) <= instruction_level
            and not _normalized_dom_text(tag).endswith(":")
        ):
            break
        if tag.name != "ol" or tag.find_parent(["ul", "ol"]):
            continue
        for item in tag.find_all("li", recursive=False):
            label, _body, step = _instruction_item_parts(item)
            if not step:
                continue
            if label is not None:
                if current_title and current_steps:
                    instruction_groups.append(
                        ExtractedInstructionGroup(
                            current_title,
                            current_label_prefix,
                            current_steps,
                        )
                    )
                current_title = label.removesuffix(":").strip()
                current_label_prefix = label
                current_steps = []
            if current_title is not None:
                current_steps.append(step)
    if current_title and current_steps:
        instruction_groups.append(
            ExtractedInstructionGroup(
                current_title,
                current_label_prefix,
                current_steps,
            )
        )

    return ExtractedRecipeGroupStructure(
        ingredient_groups if len(ingredient_groups) >= 2 else [],
        instruction_groups if len(instruction_groups) >= 2 else [],
    )


# Purpose: Collect one Notes section across nested wrappers without crossing its boundary.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe_dom_metadata(); calls server/src/server/recipe_url_import.py::{_normalized_dom_text(),_standalone_emphasis_text()}.
def _bounded_notes_text(root: Tag, heading: Tag) -> str | None:
    heading_level = (
        int(heading.name[1]) if heading.name in _HEADING_TAGS else None
    )
    lines: list[str] = []
    after_heading = False
    for tag in root.find_all(True):
        if tag is heading:
            after_heading = True
            continue
        if not after_heading or heading in tag.parents:
            continue
        if tag.name in _HEADING_TAGS and (
            heading_level is None or int(tag.name[1]) <= heading_level
        ):
            break
        if heading_level is None and _standalone_emphasis_text(tag):
            break
        if tag.name == "button" or tag.find_parent("button") is not None:
            continue
        if tag.name not in {"p", "li", "dd", "div", "section", "span"}:
            continue
        if tag.find(
            [*(_HEADING_TAGS), "p", "li", "dd", "div", "section", "span"]
        ):
            continue
        text = _normalized_dom_text(tag)
        if text:
            lines.append(text)

    candidate = "\n".join(lines).strip()
    return candidate if candidate and len(candidate) <= 20_000 else None


# Purpose: Extract one exact Notes block and one recognized passive time label/value.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/recipe_url_import.py::{_clean_dom(),_recipe_dom_candidate(),_normalized_dom_text(),_standalone_emphasis_text()}.
def extract_recipe_dom_metadata(html: str) -> ExtractedRecipeDomMetadata:
    soup = BeautifulSoup(html, "html.parser")
    _clean_dom(soup)
    root, _title, _ingredient_heading, _instruction_heading = (
        _recipe_dom_candidate(soup)
    )

    note_headings = []
    for tag in root.find_all(_HEADING_TAGS | {"p", "div"}):
        text = _normalized_dom_text(tag)
        if tag.name in {"p", "div"} and _standalone_emphasis_text(tag) != text:
            continue
        if text.removesuffix(":").strip().casefold() in _NOTES_HEADINGS:
            note_headings.append(tag)

    notes = None
    if len(note_headings) == 1:
        notes = _bounded_notes_text(root, note_headings[0])

    passive_times: list[tuple[str, str]] = []
    for tag in root.find_all(["span", "p", "div", "dt"]):
        label_text = _normalized_dom_text(tag).removesuffix(":").strip()
        label = _PASSIVE_TIME_LABELS.get(label_text.casefold())
        if label is None:
            continue
        parent = tag.parent if isinstance(tag.parent, Tag) else None
        if parent is None:
            continue
        parent_text = _normalized_dom_text(parent)
        value_text = parent_text[len(_normalized_dom_text(tag)):].strip(" :–—-")
        if value_text:
            passive_times.append((label, value_text))

    # Nested label wrappers can yield the same rendered candidate more than once.
    passive_times = list(dict.fromkeys(passive_times))
    additional_label = passive_times[0][0] if len(passive_times) == 1 else None
    additional_text = passive_times[0][1] if len(passive_times) == 1 else None
    return ExtractedRecipeDomMetadata(notes, additional_label, additional_text)


# Purpose: Call an optional recipe-scrapers method without failing the full import.
# Connects to: Called by server/src/server/recipe_url_import.py::extract_recipe(); invokes the requested method on the recipe-scrapers object and has no downstream local function calls.
def _optional_value(scraper, method_name: str):
    try:
        return getattr(scraper, method_name)()
    except Exception:
        return None


# Purpose: Normalize recipe-scrapers output into the low-level extracted recipe model.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/recipe_url_import.py::{_optional_value(),extract_recipe()::clean_string(),extract_recipe()::clean_minutes()} and recipe_scrapers.scrape_html().
def extract_recipe(html: str, url: str) -> ExtractedRecipe:
    try:
        scraper = scrape_html(html, url, supported_only=False)
    except Exception as exc:
        raise WebsiteImportError("recipe_not_found") from exc

    raw_groups = _optional_value(scraper, "ingredient_groups") or []
    ingredient_groups = [
        ExtractedIngredientGroup(
            title=(group.purpose.strip() if group.purpose else None),
            ingredients=[
                ingredient.strip()
                for ingredient in group.ingredients
                if ingredient and ingredient.strip()
            ],
        )
        for group in raw_groups
        if getattr(group, "ingredients", None)
    ]
    if not ingredient_groups:
        raw_ingredients = _optional_value(scraper, "ingredients") or []
        ingredients = [
            ingredient.strip()
            for ingredient in raw_ingredients
            if ingredient and ingredient.strip()
        ]
        if ingredients:
            ingredient_groups = [ExtractedIngredientGroup(None, ingredients)]

    instructions = [
        instruction.strip()
        for instruction in (_optional_value(scraper, "instructions_list") or [])
        if instruction and instruction.strip()
    ]

    # Purpose: Retain only non-empty string values from optional scraper fields.
    # Connects to: Defined and called by server/src/server/recipe_url_import.py::extract_recipe() for title, description, and yield fields; has no downstream local function calls.
    def clean_string(value) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    # Purpose: Retain only non-negative integer durations from scraper output.
    # Connects to: Defined and called by server/src/server/recipe_url_import.py::extract_recipe() for prep_time, cook_time, and total_time fields; has no downstream local function calls.
    def clean_minutes(value) -> int | None:
        return value if isinstance(value, int) and value >= 0 else None

    raw_nutrients = _optional_value(scraper, "nutrients") or {}
    nutrients = (
        {
            key: value
            for key, value in raw_nutrients.items()
            if isinstance(key, str) and isinstance(value, str)
        }
        if isinstance(raw_nutrients, dict)
        else {}
    )

    # NOTE: Extraction only records a plausible source URL. The authenticated
    # image proxy resolves and validates its network target before downloading.
    image_url = None
    raw_image = _optional_value(scraper, "image")
    if isinstance(raw_image, str) and raw_image.strip():
        candidate = urljoin(url, raw_image.strip())
        try:
            parsed_image = urlsplit(candidate)
            image_port = parsed_image.port
            if (
                parsed_image.scheme.lower() in {"http", "https"}
                and parsed_image.hostname
                and parsed_image.username is None
                and parsed_image.password is None
                and image_port in {None, 80, 443}
            ):
                image_url = candidate
        except ValueError:
            pass

    return ExtractedRecipe(
        title=clean_string(_optional_value(scraper, "title")),
        description=clean_string(_optional_value(scraper, "description")),
        ingredient_groups=ingredient_groups,
        instructions=instructions,
        prep_time_minutes=clean_minutes(_optional_value(scraper, "prep_time")),
        cook_time_minutes=clean_minutes(_optional_value(scraper, "cook_time")),
        total_time_minutes=clean_minutes(_optional_value(scraper, "total_time")),
        yield_text=clean_string(_optional_value(scraper, "yields")),
        nutrients=nutrients,
        image_url=image_url,
    )
