from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from email.message import Message
from time import monotonic
from urllib.parse import SplitResult, urljoin, urlsplit

import urllib3
from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from recipe_scrapers import scrape_html


FETCH_DEADLINE_SECONDS = 8.0
MAX_HTML_BYTES = 3 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
USER_AGENT = "NoomoriRecipeImport/1.0"
_HTML_CONTENT_TYPES = {"text/html", "application/xhtml+xml"}
_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
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
    "method": "instructions",
    "baking instructions": "instructions",
    "cara membuat": "instructions",
    "cara memasak": "instructions",
    "langkah": "instructions",
    "langkah-langkah": "instructions",
}
_RECIPE_IDENTIFIER = re.compile(r"(?:^|[-_])recipe(?:$|[-_])", re.IGNORECASE)
_NOISE_IDENTIFIER = re.compile(
    r"(?:^|[-_])(?:ad|ads|advert|advertisement|hidden|nav|navigation|newsletter|"
    r"related|recommend(?:ation|ations|ed)?|share|sharing|sidebar|social|"
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


def _normalized_dom_text(tag: Tag) -> str:
    return " ".join(_dom_text_with_breaks(tag).split())


def _identifier_matches(tag: Tag, pattern: re.Pattern[str]) -> bool:
    identifier = tag.get("id")
    classes = tag.get("class", [])
    values = ([identifier] if isinstance(identifier, str) else []) + (
        classes if isinstance(classes, list) else [classes]
    )
    return any(isinstance(value, str) and pattern.search(value) for value in values)


def _is_recipe_root(tag: Tag) -> bool:
    return tag.name in {"article", "main"} or _identifier_matches(
        tag,
        _RECIPE_IDENTIFIER,
    )


def recipe_section_name(value: str) -> str | None:
    # NOTE: Sasa renders "Bahan- Bahan"; normalizing whitespace around hyphens
    # handles that markup variation while the final alias lookup remains exact.
    normalized = value.strip().removesuffix(":").strip().casefold()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"\s*-\s*", "-", normalized)
    return _RECIPE_SECTION_NAMES.get(normalized)


def _section_kind(tag: Tag) -> str | None:
    if tag.name not in _HEADING_TAGS | {"p", "div"}:
        return None

    text = _normalized_dom_text(tag)
    if tag.name in {"p", "div"}:
        emphasis = tag.find(["strong", "b"])
        emphasized_text = (
            _normalized_dom_text(emphasis)
            if emphasis is not None
            else None
        )
        if recipe_section_name(text) != recipe_section_name(emphasized_text or ""):
            return None

    return recipe_section_name(text)


def _is_descendant(tag: Tag, ancestor: Tag) -> bool:
    return tag is ancestor or any(parent is ancestor for parent in tag.parents)


def _lowest_common_ancestor(first: Tag, second: Tag) -> Tag:
    first_ancestors = {id(first), *(id(parent) for parent in first.parents)}
    current: Tag | None = second
    while current is not None:
        if id(current) in first_ancestors:
            return current
        parent = current.parent
        current = parent if isinstance(parent, Tag) else None
    raise WebsiteImportError("recipe_not_found")


def _clean_dom(soup: BeautifulSoup) -> None:
    for tag in list(soup.find_all(True)):
        if tag.parent is None:
            continue
        style = tag.get("style")
        if (
            tag.name in _REMOVED_TAGS
            or str(tag.get("role", "")).casefold() == "navigation"
            or tag.has_attr("hidden")
            or str(tag.get("aria-hidden", "")).casefold() == "true"
            or (isinstance(style, str) and _HIDDEN_STYLE.search(style))
            or _identifier_matches(tag, _NOISE_IDENTIFIER)
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


def _append_dom_line(lines: list[str], value: str, *, subgroup: bool = False) -> None:
    for raw_line in value.replace("\xa0", " ").splitlines():
        line = " ".join(raw_line.split())
        if line:
            if subgroup and not line.endswith(":"):
                line += ":"
            lines.append(line)


def _serialize_recipe_scope(scope: Tag, *, title: Tag) -> list[str]:
    lines: list[str] = []

    def visit(tag: Tag) -> None:
        if tag is title:
            return
        section_kind = _section_kind(tag)
        if section_kind is not None:
            _append_dom_line(lines, _normalized_dom_text(tag))
            return

        if tag.name in _HEADING_TAGS:
            _append_dom_line(lines, _normalized_dom_text(tag), subgroup=True)
            return

        if tag.name in {"ul", "ol"}:
            for index, item in enumerate(tag.find_all("li", recursive=False), start=1):
                prefix = "-" if tag.name == "ul" else f"{index}."
                _append_dom_line(lines, f"{prefix} {_dom_text_with_breaks(item)}")
            return

        if tag.name == "p":
            _append_dom_line(lines, _dom_text_with_breaks(tag))
            return

        if tag.name == "br":
            return

        if tag.name == "button":
            # NOTE: Recipe accordions may place their h2 label inside a button.
            # Preserve that heading, but exclude controls such as "Print Resep".
            for heading in tag.find_all(_HEADING_TAGS):
                visit(heading)
            return

        for child in tag.children:
            if isinstance(child, Tag):
                visit(child)
            elif isinstance(child, Comment):
                continue
            elif isinstance(child, NavigableString):
                _append_dom_line(lines, str(child))

    visit(scope)
    return lines


def extract_recipe_container_text(
    html: str,
    *,
    max_chars: int,
) -> str:
    soup = BeautifulSoup(html, "html.parser")
    _clean_dom(soup)
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

    _root, title, ingredient_heading, instruction_heading = minimal_candidates[0]
    scope = _lowest_common_ancestor(ingredient_heading, instruction_heading)
    lines = [
        _normalized_dom_text(title),
        *_serialize_recipe_scope(scope, title=title),
    ]
    serialized = "\n".join(line for line in lines if line).strip()
    if not serialized or len(serialized) > max_chars:
        raise WebsiteImportError("recipe_not_found")
    return serialized


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
