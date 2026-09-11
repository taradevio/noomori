import re
import unicodedata

from server.modules.recipes.schemas import ImportedRecipeTextDraft, RecipeNutrition
from server.recipe_url_import import (
    _PASSIVE_TIME_LABELS,
    is_recipe_notes_heading,
    recipe_section_name,
)


RECIPE_UNITS = (
    "tsp", "tbsp", "cup", "ml", "L", "mg", "g", "kg", "oz", "lb",
    "piece", "clove", "slice", "can", "pack", "bunch", "pinch",
)


_LIST_PREFIX = re.compile(r"^(?:[-*\u2022]\s+|\d+[.)]\s+)")
_NUMBERED_LIST_PREFIX = re.compile(r"^\d+[.)]\s+\S")
_MARKDOWN_EMPHASIS = re.compile(
    r"(?<!\w)(?P<mark>\*{1,3}|_{1,3})(?=\S)(?P<text>.+?)(?<=\S)(?P=mark)(?!\w)"
)
_VULGAR_FRACTIONS = "¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"
_QUANTITY_PREFIX = re.compile(
    rf"^(?P<quantity>(?:(?:\d+\s*)?[{_VULGAR_FRACTIONS}])|(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+(?:\.\d+)?)|(?:\.\d+))(?=\s|[A-Za-z]|$)"
)
_RANGE_QUANTITY_PREFIX = re.compile(
    rf"^(?:(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+(?:\.\d+)?)|(?:\.\d+)|"
    rf"(?:(?:\d+\s*)?[{_VULGAR_FRACTIONS}]))\s*"
    rf"(?:[-\u2013\u2014]|to\b|or\b)\s*"
    rf"(?:(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+(?:\.\d+)?)|(?:\.\d+)|"
    rf"(?:(?:\d+\s*)?[{_VULGAR_FRACTIONS}]))(?=\s|[A-Za-z]|$)",
    re.IGNORECASE,
)
_DURATION_PART = re.compile(
    r"(?P<value>\d+)\s*(?P<unit>hours?|hrs?|h|minutes?|mins?|m)\b",
    re.IGNORECASE,
)
_PASSIVE_TIME_PATTERN = "|".join(
    re.escape(label).replace(r"\ ", r"\s+")
    for label in sorted(_PASSIVE_TIME_LABELS, key=len, reverse=True)
)
_METADATA_LINE = re.compile(
    rf"^(?P<label>servings?|serves|porsi|yield|prep(?:aration)?(?:\s*time)?|cook(?:ing)?(?:\s*time)?|{_PASSIVE_TIME_PATTERN}|total(?:\s*time)?)\b\s*:?\s*(?P<value>.*)$",
    re.IGNORECASE,
)
_EMBEDDED_SERVINGS = re.compile(
    r"\bservings\s*:\s*(?P<value>[1-9]\d*)"
    r"(?!\d|\s*(?:[-\u2013\u2014]|to\b|or\b))",
    re.IGNORECASE,
)
_PARENTHESIZED_SIZE = re.compile(r"^\((?P<note>[^)]+)\)\s+(?P<rest>.+)$")
_NUTRITION_HEADING = re.compile(
    r"^nutrition(?:al)?(?:\s+(?:facts|information))?(?:\s*(?:\(\s*per\s+serving\s*\)|per\s+serving))?$",
    re.IGNORECASE,
)
_NUTRITION_VALUE = re.compile(
    r"^(?P<value>(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s*(?P<unit>[A-Za-z]+)\.?$"
)
_INSTRUCTION_MARKER = re.compile(
    r"^(?:\d+[.)]?|(?:langkah|step)\s+\d+"
    r"(?:\s*(?:/|dari)\s*\d+)?[.)]?)$",
    re.IGNORECASE,
)
_DOM_NUTRITION_PER_SERVING = re.compile(
    r"(?:(?:nutrition(?:al)?(?: facts| information)?|"
    r"informasi(?: nilai)? gizi)\s*)?"
    r"(?:\(\s*)?per\s+(?:serving|portion|porsi)(?:\s*\))?",
    re.IGNORECASE,
)
# NOTE: Text import fills only the nutrition fields already supported by the
# recipe model; trans fat, percentages, and unknown nutrients are ignored.
_NUTRITION_LABELS = (
    ("total carbohydrates", "carbs_g", "g"),
    ("total carbohydrate", "carbs_g", "g"),
    ("dietary fiber", "fiber_g", "g"),
    ("dietary fibre", "fiber_g", "g"),
    ("saturated fat", "saturated_fat_g", "g"),
    ("lemak jenuh", "saturated_fat_g", "g"),
    ("total sugars", "sugar_g", "g"),
    ("total fat", "fat_g", "g"),
    ("carbohydrates", "carbs_g", "g"),
    ("carbohydrate", "carbs_g", "g"),
    ("cholesterol", "cholesterol_mg", "mg"),
    ("kolesterol", "cholesterol_mg", "mg"),
    ("calories", "calories_kcal", "cal"),
    ("kalori", "calories_kcal", "cal"),
    ("energi", "calories_kcal", "cal"),
    ("protein", "protein_g", "g"),
    ("sodium", "sodium_mg", "mg"),
    ("natrium", "sodium_mg", "mg"),
    ("fiber", "fiber_g", "g"),
    ("fibre", "fiber_g", "g"),
    ("serat", "fiber_g", "g"),
    ("sugars", "sugar_g", "g"),
    ("sugar", "sugar_g", "g"),
    ("gula", "sugar_g", "g"),
    ("carbs", "carbs_g", "g"),
    ("karbohidrat", "carbs_g", "g"),
    ("karbo", "carbs_g", "g"),
    ("fat", "fat_g", "g"),
    ("lemak", "fat_g", "g"),
)
_NUTRITION_UNITS = {
    "cal": {"cal", "kcal", "kkal", "calorie", "calories"},
    "g": {"g", "gr", "gram", "grams"},
    "mg": {"mg", "milligram", "milligrams"},
}
_UNIT_ALIASES = {
    "teaspoon": "tsp",
    "teaspoons": "tsp",
    "tablespoon": "tbsp",
    "tablespoons": "tbsp",
    "cups": "cup",
    "milliliter": "ml",
    "milliliters": "ml",
    "millilitre": "ml",
    "millilitres": "ml",
    "liter": "L",
    "liters": "L",
    "litre": "L",
    "litres": "L",
    "milligram": "mg",
    "milligrams": "mg",
    "gr": "g",
    "gram": "g",
    "grams": "g",
    "kilogram": "kg",
    "kilograms": "kg",
    "ounce": "oz",
    "ounces": "oz",
    "pound": "lb",
    "pounds": "lb",
    "lbs": "lb",
    "package": "pack",
    "packages": "pack",
    "pieces": "piece",
    "cloves": "clove",
    "slices": "slice",
    "cans": "can",
    "packs": "pack",
    "bunches": "bunch",
    "pinches": "pinch",
}
_UNITS_BY_LOWER = {
    **{unit.lower(): unit for unit in RECIPE_UNITS},
    **_UNIT_ALIASES,
}
_UNIT_DIMENSIONS = {
    **{unit: "mass" for unit in ("mg", "g", "kg", "oz", "lb")},
    **{unit: "volume" for unit in ("tsp", "tbsp", "cup", "ml", "L")},
}
_HEADER_LABELS = {"recipe overview", "recipe summary"}
_LINE_SPACING_NOISE = re.compile(
    r"^line\s+spacing\s*:\s*\d+(?:\.\d+)?$",
    re.IGNORECASE,
)
_SERVINGS_VALUE = re.compile(
    r"(?P<value>[1-9]\d*)(?:\s+(?:servings?|people|portions?))?",
    re.IGNORECASE,
)
_SERVINGS_RANGE = re.compile(
    r"[1-9]\d*\s*(?:[-\u2013\u2014]|to\b|or\b)\s*[1-9]\d*"
    r"(?:\s+(?:servings?|people|portions?))?",
    re.IGNORECASE,
)


