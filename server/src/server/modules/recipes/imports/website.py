import logging
import re
import unicodedata
from time import perf_counter

from fastapi import Depends, HTTPException, Response

from server.core.auth import AuthContext, get_current_user
from server.modules.recipes.imports.text import (
    RecipeTextImportError,
    _append_recovery_notes,
    _dom_nutrition,
    _ingredient,
    _is_instruction_marker,
    _nutrition_value,
    _resolve_passive_times,
    _UNITS_BY_LOWER,
    parse_recipe_text,
)
from server.modules.recipes.schemas import (
    ImportedRecipeTextDraft,
    ImportRecipeUrlRequest,
    RECIPE_TEXT_MAX_CHARS,
    RecipeIngredient,
    RecipeIngredientGroup,
    RecipeInstruction,
    RecipeInstructionGroup,
    RecipeNutrition,
)
from server.recipe_url_import import (
    ExtractedIngredientGroup,
    ExtractedRecipe,
    WebsiteImportError,
    extract_recipe,
    extract_recipe_container_text,
    extract_recipe_dom_metadata,
    extract_recipe_group_structure,
    fetch_public_html,
    fetch_public_image,
)


logger = logging.getLogger(__name__)
_SERVING_YIELD = re.compile(
    r"^(?P<count>[1-9]\d*)\s+(?:servings?|porsi)\s*$",
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
_WEBSITE_IMPORT_STATUS_CODES = {
    "unsafe_url": 400,
    "page_too_large": 413,
    "unsupported_content_type": 415,
    "recipe_not_found": 422,
    "page_unavailable": 502,
    "fetch_timeout": 504,
}


# Purpose: Parse the leading amount from a website nutrition property.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::normalize_imported_website_recipe(); calls server/src/server/modules/recipes/imports/text.py::_nutrition_value().
def _website_nutrition_value(value: str, unit_kind: str) -> float | None:
    amount = _WEBSITE_NUTRITION_AMOUNT.match(value)
    return _nutrition_value(amount.group(), unit_kind) if amount else None


# Purpose: Keep explicit Notes only and interpret a strict serving Yield.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::{normalize_imported_website_recipe(),import_recipe_url()}; has no downstream local function calls.
def _website_description_and_servings(
    extracted: ExtractedRecipe,
    notes: str | None,
) -> tuple[str | None, int | None]:
    recovery_notes = []
    servings = None
    if extracted.yield_text:
        serving_yield = _SERVING_YIELD.fullmatch(extracted.yield_text)
        if serving_yield:
            servings = int(serving_yield.group("count"))
        else:
            recovery_notes.append(f"Yield: {extracted.yield_text}")
    return _append_recovery_notes(notes, recovery_notes), servings


# Purpose: Convert extractor output into the app's validated editable recipe schema.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/modules/recipes/imports/text.py::{_ingredient(),_is_instruction_marker()} and server/src/server/modules/recipes/imports/website.py::_website_nutrition_value().
def normalize_imported_website_recipe(
    extracted: ExtractedRecipe,
    *,
    notes: str | None = None,
    additional_time_label: str | None = None,
    additional_time_minutes: int | None = None,
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
        if instruction and not _is_instruction_marker(instruction)
    ]
    instructions = (
        [RecipeInstructionGroup(title=None, steps=instruction_steps)]
        if instruction_steps
        else []
    )

    description, servings = _website_description_and_servings(extracted, notes)

    signals = sum((bool(extracted.title), bool(ingredients), bool(instructions)))
    if signals < 2:
        raise ValueError("Could not identify enough recipe information")

    nutrition_values = {}
    serving_size = extracted.nutrients.get("servingSize")
    if (
        isinstance(serving_size, str) and serving_size.strip()
    ) or servings is not None:
        for source_key, (target_key, unit_kind) in (
            _WEBSITE_NUTRITION_FIELDS.items()
        ):
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
        description=description,
        ingredients=ingredients,
        instructions=instructions,
        servings=servings,
        prep_time_minutes=extracted.prep_time_minutes,
        cook_time_minutes=extracted.cook_time_minutes,
        total_time_minutes=extracted.total_time_minutes,
        additional_time_label=additional_time_label,
        additional_time_minutes=additional_time_minutes,
        nutrition_per_serving=(
            RecipeNutrition(**nutrition_values) if nutrition_values else None
        ),
        image_url=extracted.image_url,
    )


