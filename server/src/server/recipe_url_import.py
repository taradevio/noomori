from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from email.message import Message
from time import monotonic
from urllib.parse import SplitResult, urljoin, urlsplit

import urllib3
from recipe_scrapers import scrape_html


FETCH_DEADLINE_SECONDS = 8.0
MAX_HTML_BYTES = 3 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
USER_AGENT = "NoomoriRecipeImport/1.0"
_HTML_CONTENT_TYPES = {"text/html", "application/xhtml+xml"}
_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_REDIRECT_STATUSES = {301, 302, 303, 307, 308}


class WebsiteImportError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


@dataclass(frozen=True)
class FetchedRecipePage:
    html: str
    url: str
    hostname: str
    response_size: int


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


@dataclass(frozen=True)
class ExtractedIngredientGroup:
    title: str | None
    ingredients: list[str]


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
        raise WebsiteImportError("unsafe_url")

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
            raise WebsiteImportError("unsafe_url")
    except WebsiteImportError:
        raise
    except (OSError, UnicodeError, ValueError) as exc:
        raise WebsiteImportError("page_unavailable") from exc

    return parsed, addresses, port


def _host_header(hostname: str, parsed: SplitResult, port: int) -> str:
    rendered_host = f"[{hostname}]" if ":" in hostname else hostname
    default_port = 443 if parsed.scheme.lower() == "https" else 80
    return rendered_host if port == default_port else f"{rendered_host}:{port}"


def _request_path(parsed: SplitResult) -> str:
    path = parsed.path or "/"
    return f"{path}?{parsed.query}" if parsed.query else path


def _remaining(deadline: float) -> float:
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise WebsiteImportError("fetch_timeout")
    return remaining


def _decode_html(body: bytes, content_type: str) -> str:
    message = Message()
    message["content-type"] = content_type
    charset = message.get_content_charset() or "utf-8"
    try:
        return body.decode(charset, errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


def _fetch_from_address(
    parsed: SplitResult,
    address: str,
    port: int,
    deadline: float,
    accept: str,
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
                "User-Agent": USER_AGENT,
            },
            redirect=False,
            retries=False,
            preload_content=False,
            decode_content=True,
            assert_same_host=False,
            timeout=timeout,
        )
        return pool, response
    except Exception:
        pool.close()
        raise


def _fetch_public_resource(
    url: str,
    *,
    accepted_content_types: set[str],
    max_bytes: int,
    accept: str,
) -> _FetchedPublicResource:
    # NOTE: HTML and image downloads deliberately share one verified-IP path so
    # redirects cannot bypass the importer's DNS and SSRF checks.
    deadline = monotonic() + FETCH_DEADLINE_SECONDS
    current_url = url

    for redirect_count in range(MAX_REDIRECTS + 1):
        _remaining(deadline)
        parsed, addresses, port = _validated_target(current_url)
        last_error: Exception | None = None
        pool = None
        response = None

        for address in addresses:
            try:
                pool, response = _fetch_from_address(
                    parsed,
                    address,
                    port,
                    deadline,
                    accept,
                )
                break
            except WebsiteImportError:
                raise
            except (urllib3.exceptions.TimeoutError, TimeoutError, socket.timeout) as exc:
                last_error = exc
            except (OSError, urllib3.exceptions.HTTPError) as exc:
                last_error = exc

        if response is None or pool is None:
            if isinstance(
                last_error,
                (urllib3.exceptions.TimeoutError, TimeoutError, socket.timeout),
            ) or monotonic() >= deadline:
                raise WebsiteImportError("fetch_timeout") from last_error
            raise WebsiteImportError("page_unavailable") from last_error

        try:
            if response.status in _REDIRECT_STATUSES:
                location = response.headers.get("Location")
                if not location or redirect_count == MAX_REDIRECTS:
                    raise WebsiteImportError("page_unavailable")
                current_url = urljoin(current_url, location)
                continue

            if response.status != 200:
                raise WebsiteImportError("page_unavailable")

            content_type_header = response.headers.get("Content-Type")
            if not content_type_header:
                raise WebsiteImportError("unsupported_content_type")
            content_type = content_type_header.split(";", 1)[0].strip().lower()
            if content_type not in accepted_content_types:
                raise WebsiteImportError("unsupported_content_type")

            content_length = response.headers.get("Content-Length")
            try:
                declared_size = int(content_length) if content_length else None
            except ValueError:
                declared_size = None
            if declared_size is not None and declared_size > max_bytes:
                raise WebsiteImportError("page_too_large")

            chunks: list[bytes] = []
            response_size = 0
            for chunk in response.stream(amt=64 * 1024, decode_content=True):
                _remaining(deadline)
                response_size += len(chunk)
                if response_size > max_bytes:
                    raise WebsiteImportError("page_too_large")
                chunks.append(chunk)

            hostname = parsed.hostname.encode("idna").decode("ascii")  # type: ignore[union-attr]
            return _FetchedPublicResource(
                body=b"".join(chunks),
                url=current_url,
                hostname=hostname,
                response_size=response_size,
                content_type=content_type,
                content_type_header=content_type_header,
            )
        except (urllib3.exceptions.TimeoutError, TimeoutError, socket.timeout) as exc:
            raise WebsiteImportError("fetch_timeout") from exc
        except WebsiteImportError:
            raise
        except (OSError, urllib3.exceptions.HTTPError) as exc:
            raise WebsiteImportError("page_unavailable") from exc
        finally:
            response.close()
            pool.close()

    raise WebsiteImportError("page_unavailable")


def fetch_public_html(url: str) -> FetchedRecipePage:
    resource = _fetch_public_resource(
        url,
        accepted_content_types=_HTML_CONTENT_TYPES,
        max_bytes=MAX_HTML_BYTES,
        accept="text/html, application/xhtml+xml",
    )
    return FetchedRecipePage(
        html=_decode_html(resource.body, resource.content_type_header),
        url=resource.url,
        hostname=resource.hostname,
        response_size=resource.response_size,
    )


def fetch_public_image(url: str) -> FetchedRecipeImage:
    resource = _fetch_public_resource(
        url,
        accepted_content_types=_IMAGE_CONTENT_TYPES,
        max_bytes=MAX_IMAGE_BYTES,
        accept="image/jpeg, image/png, image/webp",
    )
    return FetchedRecipeImage(
        body=resource.body,
        url=resource.url,
        hostname=resource.hostname,
        response_size=resource.response_size,
        content_type=resource.content_type,
    )


def _optional_value(scraper, method_name: str):
    try:
        return getattr(scraper, method_name)()
    except Exception:
        return None


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

    def clean_string(value) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

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
        yield_text=clean_string(_optional_value(scraper, "yields")),
        nutrients=nutrients,
        image_url=image_url,
    )