class RecipeTextImportError(ValueError):
    # Purpose: Carry a stable parser failure code to the text-import API.
    # Connects to: Raised by parse_recipe_text(); mapped by recipes/service.py.
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# Purpose: Normalize one source line by removing heading marks and emphasis syntax.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::{parse_recipe_text(),_dom_nutrition()}; has no downstream local function calls.
def _plain_line(line: str) -> str:
    line = line.strip().lstrip("#").strip()
    return _MARKDOWN_EMPHASIS.sub(r"\g<text>", line).strip()


# Purpose: Split a complete Markdown table row into trimmed cell values.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::{_is_markdown_rule(),parse_recipe_text()}; has no downstream local function calls.
def _markdown_cells(line: str) -> list[str] | None:
    if not line.startswith("|") or not line.endswith("|"):
        return None
    return [cell.strip() for cell in line[1:-1].split("|")]


# Purpose: Identify horizontal rules and Markdown table separator rows.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::parse_recipe_text(); calls server/src/server/modules/recipes/imports/text.py::_markdown_cells().
def _is_markdown_rule(line: str) -> bool:
    compact = re.sub(r"\s+", "", line)
    if re.fullmatch(r"(?:-{3,}|\*{3,}|_{3,}|={3,}|~{3,}|\u2022{3,})", compact):
        return True
    cells = _markdown_cells(line)
    return bool(
        cells and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)
    )