# Purpose: Count ingredient items and instruction steps in an imported draft.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); has no downstream local function calls.
def _draft_core_counts(draft: ImportedRecipeTextDraft) -> tuple[int, int]:
    return (
        sum(len(group.items) for group in draft.ingredients),
        sum(len(group.steps) for group in draft.instructions),
    )


# Purpose: Classify which core recipe sections were absent from primary extraction.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); has no downstream local function calls.
def _missing_primary_reason(ingredient_count: int, instruction_count: int) -> str:
    if not ingredient_count and not instruction_count:
        return "primary_missing_both"
    if not ingredient_count:
        return "primary_missing_ingredients"
    return "primary_missing_instructions"


# Purpose: Fill missing nutrition from an explicitly per-serving DOM candidate.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/modules/recipes/imports/text.py::_dom_nutrition().
def _enrich_dom_nutrition(
    draft: ImportedRecipeTextDraft,
    candidate_text: str,
) -> tuple[ImportedRecipeTextDraft, int]:
    if draft.nutrition_per_serving is not None:
        return draft, 0
    nutrition = _dom_nutrition(candidate_text)
    if nutrition is None:
        return draft, 0
    field_count = sum(
        value is not None for value in nutrition.model_dump().values()
    )
    return draft.model_copy(update={"nutrition_per_serving": nutrition}), field_count


