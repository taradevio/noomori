import re
import unicodedata

from server.modules.recipes.schemas import ImportedRecipeTextDraft, RecipeNutrition
from server.recipe_url_import import recipe_section_name


RECIPE_UNITS = (
    "tsp", "tbsp", "cup", "ml", "L", "mg", "g", "kg", "oz", "lb",
    "piece", "clove", "slice", "can", "pack", "bunch", "pinch",
)


_SECTION_NAMES = {
    "note": "notes",
    "notes": "notes",
    "key notes": "notes",
    "recipe notes": "notes",
    "chef's notes": "notes",
    "chef’s notes": "notes",
    "cook's notes": "notes",
    "cook’s notes": "notes",
    "important notes": "notes",
    "additional notes": "notes",
    "helpful notes": "notes",
    "tips & notes": "notes",
    "tips and notes": "notes",
    "notes & tips": "notes",
    "notes and tips": "notes",
}
_LIST_PREFIX = re.compile(r"^(?:[-*\u2022]\s+|\d+[.)]\s+)")
_MARKDOWN_EMPHASIS = re.compile(
    r"(?<!\w)(?P<mark>\*{1,3}|_{1,3})(?=\S)(?P<text>.+?)(?<=\S)(?P=mark)(?!\w)"
)
_VULGAR_FRACTIONS = "¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"
_QUANTITY_PREFIX = re.compile(
    rf"^(?P<quantity>(?:(?:\d+\s*)?[{_VULGAR_FRACTIONS}])|(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+(?:\.\d+)?)|(?:\.\d+))(?=\s|[A-Za-z]|$)"
)
_DURATION_PART = re.compile(
    r"(?P<value>\d+)\s*(?P<unit>hours?|hrs?|h|minutes?|mins?|m)\b",
    re.IGNORECASE,
)
_METADATA_LINE = re.compile(
    r"^(?P<label>servings|yield|prep(?:aration)?(?:\s*time)?|cook(?:ing)?(?:\s*time)?|additional\s*time|total\s*time)\b\s*:?\s*(?P<value>.*)$",
    re.IGNORECASE,
)
_EMBEDDED_SERVINGS = re.compile(
    r"\bservings\s*:\s*(?P<value>[1-9]\d*)\b",
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


# Purpose: Normalize one source line by removing heading marks and emphasis syntax.
# Connects to: The main text parser and DOM nutrition extraction preprocessing.
def _plain_line(line: str) -> str:
    line = line.strip().lstrip("#").strip()
    return _MARKDOWN_EMPHASIS.sub(r"\g<text>", line).strip()


# Purpose: Split a complete Markdown table row into trimmed cell values.
# Connects to: Markdown-rule detection and metadata-table expansion.
def _markdown_cells(line: str) -> list[str] | None:
    if not line.startswith("|") or not line.endswith("|"):
        return None
    return [cell.strip() for cell in line[1:-1].split("|")]


# Purpose: Identify horizontal rules and Markdown table separator rows.
# Connects to: The main parser's removal of non-content lines.
def _is_markdown_rule(line: str) -> bool:
    compact = re.sub(r"\s+", "", line)
    if re.fullmatch(r"(?:-{3,}|\*{3,}|_{3,})", compact):
        return True
    cells = _markdown_cells(line)
    return bool(
        cells and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)
    )


# Purpose: Remove bullets or numbered-list markers from a content line.
# Connects to: Ingredient, instruction, note, and nutrition parsing.
def _without_list_prefix(line: str) -> str:
    return _LIST_PREFIX.sub("", line.strip()).strip()


# Purpose: Detect standalone step labels that should not become instructions.
# Connects to: Instruction handling in the main recipe text parser.
def _is_instruction_marker(value: str) -> bool:
    return bool(_INSTRUCTION_MARKER.fullmatch(" ".join(value.split())))


# Purpose: Convert supported hour/minute text into a total minute count.
# Connects to: Metadata parsing for prep, cook, additional, and total times.
def _duration_minutes(value: str) -> int | None:
    parts = list(_DURATION_PART.finditer(value))
    if parts:
        return sum(
            int(part.group("value"))
            * (60 if part.group("unit").lower().startswith("h") else 1)
            for part in parts
        )
    bare = re.fullmatch(r"\s*(\d+)\s*", value)
    return int(bare.group(1)) if bare else None


# Purpose: Parse a metadata line and report whether the following line was consumed.
# Connects to: Main parsing of servings, yield, and duration fields.
def _metadata(
    line: str,
    following: str | None,
) -> tuple[str, int | str | None, bool] | None:
    match = _METADATA_LINE.match(line)
    if not match:
        return None

    label = match.group("label").lower()
    raw_value = match.group("value").strip()
    from_following = not raw_value and following is not None
    candidate = following if from_following else raw_value

    if label == "yield":
        valid = raw_value or (
            candidate if candidate and re.search(r"\b[1-9]\d*\b", candidate)
            else None
        )
        return label, valid, from_following and valid is not None

    if label == "servings":
        servings = re.match(r"([1-9]\d*)\b", candidate or "")
        value = int(servings.group(1)) if servings else None
        return label, value, from_following and value is not None

    value = _duration_minutes(candidate or "")
    if label.startswith("prep"):
        key = "prep_time_minutes"
    elif label.startswith("cook"):
        key = "cook_time_minutes"
    else:
        key = label
    return key, value, from_following and value is not None


