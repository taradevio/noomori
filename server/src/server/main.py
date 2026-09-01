import uvicorn
import hashlib
import hmac
import logging
import re
import secrets
import unicodedata

from fastapi import FastAPI, HTTPException, Depends, Header, Response
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from server.api.health import router as health_router
from server.config import settings
from server.recipe_url_import import (
    ExtractedRecipe,
    WebsiteImportError,
    extract_recipe,
    fetch_public_html,
    fetch_public_image,
)
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions
from typing import Literal
from uuid import UUID

load_dotenv()
security = HTTPBearer()
logger = logging.getLogger(__name__)
RECIPE_IMAGE_BUCKET = "noomori-recipe-images"
RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
RECIPE_TEXT_MAX_CHARS = 20_000
RECIPE_URL_MAX_CHARS = 2_048
RECIPE_SELECT = "*,household_recipe_shares(recipe_id)"
HOUSEHOLD_RECIPE_SELECT = "*,household_recipe_shares!inner(recipe_id)"
COOKBOOK_SELECT = "id,title,created_at"
RECIPE_UNITS = (
    "tsp",
    "tbsp",
    "cup",
    "ml",
    "L",
    "mg",
    "g",
    "kg",
    "oz",
    "lb",
    "piece",
    "clove",
    "slice",
    "can",
    "pack",
    "bunch",
    "pinch",
)

app = FastAPI(
    title="Noomori API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    health_router,
    prefix="/api/v1",
)


@dataclass
class AuthContext:
    # Keep the verified user and their request-scoped Supabase client together so
    # route handlers cannot accidentally issue database calls as an anonymous user.
    user: object
    supabase: Client