# Purpose: Remove bullets or numbered-list markers from a content line.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::{_ingredient(),_nutrition_line(),parse_recipe_text()}; has no downstream local function calls.
def _without_list_prefix(line: str) -> str:
    return _LIST_PREFIX.sub("", line.strip()).strip()


# Purpose: Detect standalone step labels that should not become instructions.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::parse_recipe_text() and server/src/server/modules/recipes/imports/website.py::normalize_imported_website_recipe(); has no downstream local function calls.
def _is_instruction_marker(value: str) -> bool:
    return bool(_INSTRUCTION_MARKER.fullmatch(" ".join(value.split())))


# Purpose: Convert supported hour/minute text into a total minute count.
# Connects to: Called by metadata parsing helpers; has no downstream local function calls.
def _duration_minutes(value: str) -> int | None:
    parts = list(_DURATION_PART.finditer(value))
    remainder = _DURATION_PART.sub("", value)
    if parts and re.fullmatch(r"[\s,]*(?:and[\s,]*)?", remainder, re.IGNORECASE):
        return sum(
            int(part.group("value"))
            * (60 if part.group("unit").lower().startswith("h") else 1)
            for part in parts
        )
    bare = re.fullmatch(r"\s*(\d+)\s*", value)
    return int(bare.group(1)) if bare else None


# Purpose: Convert decimal, fractional, mixed, or vulgar-fraction quantities to floats.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::{_ingredient(),_without_alternate_measurement()}; has no downstream local function calls.
def _quantity(value: str) -> float:
    if value[-1] in _VULGAR_FRACTIONS:
        whole = value[:-1].strip()
        return (int(whole) if whole else 0) + unicodedata.numeric(value[-1])
    if " " in value:
        whole, fraction = value.split(" ", 1)
        numerator, denominator = fraction.split("/", 1)
        return int(whole) + int(numerator) / int(denominator)
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        return int(numerator) / int(denominator)
    return float(value)


# Purpose: Remove a redundant same-dimension alternate measurement from an ingredient.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::_ingredient(); calls server/src/server/modules/recipes/imports/text.py::_quantity() and reads this module's unit-alias/dimension tables.
def _without_alternate_measurement(name: str, primary_unit: str) -> str:
    # NOTE: The left-hand measurement is canonical. Remove only a valid
    # same-dimension alternate so uncertain or density-based text remains reviewable.
    if name.startswith("/"):
        alternate = name[1:].strip()
        trailing_name = None
    elif name.startswith("(") and ")" in name:
        alternate, trailing_name = name[1:].split(")", 1)
        alternate = alternate.strip()
        trailing_name = trailing_name.strip()
        if not trailing_name:
            return name
    else:
        return name

    quantity = _QUANTITY_PREFIX.match(alternate)
    if not quantity:
        return name

    try:
        _quantity(quantity.group("quantity"))
    except (ValueError, ZeroDivisionError):
        return name

    unit_text = alternate[quantity.end():].strip()
    if trailing_name is None:
        first, separator, remainder = unit_text.partition(" ")
        alternate_unit = _UNITS_BY_LOWER.get(first.rstrip(".").lower())
    else:
        separator = " "
        remainder = trailing_name
        alternate_unit = _UNITS_BY_LOWER.get(unit_text.rstrip(".").lower())
    if (
        not separator
        or not remainder.strip()
        or _UNIT_DIMENSIONS.get(primary_unit) is None
        or _UNIT_DIMENSIONS.get(primary_unit) != _UNIT_DIMENSIONS.get(alternate_unit)
    ):
        return name
    return remainder.strip()


