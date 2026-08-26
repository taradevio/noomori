import uvicorn
import logging
import re
import unicodedata

from fastapi import FastAPI, HTTPException, Depends, Response
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from server.api.health import router as health_router
from server.config import settings
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


class ImportedRecipeTextDraft(BaseModel):
    title: str | None = None
    description: str | None = None
    ingredients: list[RecipeIngredientGroup] = Field(default_factory=list)
    instructions: list[RecipeInstructionGroup] = Field(default_factory=list)
    servings: int | None = Field(default=None, gt=0)
    prep_time_minutes: int | None = Field(default=None, ge=0)
    cook_time_minutes: int | None = Field(default=None, ge=0)
    nutrition_per_serving: RecipeNutrition | None = None


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
    "cal": {"cal", "kcal"},
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
    return line.strip().lstrip("#").strip().strip("*_").strip()


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
    lines = [line for line in lines if line]
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
        .select("*")
        .eq("id", str(recipe_id))
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]


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
    result = dict(recipe)
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


# PERFORMANCE: Sign every unique path in one Storage round trip. Individual
# failures remain null so one broken image cannot delay or fail the library.
def recipes_with_signed_images(
    auth: AuthContext,
    recipes: list[dict],
) -> list[dict]:
    results = []
    paths = []
    for recipe in recipes:
        result = dict(recipe)
        result["image_url"] = None
        results.append(result)
        if result.get("image_path"):
            paths.append(result["image_path"])

    unique_paths = list(dict.fromkeys(paths))
    if not unique_paths:
        return results

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
        return results

    urls_by_path = {}
    for signed in signed_images:
        path = signed.get("path")
        url = signed.get("signedURL") or signed.get("signedUrl")
        if path and url and not signed.get("error"):
            urls_by_path[path] = url
        elif path:
            logger.warning("Failed to sign recipe image path=%s", path)

    for result in results:
        result["image_url"] = urls_by_path.get(result.get("image_path"))
    return results


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


# PERFORMANCE: supabase-py is synchronous. Regular def handlers run in FastAPI's
# thread pool instead of serializing unrelated requests on the event loop.
@app.get("/recipes")
def list_recipes(auth: AuthContext = Depends(get_current_user)):
    started_at = perf_counter()
    response = (
        auth.supabase
        .table("recipes")
        .select("*")
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
    auth: AuthContext = Depends(get_current_user),
):
    # PERFORMANCE: Track database plus response-signing time for save diagnostics.
    started_at = perf_counter()
    values = payload.model_dump(mode="json")
    values["owner_user_id"] = auth.user.id
    values["image_path"] = None
    logger.info("Creating recipe user_id=%s", auth.user.id)
    try:
        response = auth.supabase.table("recipes").insert(values).execute()
        recipe = response.data[0]
        logger.info(
            "Recipe created recipe_id=%s user_id=%s duration_ms=%.1f",
            recipe["id"],
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        return recipe_with_signed_image(auth, recipe)
    except Exception as exc:
        logger.exception(
            "Failed to create recipe user_id=%s duration_ms=%.1f",
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
        if not response.data:
            raise RuntimeError("Recipe row was not deleted")
        logger.info(
            "Recipe row deleted recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - row_delete_started_at) * 1000,
        )
    except Exception as exc:
        logger.exception(
            "Failed to delete recipe row recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - row_delete_started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not delete recipe") from exc

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