class CreateHousehold(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CookbookTitle(BaseModel):
    title: str = Field(min_length=1, max_length=100)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Cookbook title cannot be blank")
        return title


class CreateCookbook(CookbookTitle):
    recipe_ids: list[UUID] = Field(default_factory=list)


class ReplaceCookbookRecipes(BaseModel):
    recipe_ids: list[UUID] = Field(default_factory=list)


class HouseholdJoinCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        code = re.sub(r"[ -]", "", value.strip())
        if not re.fullmatch(r"\d{6}", code):
            raise ValueError("Code must contain exactly six digits")
        return code


class HouseholdActivityRead(BaseModel):
    through_activity_id: int = Field(gt=0)


class RecipeIngredient(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)


class RecipeIngredientGroup(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    items: list[RecipeIngredient]


class RecipeInstruction(BaseModel):
    text: str = Field(max_length=2000)


class RecipeInstructionGroup(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    steps: list[RecipeInstruction]


class RecipeNutrition(BaseModel):
    calories_kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    saturated_fat_g: float | None = Field(default=None, ge=0)
    cholesterol_mg: float | None = Field(default=None, ge=0)
    fiber_g: float | None = Field(default=None, ge=0)
    sugar_g: float | None = Field(default=None, ge=0)
    sodium_mg: float | None = Field(default=None, ge=0)


class CreateRecipe(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    ingredients: list[RecipeIngredientGroup]
    instructions: list[RecipeInstructionGroup]
    servings: int = Field(gt=0)
    prep_time_minutes: int | None = Field(default=None, ge=0)
    cook_time_minutes: int | None = Field(default=None, ge=0)
    nutrition_per_serving: RecipeNutrition | None = None
    source_type: Literal["my_recipe", "family", "website"]
    source_person_name: str | None = Field(default=None, max_length=200)
    source_url: HttpUrl | None = None

    @model_validator(mode="after")
    def validate_source(self):
        if self.source_type == "family" and not self.source_person_name:
            raise ValueError("source_person_name is required for family recipes")
        if self.source_type == "website" and self.source_url is None:
            raise ValueError("source_url is required for website recipes")
        if self.source_type == "my_recipe" and (
            self.source_person_name is not None or self.source_url is not None
        ):
            raise ValueError("my_recipe cannot include source details")
        return self


class RecipeImageUpdate(BaseModel):
    image_path: str = Field(min_length=1, max_length=500)


class ImportRecipeTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=RECIPE_TEXT_MAX_CHARS)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Recipe text cannot be blank")
        return text


class ImportRecipeUrlRequest(BaseModel):
    url: HttpUrl = Field(max_length=RECIPE_URL_MAX_CHARS)


class ImportedRecipeTextDraft(BaseModel):
    title: str | None = None
    description: str | None = None
    ingredients: list[RecipeIngredientGroup] = Field(default_factory=list)
    instructions: list[RecipeInstructionGroup] = Field(default_factory=list)
    servings: int | None = Field(default=None, gt=0)
    prep_time_minutes: int | None = Field(default=None, ge=0)
    cook_time_minutes: int | None = Field(default=None, ge=0)
    nutrition_per_serving: RecipeNutrition | None = None
    # NOTE: Text imports keep the default null; website imports may provide a
    # transient source URL that the client must fetch through the image proxy.
    image_url: HttpUrl | None = None


_SECTION_NAMES = {
    "ingredient": "ingredients",
    "ingredients": "ingredients",
    "direction": "instructions",
    "directions": "instructions",
    "instruction": "instructions",
    "instructions": "instructions",
    "method": "instructions",
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
# NOTE: Text import fills only the nutrition fields already supported by the
# recipe model; trans fat, percentages, and unknown nutrients are ignored.
_NUTRITION_LABELS = (
    ("total carbohydrates", "carbs_g", "g"),
    ("total carbohydrate", "carbs_g", "g"),
    ("dietary fiber", "fiber_g", "g"),
    ("dietary fibre", "fiber_g", "g"),
    ("saturated fat", "saturated_fat_g", "g"),
    ("total sugars", "sugar_g", "g"),
    ("total fat", "fat_g", "g"),
    ("carbohydrates", "carbs_g", "g"),
    ("carbohydrate", "carbs_g", "g"),
    ("cholesterol", "cholesterol_mg", "mg"),
    ("calories", "calories_kcal", "cal"),
    ("protein", "protein_g", "g"),
    ("sodium", "sodium_mg", "mg"),
    ("fiber", "fiber_g", "g"),
    ("fibre", "fiber_g", "g"),
    ("sugars", "sugar_g", "g"),
    ("sugar", "sugar_g", "g"),
    ("carbs", "carbs_g", "g"),
    ("fat", "fat_g", "g"),
)
_NUTRITION_UNITS = {
    "cal": {"cal", "kcal", "calorie", "calories"},
    "g": {"g", "gram", "grams"},
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


def _plain_line(line: str) -> str:
    line = line.strip().lstrip("#").strip()
    return _MARKDOWN_EMPHASIS.sub(r"\g<text>", line).strip()


def _markdown_cells(line: str) -> list[str] | None:
    if not line.startswith("|") or not line.endswith("|"):
        return None
    return [cell.strip() for cell in line[1:-1].split("|")]


def _is_markdown_rule(line: str) -> bool:
    compact = re.sub(r"\s+", "", line)
    if re.fullmatch(r"(?:-{3,}|\*{3,}|_{3,})", compact):
        return True
    cells = _markdown_cells(line)
    return bool(
        cells and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)
    )


def _without_list_prefix(line: str) -> str:
    return _LIST_PREFIX.sub("", line.strip()).strip()


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


def _nutrition_value(value: str, unit_kind: str) -> float | None:
    match = _NUTRITION_VALUE.fullmatch(value.strip())
    if not match or match.group("unit").lower() not in _NUTRITION_UNITS[unit_kind]:
        return None
    return float(match.group("value").replace(",", ""))


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
            if normalized == label:
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

        section_name = _SECTION_NAMES.get(normalized_heading.lower())
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
            if instruction:
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


_SERVING_YIELD = re.compile(
    r"^(?P<count>[1-9]\d*)\s+servings?\s*$",
    re.IGNORECASE,
)
_WEBSITE_NUTRITION_AMOUNT = re.compile(r"^\s*[\d,.]+\s*[A-Za-z]+")
_WEBSITE_NUTRITION_FIELDS = {
    "calories": ("calories_kcal", "cal"),
    "proteinContent": ("protein_g", "g"),
    "carbohydrateContent": ("carbs_g", "g"),
    "fatContent": ("fat_g", "g"),
    "saturatedFatContent": ("saturated_fat_g", "g"),
    "cholesterolContent": ("cholesterol_mg", "mg"),
    "fiberContent": ("fiber_g", "g"),
    "sugarContent": ("sugar_g", "g"),
    "sodiumContent": ("sodium_mg", "mg"),
}


def _website_nutrition_value(value: str, unit_kind: str) -> float | None:
    amount = _WEBSITE_NUTRITION_AMOUNT.match(value)
    return _nutrition_value(amount.group(), unit_kind) if amount else None


def normalize_imported_website_recipe(
    extracted: ExtractedRecipe,
) -> ImportedRecipeTextDraft:
    ingredients = []
    for group in extracted.ingredient_groups:
        items = []
        for line in group.ingredients:
            ingredient = _ingredient(line)
            if ingredient["name"]:
                ingredient["name"] = ingredient["name"][:300]
                items.append(RecipeIngredient(**ingredient))
        if items:
            ingredients.append(
                RecipeIngredientGroup(
                    title=group.title[:200] if group.title else None,
                    items=items,
                )
            )

    instruction_steps = [
        RecipeInstruction(text=instruction[:2000])
        for instruction in extracted.instructions
        if instruction
    ]
    instructions = (
        [RecipeInstructionGroup(title=None, steps=instruction_steps)]
        if instruction_steps
        else []
    )

    description_parts = [extracted.description] if extracted.description else []
    servings = None
    if extracted.yield_text:
        serving_yield = _SERVING_YIELD.fullmatch(extracted.yield_text)
        if serving_yield:
            servings = int(serving_yield.group("count"))
        else:
            description_parts.append(f"Yield: {extracted.yield_text}")

    signals = sum((bool(extracted.title), bool(ingredients), bool(instructions)))
    if signals < 2:
        raise ValueError("Could not identify enough recipe information")

    nutrition_values = {}
    for source_key, (target_key, unit_kind) in _WEBSITE_NUTRITION_FIELDS.items():
        raw_value = extracted.nutrients.get(source_key)
        value = (
            _website_nutrition_value(raw_value, unit_kind)
            if raw_value is not None
            else None
        )
        if value is not None:
            nutrition_values[target_key] = value

    return ImportedRecipeTextDraft(
        title=extracted.title,
        description="\n".join(description_parts) or None,
        ingredients=ingredients,
        instructions=instructions,
        servings=servings,
        prep_time_minutes=extracted.prep_time_minutes,
        cook_time_minutes=extracted.cook_time_minutes,
        nutrition_per_serving=(
            RecipeNutrition(**nutrition_values) if nutrition_values else None
        ),
        image_url=extracted.image_url,
    )


def get_supabase(access_token: str | None = None) -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase credentials are missing")

    # The publishable key does not bypass RLS. The caller's access token is
    # attached to every service client so database and Storage share one identity.
    options = None
    if access_token:
        options = ClientOptions(
            headers={"Authorization": f"Bearer {access_token}"},
        )
    return create_client(settings.supabase_url, settings.supabase_key, options)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> AuthContext:
    access_token = credentials.credentials
    supabase = get_supabase(access_token)

    # Validate the bearer token with Supabase Auth before using its identity in
    # application logic or forwarding it to the database API.
    try:
        response = supabase.auth.get_user(access_token)
    except Exception as exc:
        logger.warning("Authentication failed", exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid Authentication") from exc

    if not response.user:
        logger.warning("Authentication returned no user")
        raise HTTPException(status_code=401, detail="Invalid Authentication")

    # Forward the same JWT to PostgREST. This supplies auth.uid() for RLS; it
    # authenticates the request but intentionally does not bypass any policy.
    supabase.postgrest.auth(access_token)

    return AuthContext(user=response.user, supabase=supabase)


HOUSEHOLD_JOIN_CODE_CONTEXT = b"noomori:household-join-code:v1:"


def household_join_code_digest(code: str) -> str:
    key = settings.household_join_code_hmac_key.get_secret_value().encode("utf-8")
    return hmac.new(
        key,
        HOUSEHOLD_JOIN_CODE_CONTEXT + code.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def household_rpc_result(response: object) -> dict:
    data = getattr(response, "data", None)
    if not isinstance(data, dict) or not isinstance(data.get("status"), str):
        raise RuntimeError("Household RPC returned an invalid response")
    return data


def database_error_code(exc: Exception) -> str | None:
    code = getattr(exc, "code", None)
    if isinstance(code, str):
        return code
    details = getattr(exc, "json", None)
    if callable(details):
        value = details()
        if isinstance(value, dict) and isinstance(value.get("code"), str):
            return value["code"]
    return None


def raise_household_rpc_error(result: dict) -> None:
    status = result["status"]
    if status == "FORBIDDEN":
        raise HTTPException(status_code=403, detail="Owner access is required")
    if status == "OWNER_CANNOT_LEAVE":
        raise HTTPException(
            status_code=409,
            detail="Household owners cannot leave their household",
        )
    if status == "NO_HOUSEHOLD":
        raise HTTPException(status_code=404, detail="Household not found")
    if status == "HOUSEHOLD_NOT_READY":
        raise HTTPException(
            status_code=409,
            detail="Add another household member before sharing recipes",
        )
    if status == "RECIPE_NOT_FOUND":
        raise HTTPException(status_code=404, detail="Recipe not found")
    if status == "INVALID_ACTIVITY":
        raise HTTPException(status_code=400, detail="Activity marker is invalid")
    if status == "ALREADY_MEMBER":
        raise HTTPException(
            status_code=409,
            detail="You already belong to a household",
        )
    if status == "INVALID_OR_EXPIRED":
        raise HTTPException(
            status_code=400,
            detail="This invite code is invalid or has expired",
        )
    if status == "RATE_LIMITED":
        retry_after = max(1, int(result.get("retry_after_seconds", 600)))
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later",
            headers={"Retry-After": str(retry_after)},
        )
    raise RuntimeError(f"Unexpected household RPC status: {status}")


def execute_household_rpc(
    auth: AuthContext,
    name: str,
    params: dict | None = None,
) -> dict:
    try:
        response = auth.supabase.rpc(name, params or {}).execute()
        return household_rpc_result(response)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Household RPC failed operation=%s user_id=%s",
            name,
            auth.user.id,
        )
        if database_error_code(exc) == "23505":
            raise HTTPException(
                status_code=409,
                detail="Household membership conflict",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Could not complete the household request",
        ) from exc


def get_owned_recipe(auth: AuthContext, recipe_id: UUID) -> dict:
    response = (
        auth.supabase
        .table("recipes")
        .select("id,owner_user_id,image_path")
        .eq("id", str(recipe_id))
        .eq("owner_user_id", auth.user.id)
        .limit(1)
        .execute()
    )
    if not response.data:
        logger.info("Owned recipe not found recipe_id=%s", recipe_id)
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]


def get_readable_recipe(auth: AuthContext, recipe_id: UUID) -> dict:
    response = (
        auth.supabase
        .table("recipes")
        .select(RECIPE_SELECT)
        .eq("id", str(recipe_id))
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]


def recipe_with_share_state(recipe: dict) -> dict:
    result = dict(recipe)
    result["is_shared"] = bool(result.pop("household_recipe_shares", []))
    return result


def valid_recipe_image_path(path: str, user_id: str, recipe_id: UUID) -> bool:
    parts = path.split("/")
    if len(parts) != 4 or parts[:3] != ["recipes", user_id, str(recipe_id)]:
        return False
    filename = parts[3]
    if not filename.endswith(".webp"):
        return False
    try:
        UUID(filename.removesuffix(".webp"))
    except ValueError:
        return False
    return True


def recipe_with_signed_image(auth: AuthContext, recipe: dict) -> dict:
    result = recipe_with_share_state(recipe)
    image_path = result.get("image_path")
    result["image_url"] = None
    if image_path:
        try:
            signed = (
                auth.supabase.storage
                .from_(RECIPE_IMAGE_BUCKET)
                .create_signed_url(image_path, 3600)
            )
            result["image_url"] = signed.get("signedURL") or signed.get("signedUrl")
        except Exception:
            logger.exception("Failed to sign recipe image recipe_id=%s", result.get("id"))
    return result


def signed_recipe_image_urls(
    auth: AuthContext,
    image_paths: list[str],
) -> dict[str, str]:
    unique_paths = list(dict.fromkeys(path for path in image_paths if path))
    if not unique_paths:
        return {}

    try:
        signed_images = (
            auth.supabase.storage
            .from_(RECIPE_IMAGE_BUCKET)
            .create_signed_urls(unique_paths, 3600)
        )
    except Exception:
        logger.exception(
            "Failed to batch-sign recipe images count=%s",
            len(unique_paths),
        )
        return {}

    urls_by_path = {}
    for signed in signed_images:
        path = signed.get("path")
        url = signed.get("signedURL") or signed.get("signedUrl")
        if path and url and not signed.get("error"):
            urls_by_path[path] = url
        elif path:
            logger.warning("Failed to sign recipe image path=%s", path)
    return urls_by_path


# PERFORMANCE: Sign every unique path in one Storage round trip. Individual
# failures remain null so one broken image cannot delay or fail the library.
def recipes_with_signed_images(
    auth: AuthContext,
    recipes: list[dict],
) -> list[dict]:
    results = []
    paths = []
    for recipe in recipes:
        result = recipe_with_share_state(recipe)
        result["image_url"] = None
        results.append(result)
        if result.get("image_path"):
            paths.append(result["image_path"])

    urls_by_path = signed_recipe_image_urls(auth, paths)

    for result in results:
        result["image_url"] = urls_by_path.get(result.get("image_path"))
    return results


def execute_cookbook_rpc(
    auth: AuthContext,
    name: str,
    params: dict,
) -> dict:
    try:
        response = auth.supabase.rpc(name, params).execute()
        result = household_rpc_result(response)
    except Exception as exc:
        logger.exception(
            "Cookbook RPC failed operation=%s user_id=%s",
            name,
            auth.user.id,
        )
        raise HTTPException(
            status_code=500,
            detail="Could not save the cookbook",
        ) from exc

    if result["status"] == "INVALID_RECIPE":
        raise HTTPException(status_code=400, detail="A selected recipe is unavailable")
    if result["status"] == "COOKBOOK_NOT_FOUND":
        raise HTTPException(status_code=404, detail="Cookbook not found")
    if result["status"] != "OK":
        raise RuntimeError(f"Unexpected cookbook RPC status: {result['status']}")
    return result


def get_owned_cookbook(auth: AuthContext, cookbook_id: UUID) -> dict:
    response = (
        auth.supabase
        .table("cookbooks")
        .select(COOKBOOK_SELECT)
        .eq("id", str(cookbook_id))
        .eq("owner_user_id", auth.user.id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Cookbook not found")
    return response.data[0]


def cookbook_member_recipe_ids(auth: AuthContext, cookbook_id: UUID) -> list[str]:
    response = (
        auth.supabase
        .table("cookbook_recipes")
        .select("recipe_id")
        .eq("cookbook_id", str(cookbook_id))
        .execute()
    )
    return [row["recipe_id"] for row in response.data]


def cookbook_summary_rows(auth: AuthContext, cookbooks: list[dict]) -> list[dict]:
    if not cookbooks:
        return []

    cookbook_ids = [cookbook["id"] for cookbook in cookbooks]
    membership_response = (
        auth.supabase
        .table("cookbook_recipes")
        .select("cookbook_id,recipe_id")
        .in_("cookbook_id", cookbook_ids)
        .execute()
    )
    member_ids: dict[str, list[str]] = {cookbook_id: [] for cookbook_id in cookbook_ids}
    for membership in membership_response.data:
        member_ids.setdefault(membership["cookbook_id"], []).append(
            membership["recipe_id"]
        )

    recipe_ids = list(dict.fromkeys(
        recipe_id
        for cookbook_recipe_ids in member_ids.values()
        for recipe_id in cookbook_recipe_ids
    ))
    recipe_rows = []
    if recipe_ids:
        recipe_rows = (
            auth.supabase
            .table("recipes")
            .select("id,image_path,created_at")
            .eq("owner_user_id", auth.user.id)
            .in_("id", recipe_ids)
            .order("created_at", desc=True)
            .execute()
            .data
        )

    cover_paths: dict[str, list[str]] = {}
    all_cover_paths: list[str] = []
    for cookbook_id, ids in member_ids.items():
        ids_set = set(ids)
        paths = [
            recipe["image_path"]
            for recipe in recipe_rows
            if recipe["id"] in ids_set and recipe.get("image_path")
        ][:4]
        cover_paths[cookbook_id] = paths
        all_cover_paths.extend(paths)
    image_urls = signed_recipe_image_urls(auth, all_cover_paths)

    return [
        {
            "id": cookbook["id"],
            "title": cookbook["title"],
            "recipe_count": len(member_ids.get(cookbook["id"], [])),
            "cover_image_urls": [
                image_urls[path]
                for path in cover_paths.get(cookbook["id"], [])
                if path in image_urls
            ],
        }
        for cookbook in cookbooks
    ]


def cookbook_detail(auth: AuthContext, cookbook_id: UUID) -> dict:
    cookbook = get_owned_cookbook(auth, cookbook_id)
    recipe_ids = cookbook_member_recipe_ids(auth, cookbook_id)
    recipes = []
    if recipe_ids:
        response = (
            auth.supabase
            .table("recipes")
            .select(RECIPE_SELECT)
            .eq("owner_user_id", auth.user.id)
            .in_("id", recipe_ids)
            .order("created_at", desc=True)
            .execute()
        )
        recipes = recipes_with_signed_images(auth, response.data)
    return {
        "id": cookbook["id"],
        "title": cookbook["title"],
        "recipe_count": len(recipes),
        "recipes": recipes,
    }


@app.post("/recipes/import/text", response_model=ImportedRecipeTextDraft)
def import_recipe_text(
    payload: ImportRecipeTextRequest,
    _auth: AuthContext = Depends(get_current_user),
):
    try:
        return parse_recipe_text(payload.text)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Could not identify enough recipe information",
        ) from exc


_WEBSITE_IMPORT_STATUS_CODES = {
    "unsafe_url": 400,
    "page_too_large": 413,
    "unsupported_content_type": 415,
    "recipe_not_found": 422,
    "page_unavailable": 502,
    "fetch_timeout": 504,
}


@app.post("/recipes/import/url", response_model=ImportedRecipeTextDraft)
def import_recipe_url(
    payload: ImportRecipeUrlRequest,
    _auth: AuthContext = Depends(get_current_user),
):
    started_at = perf_counter()
    hostname = payload.url.host or "unknown"
    result = "page_unavailable"
    response_size = 0
    ingredient_count = 0
    instruction_count = 0

    try:
        page = fetch_public_html(str(payload.url))
        hostname = page.hostname
        response_size = page.response_size
        extracted = extract_recipe(page.html, page.url)
        ingredient_count = sum(
            len(group.ingredients) for group in extracted.ingredient_groups
        )
        instruction_count = len(extracted.instructions)
        draft = normalize_imported_website_recipe(extracted)
        result = "success"
        return draft
    except WebsiteImportError as exc:
        result = exc.detail
        raise HTTPException(
            status_code=_WEBSITE_IMPORT_STATUS_CODES[exc.detail],
            detail=exc.detail,
        ) from exc
    except ValueError as exc:
        result = "recipe_not_found"
        raise HTTPException(status_code=422, detail=result) from exc
    except Exception as exc:
        result = "recipe_not_found"
        raise HTTPException(status_code=422, detail=result) from exc
    finally:
        logger.log(
            logging.INFO if result == "success" else logging.WARNING,
            "Website recipe import url=%s hostname=%s result=%s duration_ms=%.1f "
            "response_size=%s ingredient_count=%s instruction_count=%s",
            payload.url,
            hostname,
            result,
            (perf_counter() - started_at) * 1000,
            response_size,
            ingredient_count,
            instruction_count,
            exc_info=result != "success",
        )


@app.post("/recipes/import/image")
def import_recipe_image(
    payload: ImportRecipeUrlRequest,
    _auth: AuthContext = Depends(get_current_user),
):
    started_at = perf_counter()
    hostname = payload.url.host or "unknown"
    result = "page_unavailable"
    response_size = 0

    try:
        # NOTE: This endpoint is a byte proxy only. Recipe creation and Storage
        # persistence remain in the existing authenticated client save flow.
        image = fetch_public_image(str(payload.url))
        hostname = image.hostname
        response_size = image.response_size
        result = "success"
        return Response(
            content=image.body,
            media_type=image.content_type,
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except WebsiteImportError as exc:
        result = exc.detail
        raise HTTPException(
            status_code=_WEBSITE_IMPORT_STATUS_CODES[exc.detail],
            detail=exc.detail,
        ) from exc
    finally:
        logger.info(
            "Website recipe image import hostname=%s result=%s duration_ms=%.1f "
            "response_size=%s",
            hostname,
            result,
            (perf_counter() - started_at) * 1000,
            response_size,
        )


# PERFORMANCE: supabase-py is synchronous. Regular def handlers run in FastAPI's
# thread pool instead of serializing unrelated requests on the event loop.
@app.get("/recipes")
def list_recipes(auth: AuthContext = Depends(get_current_user)):
    started_at = perf_counter()
    response = (
        auth.supabase
        .table("recipes")
        .select(RECIPE_SELECT)
        .eq("owner_user_id", auth.user.id)
        .order("created_at", desc=True)
        .execute()
    )
    recipes = recipes_with_signed_images(auth, response.data)
    # PERFORMANCE: Counts and wall time expose when list growth or signing starts
    # dominating library load latency.
    logger.info(
        "Recipes listed user_id=%s recipe_count=%s image_count=%s duration_ms=%.1f",
        auth.user.id,
        len(recipes),
        sum(1 for recipe in recipes if recipe.get("image_path")),
        (perf_counter() - started_at) * 1000,
    )
    return recipes


# NOTE: The personal endpoint above is owner-filtered; this inner share relation
# includes both the user's and other household members' shared recipes here.
@app.get("/household/recipes")
def list_household_recipes(auth: AuthContext = Depends(get_current_user)):
    started_at = perf_counter()
    response = (
        auth.supabase
        .table("recipes")
        .select(HOUSEHOLD_RECIPE_SELECT)
        .order("created_at", desc=True)
        .execute()
    )
    recipes = recipes_with_signed_images(auth, response.data)
    logger.info(
        "Household recipes listed user_id=%s recipe_count=%s image_count=%s "
        "duration_ms=%.1f",
        auth.user.id,
        len(recipes),
        sum(1 for recipe in recipes if recipe.get("image_path")),
        (perf_counter() - started_at) * 1000,
    )
    return recipes


@app.get("/cookbooks")
def list_cookbooks(auth: AuthContext = Depends(get_current_user)):
    response = (
        auth.supabase
        .table("cookbooks")
        .select(COOKBOOK_SELECT)
        .eq("owner_user_id", auth.user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return cookbook_summary_rows(auth, response.data)


@app.post("/cookbooks")
def create_cookbook(
    payload: CreateCookbook,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_cookbook_rpc(
        auth,
        "create_personal_cookbook",
        {
            "p_title": payload.title,
            "p_recipe_ids": list(dict.fromkeys(map(str, payload.recipe_ids))),
        },
    )
    return cookbook_detail(auth, UUID(result["cookbook_id"]))


@app.get("/cookbooks/{cookbook_id}")
def get_cookbook(
    cookbook_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return cookbook_detail(auth, cookbook_id)


@app.put("/cookbooks/{cookbook_id}")
def rename_cookbook(
    cookbook_id: UUID,
    payload: CookbookTitle,
    auth: AuthContext = Depends(get_current_user),
):
    try:
        response = (
            auth.supabase
            .table("cookbooks")
            .update({"title": payload.title})
            .eq("id", str(cookbook_id))
            .eq("owner_user_id", auth.user.id)
            .select(COOKBOOK_SELECT)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not rename cookbook cookbook_id=%s", cookbook_id)
        raise HTTPException(status_code=500, detail="Could not rename cookbook") from exc
    if not response.data:
        raise HTTPException(status_code=404, detail="Cookbook not found")
    return cookbook_detail(auth, cookbook_id)


@app.put("/cookbooks/{cookbook_id}/recipes")
def replace_cookbook_recipes(
    cookbook_id: UUID,
    payload: ReplaceCookbookRecipes,
    auth: AuthContext = Depends(get_current_user),
):
    execute_cookbook_rpc(
        auth,
        "replace_personal_cookbook_recipes",
        {
            "p_cookbook_id": str(cookbook_id),
            "p_recipe_ids": list(dict.fromkeys(map(str, payload.recipe_ids))),
        },
    )
    return cookbook_detail(auth, cookbook_id)


@app.delete("/cookbooks/{cookbook_id}", status_code=204)
def delete_cookbook(
    cookbook_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    try:
        response = (
            auth.supabase
            .table("cookbooks")
            .delete()
            .eq("id", str(cookbook_id))
            .eq("owner_user_id", auth.user.id)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not delete cookbook cookbook_id=%s", cookbook_id)
        raise HTTPException(status_code=500, detail="Could not delete cookbook") from exc
    if not response.data:
        raise HTTPException(status_code=404, detail="Cookbook not found")
    return Response(status_code=204)


@app.get("/recipes/{recipe_id}")
def get_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return recipe_with_signed_image(auth, get_readable_recipe(auth, recipe_id))


@app.post("/recipes")
@app.post("/add-recipes")
def create_recipe(
    payload: CreateRecipe,
    recipe_creation_id: UUID = Header(alias="Recipe-Creation-Id"),
    auth: AuthContext = Depends(get_current_user),
):
    # PERFORMANCE: Track database plus response-signing time for save diagnostics.
    started_at = perf_counter()
    values = payload.model_dump(mode="json")
    values["id"] = str(recipe_creation_id)
    values["owner_user_id"] = auth.user.id
    logger.info(
        "Saving recipe recipe_id=%s user_id=%s",
        recipe_creation_id,
        auth.user.id,
    )
    try:
        response = (
            auth.supabase
            .table("recipes")
            .upsert(values, on_conflict="id")
            .select(RECIPE_SELECT)
            .execute()
        )
        recipe = response.data[0]
        logger.info(
            "Recipe saved recipe_id=%s user_id=%s duration_ms=%.1f",
            recipe["id"],
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        return recipe_with_signed_image(auth, recipe)
    except Exception as exc:
        logger.exception(
            "Failed to save recipe user_id=%s duration_ms=%.1f",
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not create recipe") from exc


@app.put("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: UUID,
    payload: CreateRecipe,
    auth: AuthContext = Depends(get_current_user),
):
    started_at = perf_counter()
    logger.info("Updating recipe recipe_id=%s", recipe_id)
    try:
        response = (
            auth.supabase
            .table("recipes")
            .update(payload.model_dump(mode="json"))
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .select(RECIPE_SELECT)
            .execute()
        )
    except Exception as exc:
        logger.exception(
            "Failed to update recipe recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not update recipe") from exc

    if not response.data:
        logger.info("Recipe not found during update recipe_id=%s", recipe_id)
        raise HTTPException(status_code=404, detail="Recipe not found")

    logger.info(
        "Recipe updated recipe_id=%s duration_ms=%.1f",
        recipe_id,
        (perf_counter() - started_at) * 1000,
    )
    return recipe_with_signed_image(auth, response.data[0])


def set_recipe_shared(
    recipe_id: UUID,
    shared: bool,
    auth: AuthContext,
):
    result = execute_household_rpc(
        auth,
        "set_recipe_household_shared",
        {"p_recipe_id": str(recipe_id), "p_shared": shared},
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return recipe_with_signed_image(auth, get_readable_recipe(auth, recipe_id))


@app.put("/recipes/{recipe_id}/share")
def share_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return set_recipe_shared(recipe_id, True, auth)


@app.delete("/recipes/{recipe_id}/share")
def unshare_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return set_recipe_shared(recipe_id, False, auth)


# NOTE: Ownership is recipe-scoped; household roles grant no delete authority.
# Delete the row first, then clean up its Storage object best-effort.
@app.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    started_at = perf_counter()
    logger.info(
        "Recipe delete started recipe_id=%s user_id=%s",
        recipe_id,
        auth.user.id,
    )
    recipe = get_owned_recipe(auth, recipe_id)
    row_delete_started_at = perf_counter()
    try:
        response = (
            auth.supabase
            .table("recipes")
            .delete()
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .execute()
        )
    except Exception as exc:
        logger.exception(
            "Failed to delete recipe row recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - row_delete_started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not delete recipe") from exc
    if not response.data:
        logger.info("Shared recipe delete blocked recipe_id=%s", recipe_id)
        raise HTTPException(
            status_code=409,
            detail="Unshare recipe before deleting",
        )
    logger.info(
        "Recipe row deleted recipe_id=%s duration_ms=%.1f",
        recipe_id,
        (perf_counter() - row_delete_started_at) * 1000,
    )

    image_path = recipe.get("image_path")
    image_cleanup = "not_needed"
    if image_path:
        try:
            auth.supabase.storage.from_(RECIPE_IMAGE_BUCKET).remove([image_path])
            image_cleanup = "deleted"
        except Exception:
            image_cleanup = "failed"
            logger.exception(
                "Failed to delete recipe image object recipe_id=%s",
                recipe_id,
            )
    logger.info(
        "Recipe delete completed recipe_id=%s image_cleanup=%s duration_ms=%.1f",
        recipe_id,
        image_cleanup,
        (perf_counter() - started_at) * 1000,
    )
    return Response(status_code=204)


@app.put("/recipes/{recipe_id}/image")
def activate_recipe_image(
    recipe_id: UUID,
    payload: RecipeImageUpdate,
    auth: AuthContext = Depends(get_current_user),
):
    logger.info("Activating recipe image recipe_id=%s", recipe_id)
    recipe = get_owned_recipe(auth, recipe_id)
    if not valid_recipe_image_path(payload.image_path, auth.user.id, recipe_id):
        logger.warning("Rejected recipe image path recipe_id=%s", recipe_id)
        raise HTTPException(status_code=400, detail="Invalid recipe image path")

    try:
        info = (
            auth.supabase.storage
            .from_(RECIPE_IMAGE_BUCKET)
            .info(payload.image_path)
        )
    except Exception as exc:
        logger.warning(
            "Recipe image object not found recipe_id=%s",
            recipe_id,
            exc_info=True,
        )
        raise HTTPException(status_code=400, detail="Recipe image was not found") from exc

    metadata = info.get("metadata") or {}
    mime_type = (
        metadata.get("mimetype")
        or info.get("content_type")
        or info.get("contentType")
    )
    size = metadata.get("size") or info.get("size")
    if mime_type != "image/webp" or (
        isinstance(size, int) and size > RECIPE_IMAGE_MAX_BYTES
    ):
        logger.warning(
            "Rejected recipe image metadata recipe_id=%s mime_type=%s size=%s",
            recipe_id,
            mime_type,
            size,
        )
        raise HTTPException(status_code=400, detail="Recipe image is not an accepted WebP")

    try:
        response = (
            auth.supabase
            .table("recipes")
            .update({"image_path": payload.image_path})
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .select(RECIPE_SELECT)
            .execute()
        )
        updated = response.data[0]
        logger.info("Recipe image activated recipe_id=%s", recipe_id)
    except Exception as exc:
        logger.exception("Failed to activate recipe image recipe_id=%s", recipe_id)
        raise HTTPException(status_code=500, detail="Could not activate recipe image") from exc

    old_path = recipe.get("image_path")
    if old_path and old_path != payload.image_path:
        try:
            auth.supabase.storage.from_(RECIPE_IMAGE_BUCKET).remove([old_path])
        except Exception:
            logger.exception("Failed to remove replaced recipe image recipe_id=%s", recipe_id)
    return recipe_with_signed_image(auth, updated)


@app.delete("/recipes/{recipe_id}/image")
def remove_recipe_image(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    logger.info("Removing recipe image recipe_id=%s", recipe_id)
    recipe = get_owned_recipe(auth, recipe_id)
    try:
        response = (
            auth.supabase
            .table("recipes")
            .update({"image_path": None})
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .select(RECIPE_SELECT)
            .execute()
        )
        updated = response.data[0]
        logger.info("Recipe image removed recipe_id=%s", recipe_id)
    except Exception as exc:
        logger.exception("Failed to remove recipe image recipe_id=%s", recipe_id)
        raise HTTPException(status_code=500, detail="Could not remove recipe image") from exc

    old_path = recipe.get("image_path")
    if old_path:
        try:
            auth.supabase.storage.from_(RECIPE_IMAGE_BUCKET).remove([old_path])
        except Exception:
            logger.exception("Failed to delete recipe image object recipe_id=%s", recipe_id)
    return recipe_with_signed_image(auth, updated)


@app.get("/household")
def get_household_settings(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_household_settings")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


@app.get("/household/activity")
def get_household_activity(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_household_activity")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


@app.put("/household/activity/read", status_code=204)
def mark_household_activity_read(
    payload: HouseholdActivityRead,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "mark_household_activity_read",
        {"p_through_activity_id": payload.through_activity_id},
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return Response(status_code=204)


@app.delete("/household", status_code=204)
def leave_household(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "leave_household")
    if result["status"] != "LEFT":
        raise_household_rpc_error(result)
    return Response(status_code=204)


@app.post("/household/invite")
def replace_household_join_code(auth: AuthContext = Depends(get_current_user)):
    for _attempt in range(5):
        code = f"{secrets.randbelow(1_000_000):06d}"
        digest = household_join_code_digest(code)
        try:
            response = (
                auth.supabase
                .rpc(
                    "replace_household_join_code",
                    {"p_code_digest": digest},
                )
                .execute()
            )
            result = household_rpc_result(response)
        except Exception as exc:
            if database_error_code(exc) == "23505":
                continue
            logger.exception(
                "Could not replace household join code user_id=%s",
                auth.user.id,
            )
            raise HTTPException(
                status_code=500,
                detail="Could not generate a join code",
            ) from exc

        if result["status"] != "OK":
            raise_household_rpc_error(result)
        return {"code": code, "expires_at": result["expires_at"]}

    raise HTTPException(
        status_code=503,
        detail="Could not generate a unique join code",
    )


@app.delete("/household/invite", status_code=204)
def revoke_household_join_code(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "revoke_household_join_code")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return Response(status_code=204)


@app.post("/household/join/preview")
def preview_household_join_code(
    payload: HouseholdJoinCodeRequest,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "preview_household_join_code",
        {"p_code_digest": household_join_code_digest(payload.code)},
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


@app.post("/household/join")
def join_household_with_code(
    payload: HouseholdJoinCodeRequest,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "join_household_with_code",
        {"p_code_digest": household_join_code_digest(payload.code)},
    )
    if result["status"] not in {"JOINED", "ALREADY_MEMBER"}:
        raise_household_rpc_error(result)
    return result


# Create the household, establish its first owner, and complete onboarding.
# NOTE: These are separate PostgREST requests, so a later failure does not roll
# back an earlier write. Move this workflow into a database RPC if it must be atomic.
# PERFORMANCE: This handler also uses synchronous supabase-py calls, so keep it
# in FastAPI's worker thread pool rather than blocking the event loop.
@app.post("/household")
def create_household(payload: CreateHousehold, auth: AuthContext = Depends(get_current_user)):
    supabase = auth.supabase
    user_id = auth.user.id
    try:
        logger.info(
            "Creating household for user_id=%s",
            user_id,
        )
        # supabase-py returns the inserted row by default. The row must therefore
        # satisfy both the households INSERT policy and its SELECT policy.
        household_response = (
            supabase
            .table("households")
            .insert({
                "name": payload.name,
                "created_by": user_id,
            })
            .execute()
        )

        household = household_response.data[0]
        household_id = household["id"]

        logger.info(
            "Household created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        # The bootstrap policy must allow the creator to add their own initial
        # owner membership. Returning it also requires a matching SELECT policy.
        member_response = (
            supabase
            .table("household_members")
            .insert({
                "household_id": household_id,
                "user_id": user_id,
                "role": "owner",
            })
            .execute()
        )

        logger.info(
            "Owner membership created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        date_now = datetime.now(timezone.utc).isoformat()

        # Scope the update to the authenticated user's profile; the profiles
        # SELECT and UPDATE policies must permit the same user-owned row.
        onboarding_response = (
            supabase
            .table("profiles")
            .update({
                "onboarding_completed_at": date_now,
                "updated_at": date_now,
            })
            .eq("id", user_id)
            .execute()
        )

        logger.info(
            "Onboarding completed user_id=%s household_id=%s",
            user_id,
            household_id,
        )

        return {
            "household": household,
            "membership": member_response.data[0],
            "profile": onboarding_response.data[0],
        }

    except Exception as exc:
        logger.exception(
            "Failed to create household user_id=%s",
            user_id,
        )
        raise HTTPException(status_code=500, detail=str(exc),) from exc

def main() -> None:
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
