from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


RECIPE_TEXT_MAX_CHARS = 20_000
RECIPE_URL_MAX_CHARS = 2_048


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
    servings: int | None = Field(default=None, gt=0)
    prep_time_minutes: int | None = Field(default=None, ge=0)
    cook_time_minutes: int | None = Field(default=None, ge=0)
    nutrition_per_serving: RecipeNutrition | None = None
    source_type: Literal["my_recipe", "family", "website"]
    source_person_name: str | None = Field(default=None, max_length=200)
    # HttpUrl enforces its own 2,083-character maximum, distinct from the
    # 2,048-character website-import request limit above.
    source_url: HttpUrl | None = None

    # Purpose: Enforce the source-specific metadata required by a recipe payload.
    # Connects to: Called by Pydantic when server/src/server/modules/recipes/service.py::{create_recipe(),update_recipe()} validates CreateRecipe; has no downstream local function calls.
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

    # Purpose: Trim imported recipe text and reject whitespace-only submissions.
    # Connects to: Called by Pydantic before server/src/server/modules/recipes/service.py::import_recipe_text(); its output is passed to server/src/server/modules/recipes/imports/text.py::parse_recipe_text().
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