# Purpose: Canonicalize rendered text for strict DOM-versus-primary comparisons.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::_enrich_primary_groups(); has no downstream local function calls.
def _dom_structure_match(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", "", normalized)


# Purpose: Remove a verified rendered group label from the first instruction step.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::_enrich_primary_groups(); has no downstream local function calls.
def _strip_verified_group_label(value: str, label_prefix: str) -> str | None:
    # NOTE: Keep the DOM's exact rendered prefix (including optional colon) and
    # tolerate whitespace only. This lets semantic headings without colons pass
    # verification without weakening the content comparison.
    chunks = re.findall(r"\S+", label_prefix)
    if not chunks:
        return None
    label = re.compile(
        r"^\s*" + r"\s*".join(re.escape(chunk) for chunk in chunks) + r"\s*",
        re.IGNORECASE,
    )
    matched = label.match(value)
    stripped = value[matched.end():].strip() if matched else ""
    return stripped or None


# Purpose: Strictly map a flat primary ingredient stream onto DOM groups.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::_enrich_primary_groups(); calls server/src/server/modules/recipes/imports/website.py::_dom_structure_match().
def _match_primary_ingredient_groups(
    ingredient_lines: list[str],
    groups: list[ExtractedIngredientGroup],
) -> list[list[int]] | None:
    matched_indexes: list[list[int]] = []
    offset = 0
    for group in groups:
        if group.title and offset < len(ingredient_lines):
            candidate = ingredient_lines[offset].strip()
            if (
                candidate.endswith(":")
                and len(candidate) <= 80
                and not re.match(r"^[\d.,/\s¼½¾⅓⅔⅛]+", candidate)
                and not any(
                    word.rstrip(".").casefold() in _UNITS_BY_LOWER
                    for word in candidate.removesuffix(":").split()
                )
                and _dom_structure_match(candidate.removesuffix(":"))
                == _dom_structure_match(group.title.removesuffix(":"))
            ):
                offset += 1

        group_indexes = []
        for dom_line in group.ingredients:
            if (
                offset >= len(ingredient_lines)
                or _dom_structure_match(ingredient_lines[offset])
                != _dom_structure_match(dom_line)
            ):
                return None
            group_indexes.append(offset)
            offset += 1
        matched_indexes.append(group_indexes)

    return matched_indexes if offset == len(ingredient_lines) else None


# Purpose: Add verified DOM group boundaries without replacing primary recipe values.
# Connects to: Called by server/src/server/modules/recipes/imports/website.py::import_recipe_url(); calls server/src/server/modules/recipes/imports/website.py::{_dom_structure_match(),_strip_verified_group_label()} and server/src/server/recipe_url_import.py::extract_recipe_group_structure().
def _enrich_primary_groups(
    draft: ImportedRecipeTextDraft,
    extracted: ExtractedRecipe,
    html: str,
) -> tuple[ImportedRecipeTextDraft, bool]:
    try:
        structure = extract_recipe_group_structure(html)
    except WebsiteImportError:
        return draft, False

    updates = {}

    if (
        len(draft.ingredients) == 1
        and draft.ingredients[0].title is None
        and len(extracted.ingredient_groups) == 1
        and extracted.ingredient_groups[0].title is None
        and len(structure.ingredient_groups) >= 2
    ):
        ingredient_lines = extracted.ingredient_groups[0].ingredients
        ingredient_titles_valid = all(
            (index == 0 and group.title is None)
            or (
                bool(group.title)
                and len(group.title or "") <= 200
                and not any(
                    word.rstrip(".").casefold() in _UNITS_BY_LOWER
                    for word in (group.title or "").split()
                )
            )
            for index, group in enumerate(structure.ingredient_groups)
        )
        matched_indexes = (
            _match_primary_ingredient_groups(
                ingredient_lines,
                structure.ingredient_groups,
            )
            if ingredient_titles_valid
            and len(ingredient_lines) == len(draft.ingredients[0].items)
            else None
        )
        if matched_indexes is not None:
            updates["ingredients"] = [
                RecipeIngredientGroup(
                    title=group.title,
                    items=[
                        draft.ingredients[0].items[index]
                        for index in item_indexes
                    ],
                )
                for group, item_indexes in zip(
                    structure.ingredient_groups,
                    matched_indexes,
                    strict=True,
                )
            ]

    if (
        len(draft.instructions) == 1
        and draft.instructions[0].title is None
        and len(structure.instruction_groups) >= 2
    ):
        dom_instruction_lines = [
            step
            for group in structure.instruction_groups
            for step in group.instructions
        ]
        instruction_groups_valid = all(
            bool(group.title)
            and len(group.title or "") <= 200
            and bool(group.label_prefix)
            for group in structure.instruction_groups
        )
        if (
            instruction_groups_valid
            and len(extracted.instructions) == len(draft.instructions[0].steps)
            and [_dom_structure_match(line) for line in extracted.instructions]
            == [_dom_structure_match(line) for line in dom_instruction_lines]
        ):
            instruction_groups = []
            offset = 0
            for group in structure.instruction_groups:
                next_offset = offset + len(group.instructions)
                steps = list(draft.instructions[0].steps[offset:next_offset])
                first_step = _strip_verified_group_label(
                    steps[0].text,
                    group.label_prefix or "",
                )
                if first_step is None:
                    instruction_groups = []
                    break
                steps[0] = RecipeInstruction(text=first_step[:2000])
                instruction_groups.append(
                    RecipeInstructionGroup(title=group.title, steps=steps)
                )
                offset = next_offset
            if offset == len(draft.instructions[0].steps) and instruction_groups:
                updates["instructions"] = instruction_groups

    # NOTE: DOM contributes only verified presentation boundaries and labels;
    # primary parsed values remain authoritative, so core fields are not blended.
    return (draft.model_copy(update=updates), True) if updates else (draft, False)


# Purpose: Import a recipe URL using structured extraction with a guarded DOM fallback.
# Connects to: Registered by server/src/server/modules/recipes/router.py::router.add_api_route() for POST /recipes/import/url; calls server/src/server/modules/recipes/imports/website.py::{normalize_imported_website_recipe(),_missing_primary_reason(),_draft_core_counts(),_enrich_primary_groups(),_enrich_dom_nutrition()}, server/src/server/recipe_url_import.py::{fetch_public_html(),extract_recipe(),extract_recipe_container_text()}, and server/src/server/modules/recipes/imports/text.py::parse_recipe_text().
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
    extraction_strategy = "none"
    fallback_reason = "none"
    group_enrichment = "none"
    nutrition_enrichment = "none"
    nutrition_field_count = 0
    upstream_status = None
    redirect_count = 0
    fetch_phase = "none"
    content_type = "none"
    transport_error_kind = "none"
    transport = "unknown"
    browser_profile = "none"
    request_round_count = 0
    address_attempt_count = 0
    retry_reason = "none"
    page = None
    warnings: set[str] = set()

    try:
        page = fetch_public_html(str(payload.url))
        hostname = page.hostname
        response_size = page.response_size
        transport = getattr(page, "transport", "urllib3")
        browser_profile = getattr(page, "browser_profile", None) or "none"
        request_round_count = getattr(page, "request_round_count", 1)
        address_attempt_count = getattr(page, "address_attempt_count", 1)
        retry_reason = getattr(page, "retry_reason", None) or "none"

        primary_draft = None
        primary_metadata = {}
        extracted = None
        dom_notes = None
        website_description = None
        additional_time_label = None
        additional_time_minutes = None
        passive_times = []
        try:
            extracted = extract_recipe(page.html, page.url)
        except WebsiteImportError as exc:
            if exc.detail != "recipe_not_found":
                raise
            fallback_reason = "primary_exception"

        try:
            dom_metadata = extract_recipe_dom_metadata(
                page.html, title=extracted.title if extracted else None,
            )
        except WebsiteImportError:
            pass
        else:
            passive_times = dom_metadata.passive_times
            if not passive_times and dom_metadata.additional_time_label and dom_metadata.additional_time_text:
                passive_times = [(dom_metadata.additional_time_label, dom_metadata.additional_time_text)]
            additional_time_label, additional_time_minutes, unresolved = _resolve_passive_times(
                passive_times, warnings,
            )
            dom_notes = _append_recovery_notes(dom_metadata.notes, unresolved)
            website_description = dom_notes

        if extracted is not None:
            extracted_description, extracted_servings = (
                _website_description_and_servings(extracted, dom_notes)
            )
            website_description = extracted_description
            primary_metadata = {
                field: value
                for field, value in {
                    "servings": extracted_servings,
                    "prep_time_minutes": extracted.prep_time_minutes,
                    "cook_time_minutes": extracted.cook_time_minutes,
                    "total_time_minutes": extracted.total_time_minutes,
                    "additional_time_label": additional_time_label,
                    "additional_time_minutes": additional_time_minutes,
                    "image_url": extracted.image_url,
                }.items()
                if value is not None
            }
            try:
                primary_draft = normalize_imported_website_recipe(
                    extracted,
                    notes=dom_notes,
                    additional_time_label=additional_time_label,
                    additional_time_minutes=additional_time_minutes,
                )
            except ValueError:
                fallback_reason = _missing_primary_reason(
                    sum(len(group.ingredients) for group in extracted.ingredient_groups),
                    len(extracted.instructions),
                )

        if primary_draft is not None:
            ingredient_count, instruction_count = _draft_core_counts(primary_draft)
            if ingredient_count and instruction_count:
                try:
                    enriched_draft, groups_enriched = _enrich_primary_groups(
                        primary_draft,
                        extracted,
                        page.html,
                    )
                except Exception:
                    pass
                else:
                    primary_draft = enriched_draft
                    if groups_enriched:
                        group_enrichment = "dom"
                if primary_draft.nutrition_per_serving is None:
                    try:
                        candidate_text = extract_recipe_container_text(
                            page.html,
                            max_chars=RECIPE_TEXT_MAX_CHARS,
                        )
                        primary_draft, nutrition_field_count = (
                            _enrich_dom_nutrition(primary_draft, candidate_text)
                        )
                    except (WebsiteImportError, ValueError):
                        pass
                    else:
                        if nutrition_field_count:
                            nutrition_enrichment = "dom"
                extraction_strategy = "recipe_scrapers"
                result = "success"
                return primary_draft
            fallback_reason = _missing_primary_reason(
                ingredient_count,
                instruction_count,
            )

        try:
            fallback_metadata: list[str] = []
            fallback_text = extract_recipe_container_text(
                page.html,
                max_chars=RECIPE_TEXT_MAX_CHARS,
            )
            draft = parse_recipe_text(
                fallback_text, warnings, recovered_metadata=fallback_metadata,
            )
        except (WebsiteImportError, RecipeTextImportError) as exc:
            if isinstance(exc, WebsiteImportError) and exc.detail != "recipe_not_found":
                raise
            if isinstance(exc, RecipeTextImportError) and exc.code != "insufficient_structure":
                raise
            if primary_draft is None:
                raise
            logger.warning("Recipe DOM fallback exception_type=%s", type(exc).__name__)
            warnings.update({"primary_core_partial", "dom_fallback_failed"})
            extraction_strategy = "recipe_scrapers"
            result = "success"
            return primary_draft

        fallback_ingredients, fallback_instructions = _draft_core_counts(draft)
        if not fallback_ingredients or not fallback_instructions:
            if primary_draft is not None:
                warnings.update({"primary_core_partial", "dom_fallback_partial"})
                extraction_strategy = "recipe_scrapers"
                result = "success"
                return primary_draft
            warnings.add("dom_fallback_partial")
        # NOTE: Text imports allow generic nutrition headings, but website DOM
        # nutrition must pass the stricter per-serving confidence gate above.
        draft = draft.model_copy(update={"nutrition_per_serving": None})
        # NOTE: Do not compute fallback nutrition when the normalized primary
        # draft already has a trusted value that will be preserved below.
        if (
            primary_draft is None
            or primary_draft.nutrition_per_serving is None
        ):
            try:
                enriched_draft, enriched_field_count = _enrich_dom_nutrition(
                    draft,
                    fallback_text,
                )
            except ValueError:
                pass
            else:
                draft = enriched_draft
                nutrition_field_count = enriched_field_count
                if nutrition_field_count:
                    nutrition_enrichment = "dom"
        ingredient_count, instruction_count = _draft_core_counts(draft)

        if primary_draft is not None:
            # NOTE: Fallback owns title and core arrays. Restore only this
            # explicit set of non-null, high-confidence primary metadata.
            draft = draft.model_copy(
                update={
                    field: value
                    for field in (
                        "servings",
                        "prep_time_minutes",
                        "cook_time_minutes",
                        "total_time_minutes",
                        "additional_time_label",
                        "additional_time_minutes",
                        "nutrition_per_serving",
                        "image_url",
                    )
                    if (value := getattr(primary_draft, field)) is not None
                }
            )
        elif primary_metadata:
            draft = draft.model_copy(update=primary_metadata)
        elif additional_time_minutes is not None:
            draft = draft.model_copy(
                update={
                    "additional_time_label": additional_time_label,
                    "additional_time_minutes": additional_time_minutes,
                }
            )

        # Keep explicit Notes and labeled recovery metadata, excluding publisher
        # prose that the general text fallback interpreted as a description.
        draft = draft.model_copy(update={
            "description": _append_recovery_notes(website_description, fallback_metadata),
        })
        if passive_times:
            draft = draft.model_copy(update={
                "additional_time_label": additional_time_label,
                "additional_time_minutes": additional_time_minutes,
            })

        extraction_strategy = "dom_fallback"
        result = "success"
        return draft
    except WebsiteImportError as exc:
        result = exc.detail
        hostname = exc.hostname or hostname
        upstream_status = exc.upstream_status
        redirect_count = exc.redirect_count
        fetch_phase = exc.fetch_phase or "none"
        content_type = exc.content_type or "none"
        response_size = max(response_size, exc.response_size)
        transport_error_kind = exc.transport_error_kind or "none"
        if page is None:
            transport = exc.transport
            browser_profile = exc.browser_profile or "none"
            request_round_count = exc.request_round_count
            address_attempt_count = exc.address_attempt_count
            retry_reason = exc.retry_reason or "none"
        raise HTTPException(
            status_code=_WEBSITE_IMPORT_STATUS_CODES[exc.detail],
            detail=exc.detail,
        ) from exc
    except ValueError as exc:
        result = "recipe_not_found"
        raise HTTPException(status_code=422, detail=result) from exc
    except Exception as exc:
        result = "recipe_not_found"
        logger.exception(
            "Unexpected website recipe import failure hostname=%s",
            hostname,
        )
        raise HTTPException(status_code=422, detail=result) from exc
    finally:
        logger.log(
            logging.INFO if result == "success" else logging.WARNING,
            "Website recipe import hostname=%s result=%s duration_ms=%.1f "
            "response_size=%s ingredient_count=%s instruction_count=%s "
            "upstream_status=%s redirect_count=%s fetch_phase=%s "
            "content_type=%s transport_error_kind=%s "
            "transport=%s browser_profile=%s request_round_count=%s "
            "address_attempt_count=%s retry_reason=%s "
            "warning_codes=%s group_enrichment=%s extraction_strategy=%s fallback_reason=%s "
            "nutrition_enrichment=%s nutrition_field_count=%s",
            hostname,
            result,
            (perf_counter() - started_at) * 1000,
            response_size,
            ingredient_count,
            instruction_count,
            upstream_status,
            redirect_count,
            fetch_phase,
            content_type,
            transport_error_kind,
            transport,
            browser_profile,
            request_round_count,
            address_attempt_count,
            retry_reason,
            ",".join(sorted(warnings)) or "none",
            group_enrichment,
            extraction_strategy,
            fallback_reason,
            nutrition_enrichment,
            nutrition_field_count,
        )


# Purpose: Proxy a validated remote recipe image without persisting it server-side.
# Connects to: Registered by server/src/server/modules/recipes/router.py::router.add_api_route() for POST /recipes/import/image; calls server/src/server/recipe_url_import.py::fetch_public_image().
def import_recipe_image(
    payload: ImportRecipeUrlRequest,
    _auth: AuthContext = Depends(get_current_user),
):
    started_at = perf_counter()
    hostname = payload.url.host or "unknown"
    result = "page_unavailable"
    response_size = 0
    upstream_status = None
    redirect_count = 0
    fetch_phase = "none"
    content_type = "none"
    transport_error_kind = "none"

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
        hostname = exc.hostname or hostname
        upstream_status = exc.upstream_status
        redirect_count = exc.redirect_count
        fetch_phase = exc.fetch_phase or "none"
        content_type = exc.content_type or "none"
        response_size = max(response_size, exc.response_size)
        transport_error_kind = exc.transport_error_kind or "none"
        raise HTTPException(
            status_code=_WEBSITE_IMPORT_STATUS_CODES[exc.detail],
            detail=exc.detail,
        ) from exc
    finally:
        logger.info(
            "Website recipe image import hostname=%s result=%s duration_ms=%.1f "
            "response_size=%s upstream_status=%s redirect_count=%s "
            "fetch_phase=%s content_type=%s transport_error_kind=%s",
            hostname,
            result,
            (perf_counter() - started_at) * 1000,
            response_size,
            upstream_status,
            redirect_count,
            fetch_phase,
            content_type,
            transport_error_kind,
        )