# Purpose: Convert one ingredient line into name, quantity, unit, and note fields.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::parse_recipe_text() and server/src/server/modules/recipes/imports/website.py::normalize_imported_website_recipe(); calls server/src/server/modules/recipes/imports/text.py::{_without_list_prefix(),_quantity(),_without_alternate_measurement()}.
def _ingredient(line: str) -> dict:
    name = _without_list_prefix(" ".join(line.split()))
    quantity = None
    unit = None
    note = None
    if _RANGE_QUANTITY_PREFIX.match(name):
        return {"name": name, "quantity": None, "unit": None, "note": None}
    match = _QUANTITY_PREFIX.match(name)
    if match:
        raw_quantity = match.group("quantity")
        try:
            quantity = _quantity(raw_quantity)
            name = name[match.end():].strip()
        except (ValueError, ZeroDivisionError):
            quantity = None

    unit_text = name
    size = _PARENTHESIZED_SIZE.match(name)
    if size:
        unit_text = size.group("rest")

    first, separator, remainder = unit_text.partition(" ")
    recognized_unit = _UNITS_BY_LOWER.get(first.rstrip(".").lower())
    if quantity is not None and separator and recognized_unit:
        unit = recognized_unit
        name = _without_alternate_measurement(remainder.strip(), unit)
        note = size.group("note").strip() if size else None

    return {"name": name, "quantity": quantity, "unit": unit, "note": note}


# Purpose: Parse a numeric nutrition value only when its unit matches the field.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::_nutrition_line() and server/src/server/modules/recipes/imports/website.py::_website_nutrition_value(); has no downstream local function calls.
def _nutrition_value(value: str, unit_kind: str) -> float | None:
    match = _NUTRITION_VALUE.fullmatch(value.strip())
    if not match or match.group("unit").lower() not in _NUTRITION_UNITS[unit_kind]:
        return None
    return float(match.group("value").replace(",", ""))


# Purpose: Extract supported nutrients while carrying labels split across lines.
# Connects to: Called by server/src/server/modules/recipes/imports/text.py::{parse_recipe_text(),_dom_nutrition()}; calls server/src/server/modules/recipes/imports/text.py::{_without_list_prefix(),_nutrition_value()}.
def _nutrition_line(
    line: str,
    pending: tuple[str, str] | None,
) -> tuple[tuple[str, str] | None, dict[str, float]]:
    found: dict[str, float] = {}
    for raw_segment in line.split("|"):
        segment = _without_list_prefix(raw_segment)
        normalized = segment.lower()
        matched_label = False

        for label, key, unit_kind in _NUTRITION_LABELS:
            if normalized in {label, f"{label}:"}:
                pending = (key, unit_kind)
                matched_label = True
                break
            if normalized.startswith(f"{label}:") or normalized.startswith(
                f"{label} "
            ):
                raw_value = segment[len(label):].lstrip(" :")
                value = _nutrition_value(raw_value, unit_kind)
                pending = None
                if value is not None:
                    found.setdefault(key, value)
                matched_label = True
                break

        if matched_label:
            continue
        if pending is not None:
            key, unit_kind = pending
            value = _nutrition_value(segment, unit_kind)
            pending = None
            if value is not None:
                found.setdefault(key, value)

    return pending, found