# Purpose: Convert decimal, fractional, mixed, or vulgar-fraction quantities to floats.
# Connects to: Ingredient quantities and alternate-measurement validation.
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
# Connects to: Ingredient parsing, unit aliases, and unit-dimension safeguards.
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
# Connects to: Ingredient groups assembled by the main text parser.
def _ingredient(line: str) -> dict:
    name = _without_list_prefix(line)
    quantity = None
    unit = None
    note = None
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
# Connects to: Nutrition line parsing and supported nutrition-unit aliases.
def _nutrition_value(value: str, unit_kind: str) -> float | None:
    match = _NUTRITION_VALUE.fullmatch(value.strip())
    if not match or match.group("unit").lower() not in _NUTRITION_UNITS[unit_kind]:
        return None
    return float(match.group("value").replace(",", ""))


# Purpose: Extract supported nutrients while carrying labels split across lines.
# Connects to: Pasted-text and website DOM nutrition parsing.
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
# Connects to: Website-import normalization and shared nutrition line parsing.
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


# Purpose: Transform normalized recipe text into a validated editable recipe draft.
# Connects to: Text import endpoints and the website DOM fallback pipeline.
def parse_recipe_text(text: str) -> ImportedRecipeTextDraft:
    title = None
    section = None
    description_lines: list[str] = []
    ingredients: list[dict] = []
    instructions: list[dict] = []
    current_group: dict | None = None
    values: dict[str, int] = {}
    nutrition_values: dict[str, float] = {}
    pending_nutrition: tuple[str, str] | None = None

    lines = [_plain_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line and not _is_markdown_rule(line)]
    expanded_lines: list[str] = []
    index = 0
    while index < len(lines):
        headers = _markdown_cells(lines[index])
        following = (
            _markdown_cells(lines[index + 1])
            if index + 1 < len(lines)
            else None
        )
        metadata_lines = (
            [
                f"{header}: {value}"
                for header, value in zip(headers, following)
                if _METADATA_LINE.match(header)
            ]
            if headers and following and len(headers) == len(following)
            else []
        )
        if metadata_lines:
            expanded_lines.extend(metadata_lines)
            index += 2
        else:
            expanded_lines.append(lines[index])
            index += 1
    lines = expanded_lines
    index = 0

    while index < len(lines):
        line = lines[index]
        following = lines[index + 1] if index + 1 < len(lines) else None
        index += 1

        normalized_heading = line.rstrip(":").strip()
        if _NUTRITION_HEADING.fullmatch(normalized_heading):
            section = "nutrition"
            current_group = None
            pending_nutrition = None
            continue

        # NOTE: Website fallback and pasted text share the same exact recipe
        # section aliases; notes remain parser-only headings.
        section_name = recipe_section_name(line) or _SECTION_NAMES.get(
            normalized_heading.lower()
        )
        if section_name:
            section = section_name
            current_group = None
            pending_nutrition = None
            continue

        metadata = _metadata(line, following)
        if metadata is None and section is None:
            embedded_servings = _EMBEDDED_SERVINGS.search(line)
            if embedded_servings:
                metadata = (
                    "servings",
                    int(embedded_servings.group("value")),
                    False,
                )
        if metadata:
            key, value, consumed_following = metadata
            if consumed_following:
                index += 1
            if key == "yield" and isinstance(value, str):
                description_lines.append(f"Yield: {value}")
            elif key in {"servings", "prep_time_minutes", "cook_time_minutes"}:
                if isinstance(value, int):
                    values[key] = value
            continue

        if section == "nutrition":
            pending_nutrition, found = _nutrition_line(line, pending_nutrition)
            for key, value in found.items():
                # NOTE: Preserve the first valid source value when a pasted
                # nutrition table repeats a nutrient in another column or row.
                nutrition_values.setdefault(key, value)
            continue

        if section in {"ingredients", "instructions"} and line.endswith(":"):
            current_group = {
                "title": _without_list_prefix(line[:-1]) or None,
                "items" if section == "ingredients" else "steps": [],
            }
            groups = ingredients if section == "ingredients" else instructions
            groups.append(current_group)
            continue

        if section == "ingredients":
            if current_group is None:
                current_group = {"title": None, "items": []}
                ingredients.append(current_group)
            ingredient = _ingredient(line)
            if ingredient["name"]:
                current_group["items"].append(ingredient)
            continue

        if section == "instructions":
            if current_group is None:
                current_group = {"title": None, "steps": []}
                instructions.append(current_group)
            instruction = _without_list_prefix(line)
            if instruction and not _is_instruction_marker(instruction):
                current_group["steps"].append({"text": instruction})
            continue

        if section == "notes":
            note = _without_list_prefix(line)
            if note:
                description_lines.append(note)
            continue

        if title is None:
            title = _without_list_prefix(line)

    ingredients = [group for group in ingredients if group["items"]]
    instructions = [group for group in instructions if group["steps"]]
    signals = sum((bool(title), bool(ingredients), bool(instructions)))
    if signals < 2:
        raise ValueError("Could not identify enough recipe information")

    return ImportedRecipeTextDraft(
        title=title,
        description="\n".join(description_lines) or None,
        ingredients=ingredients,
        instructions=instructions,
        servings=values.get("servings"),
        prep_time_minutes=values.get("prep_time_minutes"),
        cook_time_minutes=values.get("cook_time_minutes"),
        nutrition_per_serving=(
            RecipeNutrition(**nutrition_values) if nutrition_values else None
        ),
    )
