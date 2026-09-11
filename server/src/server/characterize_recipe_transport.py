from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from time import perf_counter
from typing import TextIO

from pydantic import ValidationError

from server.modules.recipes.schemas import ImportRecipeUrlRequest
from server.recipe_url_import import (
    WebsiteImportError,
    assert_html_browser_profile_supported,
    fetch_public_html,
)


MANIFEST_URL_COUNT = 20
TRANSPORTS = ("urllib3", "curl_cffi")


def _read_manifest(path: Path) -> list[str]:
    urls: list[str] = []
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            urls.append(str(ImportRecipeUrlRequest(url=line).url))
        except ValidationError as exc:
            raise ValueError(
                f"manifest line {line_number} is not a valid import URL"
            ) from exc

    if len(urls) != MANIFEST_URL_COUNT:
        raise ValueError(
            f"manifest must contain exactly {MANIFEST_URL_COUNT} URLs; "
            f"found {len(urls)}"
        )
    return urls


def run_characterization(urls: Sequence[str], output: TextIO) -> int:
    if len(urls) != MANIFEST_URL_COUNT:
        raise ValueError(
            f"characterization requires exactly {MANIFEST_URL_COUNT} URLs"
        )

    assert_html_browser_profile_supported()
    had_unexpected_error = False

    for transport in TRANSPORTS:
        for url in urls:
            started_at = perf_counter()
            try:
                page = fetch_public_html(url, transport=transport)
                record = {
                    "hostname": page.hostname,
                    "transport": transport,
                    "result": "success",
                    "upstream_status": 200,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 1),
                    "response_size": page.response_size,
                    "request_round_count": page.request_round_count,
                    "address_attempt_count": page.address_attempt_count,
                    "retry_reason": page.retry_reason,
                }
            except WebsiteImportError as exc:
                record = {
                    "hostname": exc.hostname or "unknown",
                    "transport": transport,
                    "result": exc.detail,
                    "upstream_status": exc.upstream_status,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 1),
                    "response_size": exc.response_size,
                    "request_round_count": exc.request_round_count,
                    "address_attempt_count": exc.address_attempt_count,
                    "retry_reason": exc.retry_reason,
                }
            except Exception:
                had_unexpected_error = True
                record = {
                    "hostname": "unknown",
                    "transport": transport,
                    "result": "unexpected_error",
                    "upstream_status": None,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 1),
                    "response_size": 0,
                    "request_round_count": 0,
                    "address_attempt_count": 0,
                    "retry_reason": None,
                }

            output.write(json.dumps(record, separators=(",", ":"), sort_keys=True))
            output.write("\n")
            output.flush()

    return 1 if had_unexpected_error else 0


def _main(argv: Sequence[str] | None = None, output: TextIO = sys.stdout) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Compare Noomori's urllib3 and curl-cffi HTML transports without "
            "printing URLs or response content."
        )
    )
    parser.add_argument(
        "manifest",
        type=Path,
        help="UTF-8 file containing exactly 20 recipe URLs, one per line",
    )
    args = parser.parse_args(argv)

    try:
        urls = _read_manifest(args.manifest)
        return run_characterization(urls, output)
    except (OSError, RuntimeError, ValueError) as exc:
        parser.error(str(exc))


def main() -> None:
    raise SystemExit(_main())