# Purpose: Extract per-serving nutrition only from an explicitly labelled DOM section.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::_enrich_dom_nutrition(); calls server/src/server/modules/recipes/imports/text.py::{_plain_line(),_nutrition_line()} and server/src/server/recipe_url_import.py::recipe_section_name().
def _dom_nutrition(text: str) -> RecipeNutrition | None:
    # NOTE: Website values only map to nutrition_per_serving when the candidate
    # says so explicitly; recipe yield such as "6 Porsi" is not sufficient.
    lines = [_plain_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    markers = [
        index
        for index, line in enumerate(lines)
        if _DOM_NUTRITION_PER_SERVING.fullmatch(
            " ".join(line.rstrip(":").split())
        )
    ]
    if len(markers) != 1:
        return None

    values: dict[str, float] = {}
    pending: tuple[str, str] | None = None
    for line in lines[markers[0] + 1:]:
        if recipe_section_name(line) in {"ingredients", "instructions"}:
            break
        pending, found = _nutrition_line(line, pending)
        for key, value in found.items():
            values.setdefault(key, value)

    return RecipeNutrition(**values) if len(values) >= 2 else None


def _warn(warnings: set[str] | None, code: str) -> None:
    if warnings is not None:
        warnings.add(code)


def _resolve_passive_times(
    entries: list[tuple[str, str]], warnings: set[str] | None = None,
) -> tuple[str | None, int | None, list[str]]:
    parsed = {
        (_PASSIVE_TIME_LABELS[" ".join(label.casefold().split())], _duration_minutes(value))
        for label, value in entries
    }
    if len(parsed) == 1:
        label, minutes = next(iter(parsed))
        if minutes is not None and minutes > 0:
            return label, minutes, []
    if parsed:
        _warn(warnings, "multiple_passive_times" if len(parsed) > 1 else "explicit_time_parse_failed")
    return None, None, list(dict.fromkeys(f"{label}: {value}" for label, value in entries))


def _append_recovery_notes(notes: str | None, recovered: list[str]) -> str | None:
    parts = notes.splitlines() if notes else []
    for value in recovered:
        if value not in parts:
            parts.append(value)
    return "\n".join(parts) or None


def _normalized_lines(text: str) -> list[str | None]:
    text = (
        text.removeprefix("\ufeff")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\v", "\n")
        .replace("\f", "\n")
    )
    lines: list[str | None] = []
    blank_count = 0
    for raw_line in text.split("\n"):
        line = _plain_line(raw_line.replace("\xa0", " "))
        if not line or _is_markdown_rule(line):
            if lines and blank_count < 2:
                lines.append(None)
                blank_count += 1
            continue
        lines.append(line)
        blank_count = 0

    while lines and lines[-1] is None:
        lines.pop()
    return lines


def _next_line(
    lines: list[str | None],
    start: int,
) -> tuple[int, str] | None:
    for index in range(start, len(lines)):
        if lines[index] is not None:
            return index, lines[index]
    return None


def _expand_header_layout(lines: list[str | None]) -> list[str | None]:
    expanded: list[str | None] = []
    in_header = True
    for line in lines:
        if line is None:
            expanded.append(None)
            continue
        if in_header and "\t" in line:
            cells = [_plain_line(cell) for cell in line.split("\t")]
            cells = [cell for cell in cells if cell]
            if len(cells) > 1:
                expanded.extend(cells)
                if any(
                    recipe_section_name(cell)
                    or _NUTRITION_HEADING.fullmatch(cell.rstrip(":").strip())
                    for cell in cells
                ):
                    in_header = False
                continue
        line = re.sub(r"[ \t]+", " ", line).strip()
        expanded.append(line)
        if recipe_section_name(line) or _NUTRITION_HEADING.fullmatch(
            line.rstrip(":").strip()
        ):
            in_header = False

    lines = expanded
    expanded = []
    index = 0
    while index < len(lines):
        line = lines[index]
        headers = _markdown_cells(line) if line is not None else None
        following = _next_line(lines, index + 1)
        values = _markdown_cells(following[1]) if following else None
        if (
            headers
            and values
            and len(headers) == len(values)
            and sum(bool(_METADATA_LINE.match(header)) for header in headers) >= 2
        ):
            expanded.extend(headers)
            expanded.extend(values)
            index = following[0] + 1
            continue
        expanded.append(line)
        index += 1
    return expanded


def _metadata_key(label: str) -> str | None:
    normalized = " ".join(label.rstrip(":").casefold().split())
    if normalized in {"serving", "servings", "serves", "porsi"}:
        return "servings"
    if normalized == "yield":
        return "yield"
    if normalized.startswith(("prep", "preparation")):
        return "prep_time_minutes"
    if normalized.startswith(("cook", "cooking")):
        return "cook_time_minutes"
    if normalized in _PASSIVE_TIME_LABELS:
        return "additional_time"
    if normalized in {"total", "total time"}:
        return "total_time"
    return None


def _metadata_value(key: str, value: str) -> int | str | None:
    value = value.strip()
    if key == "yield":
        return value or None
    if key == "servings":
        match = _SERVINGS_VALUE.fullmatch(value)
        return int(match.group("value")) if match else None
    return _duration_minutes(value)


def _plausible_metadata_value(key: str, value: str) -> bool:
    if key == "additional_time":
        # Keep explicit but unparseable values, such as "overnight", reviewable.
        return bool(value.strip()) and not (
            _METADATA_LINE.match(value)
            or recipe_section_name(value)
            or is_recipe_notes_heading(value)
            or _NUTRITION_HEADING.fullmatch(value.rstrip(":").strip())
        )
    if key == "servings":
        return bool(
            _SERVINGS_VALUE.fullmatch(value.strip())
            or _SERVINGS_RANGE.fullmatch(value.strip())
        )
    if key == "yield":
        return bool(re.search(r"\b[1-9]\d*\b", value))
    return _duration_minutes(value) is not None


def _looks_like_unknown_label(line: str) -> bool:
    normalized = line.rstrip(":").strip()
    return bool(
        normalized
        and len(normalized) <= 40
        and len(normalized.split()) <= 5
        and not re.search(r"\d|[.!?]", normalized)
        and recipe_section_name(normalized) is None
        and normalized.casefold() not in _HEADER_LABELS
    )


def _flattened_metadata_block(
    lines: list[str | None],
    start: int,
) -> tuple[list[tuple[str, str, str, int]], int] | None:
    labels: list[tuple[str, str | None, int]] = []
    known_count = 0
    cursor = start
    while cursor < len(lines) and lines[cursor] is not None:
        line = lines[cursor]
        match = _METADATA_LINE.match(line)
        key = None
        if match and not match.group("value").strip():
            key = _metadata_key(match.group("label"))
        elif not labels or not _looks_like_unknown_label(line):
            break
        labels.append((line.rstrip(":").strip(), key, cursor))
        known_count += key is not None
        cursor += 1

    if known_count < 2 or len(labels) < 2:
        return None

    following = _next_line(lines, cursor)
    if following is None:
        return None
    cursor = following[0]
    values: list[tuple[str, int]] = []
    while cursor < len(lines) and len(values) < len(labels):
        line = lines[cursor]
        if line is not None:
            if recipe_section_name(line) or _NUTRITION_HEADING.fullmatch(
                line.rstrip(":").strip()
            ):
                return None
            values.append((line, cursor))
        cursor += 1
    if len(values) != len(labels):
        return None

    pairs: list[tuple[str, str, str, int]] = []
    for (label, key, label_index), (value, _value_index) in zip(labels, values):
        if key is not None and not _plausible_metadata_value(key, value):
            return None
        pairs.append((label, key or "unsupported", value, label_index))
    return pairs, cursor


def _matching_footer(line: str, title: str | None) -> bool:
    if title is None:
        return False
    match = re.fullmatch(r"[^\u2022]+\s*\u2022\s*([^\u2022]+)", line)
    return bool(
        match
        and " ".join(match.group(1).casefold().split())
        == " ".join(title.casefold().split())
    )


def _uncolonized_ingredient_group(
    lines: list[str | None],
    index: int,
) -> str | None:
    line = lines[index]
    if line is None or not re.match(r"^for(?:\s+the)?\s+\S", line, re.IGNORECASE):
        return None
    following = _next_line(lines, index + 1)
    if following is None or recipe_section_name(following[1]):
        return None
    ingredient = _ingredient(following[1])
    return line if ingredient["quantity"] is not None else None


def _ambiguous_numbered_block(lines: list[str | None], start: int) -> bool:
    count = 0
    cursor = start
    while cursor < len(lines):
        line = lines[cursor]
        if line is None or (line and recipe_section_name(line)):
            break
        if not _NUMBERED_LIST_PREFIX.match(line):
            break
        count += 1
        cursor += 1
    return count >= 2


def _has_multiple_recipes(lines: list[str | None]) -> bool:
    waiting_for_instructions = False
    complete_structures = 0
    for line in lines:
        if line is None:
            continue
        section = recipe_section_name(line)
        if section == "ingredients":
            waiting_for_instructions = True
        elif section == "instructions" and waiting_for_instructions:
            complete_structures += 1
            waiting_for_instructions = False
            if complete_structures >= 2:
                return True
    return False


def _inferred_unheaded_sections(
    lines: list[str | None],
) -> list[str | None] | None:
    if any(
        line
        and (
            recipe_section_name(line)
            or _NUTRITION_HEADING.fullmatch(line.rstrip(":").strip())
            or is_recipe_notes_heading(line)
            or line.rstrip(":").strip().casefold() in _HEADER_LABELS
        )
        for line in lines
    ):
        return None

    blocks: list[list[str]] = []
    block: list[str] = []
    for line in lines:
        if line is None:
            if block:
                blocks.append(block)
                block = []
        else:
            block.append(line)
    if block:
        blocks.append(block)

    if len(blocks) != 2:
        return None
    title_and_ingredients, numbered_instructions = blocks
    if len(title_and_ingredients) < 2 or len(numbered_instructions) < 2:
        return None
    title, *ingredient_lines = title_and_ingredients
    if _ingredient(title)["quantity"] is not None:
        return None
    if not all(
        (ingredient := _ingredient(line))["quantity"] is not None
        and ingredient["name"]
        for line in ingredient_lines
    ):
        return None
    if not all(_NUMBERED_LIST_PREFIX.match(line) for line in numbered_instructions):
        return None

    return [
        title,
        "Ingredients",
        *ingredient_lines,
        None,
        "Instructions",
        *numbered_instructions,
    ]


# Purpose: Transform normalized recipe text into a validated editable recipe draft.
# Connects to: Called by server/src/server/modules/recipes/service.py::import_recipe_text() and server/src/server/modules/recipes/imports/website.py::import_recipe_url(); returns ImportedRecipeTextDraft or a stable RecipeTextImportError.
def parse_recipe_text(
    text: str,
    warnings: set[str] | None = None,
    *,
    recovered_metadata: list[str] | None = None,
) -> ImportedRecipeTextDraft:
    title = None
    section = None
    description_entries: list[tuple[int, str]] = []
    recovery_notes: list[str] = []
    passive_times: list[tuple[str, str]] = []
    ingredients: list[dict] = []
    instructions: list[dict] = []
    current_group: dict | None = None
    metadata_entries: dict[str, list[tuple[int | str | None, str, int]]] = {}
    nutrition_values: dict[str, float] = {}
    pending_nutrition: tuple[str, str] | None = None
    continuing_numbered_step = False
    previous_blank = False

    lines = _expand_header_layout(_normalized_lines(text))
    inferred_lines = _inferred_unheaded_sections(lines)
    if inferred_lines is not None:
        lines = inferred_lines
        _warn(warnings, "inferred_structural_blocks_without_headings")
    if _has_multiple_recipes(lines):
        raise RecipeTextImportError("multiple_recipes")

    def record_metadata(label: str, key: str, raw_value: str, order: int) -> None:
        rendered = f"{label.rstrip(':')}: {raw_value.strip()}"
        if key == "additional_time":
            passive_times.append((label.rstrip(":"), raw_value.strip()))
            return
        if key == "unsupported":
            recovery_notes.append(rendered)
            _warn(warnings, "unsupported_metadata")
            return
        value = _metadata_value(key, raw_value)
        metadata_entries.setdefault(key, []).append((value, rendered, order))
        if key == "servings" and value is None and _SERVINGS_RANGE.fullmatch(
            raw_value.strip()
        ):
            _warn(warnings, "ambiguous_servings_range")

    def resolve_metadata(key: str) -> int | None:
        entries = metadata_entries.get(key, [])
        if not entries:
            return None
        values = {value for value, _rendered, _order in entries if value is not None}
        valid = len(values) == 1 and all(value is not None for value, _, _ in entries)
        if valid:
            value = next(iter(values))
            return value if isinstance(value, int) else None
        seen: set[str] = set()
        for _value, rendered, order in entries:
            if rendered.casefold() not in seen:
                recovery_notes.append(rendered)
                seen.add(rendered.casefold())
        if len(entries) > 1:
            _warn(warnings, "conflicting_metadata")
        return None

    index = 0

    while index < len(lines):
        line = lines[index]
        if line is None:
            previous_blank = True
            continuing_numbered_step = False
            index += 1
            continue
        line_order = index
        index += 1

        normalized_heading = line.rstrip(":").strip()
        if _NUTRITION_HEADING.fullmatch(normalized_heading):
            section = "nutrition"
            current_group = None
            pending_nutrition = None
            continuing_numbered_step = False
            previous_blank = False
            continue

        section_name = recipe_section_name(line) or (
            "notes" if is_recipe_notes_heading(line) else None
        )
        if section_name:
            section = section_name
            current_group = None
            pending_nutrition = None
            continuing_numbered_step = False
            previous_blank = False
            continue

        if section is None:
            flattened = _flattened_metadata_block(lines, line_order)
            if flattened:
                pairs, index = flattened
                for label, key, value, order in pairs:
                    record_metadata(label, key, value, order)
                previous_blank = False
                continue

            metadata_match = _METADATA_LINE.match(line)
            if metadata_match:
                label = metadata_match.group("label")
                key = _metadata_key(label)
                raw_value = metadata_match.group("value").strip()
                following = _next_line(lines, index) if not raw_value else None
                if (
                    not raw_value
                    and following is not None
                    and key is not None
                    and _plausible_metadata_value(key, following[1])
                ):
                    raw_value = following[1]
                    index = following[0] + 1
                if raw_value and key is not None:
                    record_metadata(label, key, raw_value, line_order)
                previous_blank = False
                continue

            embedded_servings = _EMBEDDED_SERVINGS.search(line)
            if embedded_servings:
                record_metadata(
                    "Servings",
                    "servings",
                    embedded_servings.group("value"),
                    line_order,
                )

        if section == "nutrition":
            pending_nutrition, found = _nutrition_line(line, pending_nutrition)
            for key, value in found.items():
                # NOTE: Preserve the first valid source value when a pasted
                # nutrition table repeats a nutrient in another column or row.
                nutrition_values.setdefault(key, value)
            previous_blank = False
            continue

        if section in {"ingredients", "instructions"} and line.endswith(":"):
            current_group = {
                "title": _without_list_prefix(line[:-1]) or None,
                "items" if section == "ingredients" else "steps": [],
            }
            groups = ingredients if section == "ingredients" else instructions
            groups.append(current_group)
            continuing_numbered_step = False
            previous_blank = False
            continue

        if section == "ingredients":
            if (
                previous_blank
                and any(group["items"] for group in ingredients)
                and _ambiguous_numbered_block(lines, line_order)
            ):
                raise RecipeTextImportError("ambiguous_structure")
            group_title = _uncolonized_ingredient_group(lines, line_order)
            if group_title:
                current_group = {"title": group_title, "items": []}
                ingredients.append(current_group)
                previous_blank = False
                continue
            if current_group is None:
                current_group = {"title": None, "items": []}
                ingredients.append(current_group)
            ingredient = _ingredient(line)
            if ingredient["name"]:
                current_group["items"].append(ingredient)
                if _RANGE_QUANTITY_PREFIX.match(_without_list_prefix(line)):
                    _warn(warnings, "ingredient_quantity_range")
            previous_blank = False
            continue

        if section == "instructions":
            if current_group is None:
                current_group = {"title": None, "steps": []}
                instructions.append(current_group)
            instruction = _without_list_prefix(line)
            numbered = bool(_NUMBERED_LIST_PREFIX.match(line))
            if instruction and not _is_instruction_marker(instruction) and numbered:
                current_group["steps"].append({"text": instruction})
                continuing_numbered_step = True
            elif instruction and not _is_instruction_marker(instruction):
                previous_step = (
                    current_group["steps"][-1]["text"]
                    if current_group["steps"]
                    else ""
                )
                if continuing_numbered_step and previous_step:
                    current_group["steps"][-1]["text"] += f" {instruction}"
                else:
                    current_group["steps"].append({"text": instruction})
                    continuing_numbered_step = False
            else:
                continuing_numbered_step = False
            previous_blank = False
            continue

        if section == "notes":
            note = _without_list_prefix(line)
            if note and not _matching_footer(note, title):
                description_entries.append((line_order, note))
            previous_blank = False
            continue

        if _LINE_SPACING_NOISE.fullmatch(line):
            _warn(warnings, "clipboard_noise_removed")
        elif normalized_heading.casefold() in _HEADER_LABELS:
            pass
        elif title is None:
            title = _without_list_prefix(line)
        else:
            description_entries.append((line_order, _without_list_prefix(line)))
        previous_blank = False

    ingredients = [group for group in ingredients if group["items"]]
    instructions = [group for group in instructions if group["steps"]]
    signals = sum((bool(title), bool(ingredients), bool(instructions)))
    if signals < 2:
        raise RecipeTextImportError("insufficient_structure")

    servings = resolve_metadata("servings")
    prep_time_minutes = resolve_metadata("prep_time_minutes")
    cook_time_minutes = resolve_metadata("cook_time_minutes")
    total_time_minutes = resolve_metadata("total_time")

    for _value, rendered, order in metadata_entries.get("yield", []):
        recovery_notes.append(rendered)
    additional_time_label, additional_time_minutes, unresolved = _resolve_passive_times(
        passive_times, warnings,
    )
    recovery_notes.extend(unresolved)
    if recovered_metadata is not None:
        recovered_metadata.extend(dict.fromkeys(recovery_notes))

    description_entries.sort(key=lambda entry: entry[0])
    description = _append_recovery_notes(
        "\n".join(text for _order, text in description_entries), recovery_notes,
    )

    return ImportedRecipeTextDraft(
        title=title,
        description=description,
        ingredients=ingredients,
        instructions=instructions,
        servings=servings,
        prep_time_minutes=prep_time_minutes,
        cook_time_minutes=cook_time_minutes,
        total_time_minutes=total_time_minutes,
        additional_time_label=additional_time_label,
        additional_time_minutes=additional_time_minutes,
        nutrition_per_serving=(
            RecipeNutrition(**nutrition_values) if nutrition_values else None
        ),
    )
