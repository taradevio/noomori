import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from server.modules.recipes.imports.text import (
    RecipeTextImportError,
    parse_recipe_text,
)
from server.modules.recipes.schemas import (
    ImportRecipeTextRequest,
    RECIPE_TEXT_MAX_CHARS,
)
from server.modules.recipes.service import import_recipe_text

SPECS_PATH = Path(__file__).resolve().parents[2] / "specs"
CASE_PATH = SPECS_PATH / "case.txt"
CASE2_PATH = SPECS_PATH / "case2.txt"
FIXTURES_PATH = Path(__file__).parent / "fixtures" / "text_import"


class RecipeTextRequestTest(unittest.TestCase):
    def test_rejects_blank_and_oversized_text(self):
        with self.assertRaises(ValidationError):
            ImportRecipeTextRequest(text="   \n")
        with self.assertRaises(ValidationError):
            ImportRecipeTextRequest(text="x" * (RECIPE_TEXT_MAX_CHARS + 1))


class RecipeTextParserTest(unittest.TestCase):
    def test_imports_case_fixture(self):
        draft = parse_recipe_text(CASE_PATH.read_text())
        items = draft.ingredients[0].items

        self.assertIsNone(draft.title)
        self.assertEqual(30, draft.prep_time_minutes)
        self.assertEqual(40, draft.cook_time_minutes)
        self.assertEqual(8, draft.servings)
        self.assertEqual(
            "Additional Time: 15 mins\nYield: 1 (9-inch) pie",
            draft.description,
        )
        self.assertEqual(10, len(items))
        self.assertEqual(9, len(draft.instructions[0].steps))
        self.assertEqual((1, "pack"), (items[0].quantity, items[0].unit))
        self.assertEqual("14.1 ounce/2 count", items[0].note)
        self.assertEqual((0.5, "cup"), (items[5].quantity, items[5].unit))
        self.assertEqual((0.25, "tsp"), (items[7].quantity, items[7].unit))
        self.assertIsNone(draft.nutrition_per_serving)

    def test_imports_case2_servings(self):
        draft = parse_recipe_text(CASE2_PATH.read_text())
        first = draft.ingredients[0].items[0]

        self.assertEqual("Asian Chilli Garlic Prawns (Shrimp)", draft.title)
        self.assertIsNone(draft.servings)
        self.assertEqual((166.67, "g"), (first.quantity, first.unit))
        self.assertTrue(first.name.startswith("prawns / shrimp"))
        self.assertNotIn("0.33 lb", first.name)
        self.assertNotIn("Serving: 194g", draft.description)
        self.assertEqual(
            {
                "calories_kcal": 410,
                "protein_g": 52,
                "carbs_g": 20,
                "fat_g": 12,
                "saturated_fat_g": 6,
                "cholesterol_mg": 630,
                "fiber_g": None,
                "sugar_g": 17,
                "sodium_mg": 2802,
            },
            draft.nutrition_per_serving.model_dump(),
        )

    def test_keeps_only_same_dimension_primary_measurements(self):
        cases = [
            (
                "166.67g / 0.33 lb prawns / shrimp",
                "prawns / shrimp",
            ),
            ("500 ml / 2 cups broth", "broth"),
            ("320 g (11 oz) spaghetti", "spaghetti"),
            (
                "150 g (5.3 oz) guanciale, cut into small strips or cubes",
                "guanciale, cut into small strips or cubes",
            ),
            (
                "100 g (3.5 oz) Pecorino Romano, finely grated",
                "Pecorino Romano, finely grated",
            ),
            ("1 cup / 120 g flour", "/ 120 g flour"),
            ("1 cup (120 g) flour", "(120 g) flour"),
            ("1 cup / 2 scoops flour", "/ 2 scoops flour"),
            ("1 cup (2 scoops) flour", "(2 scoops) flour"),
            ("1 cup / nope tbsp broth", "/ nope tbsp broth"),
            ("1 cup (nope tbsp) broth", "(nope tbsp) broth"),
            ("1 cup prawns / shrimp", "prawns / shrimp"),
        ]

        for line, expected_name in cases:
            with self.subTest(line=line):
                draft = parse_recipe_text(f"Pie\nIngredients\n{line}")
                ingredient = draft.ingredients[0].items[0]
                self.assertEqual(expected_name, ingredient.name)

    def test_recognizes_common_notes_headings_without_matching_instruction_prose(self):
        headings = [
            "Note",
            "Notes",
            "Key Notes",
            "Recipe Notes",
            "Chef's Notes",
            "Chef’s Notes",
            "Cook's Notes",
            "Cook’s Notes",
            "Important Notes",
            "Additional Notes",
            "Helpful Notes",
            "Tips & Notes",
            "Tips and Notes",
            "Notes & Tips",
            "Notes and Tips",
        ]

        for heading in headings:
            for rendered_heading in (heading, heading.upper(), f"{heading}:"):
                with self.subTest(heading=rendered_heading):
                    draft = parse_recipe_text(
                        f"""Pie
Ingredients
1 cup flour
Instructions
1. Note the texture before serving.
{rendered_heading}
Keep the skillet off the heat.
"""
                    )

                    self.assertEqual(
                        ["Note the texture before serving."],
                        [step.text for step in draft.instructions[0].steps],
                    )
                    self.assertEqual(
                        "Keep the skillet off the heat.",
                        draft.description,
                    )

    def test_recognizes_exact_english_and_indonesian_section_aliases(self):
        ingredient_headings = (
            "Ingredient",
            "Ingredients",
            "Bahan",
            "Bahan-Bahan",
        )
        instruction_headings = (
            "Direction",
            "Directions",
            "Instruction",
            "Instructions",
            "Method",
            "Baking Instructions",
            "Cara Membuat",
            "Cara Memasak",
            "Langkah",
            "Langkah-Langkah",
        )

        for heading in ingredient_headings:
            for rendered in (heading, heading.upper(), f"{heading}:"):
                with self.subTest(ingredient_heading=rendered):
                    draft = parse_recipe_text(
                        f"Pie\n{rendered}\n1 cup flour\nInstructions\nMix well."
                    )
                    self.assertEqual(1, len(draft.ingredients[0].items))
                    self.assertEqual(1, len(draft.instructions[0].steps))

        for heading in instruction_headings:
            for rendered in (heading, heading.upper(), f"{heading}:"):
                with self.subTest(instruction_heading=rendered):
                    draft = parse_recipe_text(
                        f"Pie\nIngredients\n1 cup flour\n{rendered}\nMix well."
                    )
                    self.assertEqual(1, len(draft.ingredients[0].items))
                    self.assertEqual(1, len(draft.instructions[0].steps))

    def test_normalizes_section_spacing_without_fuzzy_matching(self):
        draft = parse_recipe_text(
            "Pie\n  BAHAN -   BAHAN :\n1 cup flour\n"
            "CARA   MEMBUAT :\nMix well."
        )
        self.assertEqual(1, len(draft.ingredients[0].items))
        self.assertEqual(1, len(draft.instructions[0].steps))

        ingredient_substring = parse_recipe_text(
            "Pie\nBahan Tambahan\n1 cup flour\nInstructions\nMix well."
        )
        self.assertEqual([], ingredient_substring.ingredients)
        self.assertEqual(1, len(ingredient_substring.instructions[0].steps))

        instruction_substring = parse_recipe_text(
            "Pie\nIngredients\n1 cup flour\nCara Membuat Saus\nMix well."
        )
        self.assertEqual([], instruction_substring.instructions)

    def test_removes_only_standalone_instruction_markers(self):
        markers = (
            "1",
            "2.",
            "3)",
            "Langkah 1",
            "langkah 2",
            "LANGKAH 3",
            "Langkah 1/5",
            "Langkah 1 dari 5",
            "Step 1",
            "Step 2/5",
        )
        kept = (
            "Masak selama 1 jam.",
            "Tambahkan 2 sdm minyak.",
            "Bagi menjadi 3 bagian.",
            "Ulangi langkah 2 bila perlu.",
        )
        draft = parse_recipe_text(
            "Pie\nIngredients\n1 cup flour\nInstructions\n"
            + "\n".join((*markers, *kept))
        )

        self.assertEqual(
            list(kept),
            [step.text for step in draft.instructions[0].steps],
        )

    def test_parses_indonesian_nutrition_aliases_and_units(self):
        draft = parse_recipe_text(
            """Pie
Nutrition
Kalori:
181 Kkal
Protein 3 gram
Karbo 25.8 gr
Lemak 7.5 gram
Lemak Jenuh 2 gram
Serat 2 gram
Gula 1 gram
Natrium 420 mg
Kolesterol 12 mg
Ingredients
1 cup flour
"""
        )

        self.assertEqual(
            {
                "calories_kcal": 181,
                "protein_g": 3,
                "carbs_g": 25.8,
                "fat_g": 7.5,
                "saturated_fat_g": 2,
                "cholesterol_mg": 12,
                "fiber_g": 2,
                "sugar_g": 1,
                "sodium_mg": 420,
            },
            draft.nutrition_per_serving.model_dump(),
        )

        energy = parse_recipe_text(
            "Pie\nNutrition\nEnergi: 90 kkal\nIngredients\n1 cup flour"
        )
        self.assertEqual(90, energy.nutrition_per_serving.calories_kcal)

    def test_pending_nutrition_does_not_cross_structural_sections(self):
        cases = (
            "Pie\nNutrition\nCalories\nIngredients\n181 kcal\nInstructions\nMix.",
            "Pie\nNutrition\nCalories\nInstructions\n181 kcal\nIngredients\nflour",
            "Pie\nNutrition\nCalories\nNotes\n181 kcal\nIngredients\nflour",
        )

        for text in cases:
            with self.subTest(text=text):
                self.assertIsNone(parse_recipe_text(text).nutrition_per_serving)

    def test_extracts_salmon_nutrition_table(self):
        draft = parse_recipe_text(
            """Pan-Seared Salmon with Lemon Dill Cream Sauce
Nutritional Facts (Per Serving)
Nutrient
Amount Per Serving
Calories
480 kcal
Protein
36 g
Total Fat
34 g
Saturated Fat
12 g
Trans Fat
0 g
Carbohydrates
4 g
Dietary Fiber
0.5 g
Sugars
2 g
Sodium
420 mg
Cholesterol
125 mg
Ingredients
1 tbsp olive oil
Instructions
Sear the salmon.
Recipe Notes
Serve immediately.
"""
        )

        self.assertEqual(
            {
                "calories_kcal": 480,
                "protein_g": 36,
                "carbs_g": 4,
                "fat_g": 34,
                "saturated_fat_g": 12,
                "cholesterol_mg": 125,
                "fiber_g": 0.5,
                "sugar_g": 2,
                "sodium_mg": 420,
            },
            draft.nutrition_per_serving.model_dump(),
        )
        self.assertEqual("Serve immediately.", draft.description)
        self.assertEqual(1, len(draft.ingredients[0].items))
        self.assertEqual(1, len(draft.instructions[0].steps))
        self.assertNotIn("trans", draft.nutrition_per_serving.model_dump())

    def test_supports_nutrition_headings_and_ignores_invalid_values(self):
        headings = [
            "Nutrition",
            "Nutrition:",
            "NUTRITION FACTS",
            "Nutritional Facts (Per Serving):",
            "Nutrition Information Per Serving",
            "Nutritional Information",
        ]

        for heading in headings:
            with self.subTest(heading=heading):
                draft = parse_recipe_text(
                    f"""Pie
{heading}
Calories: 1,200 kcal | Calories: 999 kcal | Protein: .5 grams
Sodium: 420 milligrams | Fat: -1 g | Cholesterol: 2 g | Trans Fat: 0 g
Ingredients
1 cup flour
"""
                )
                nutrition = draft.nutrition_per_serving

                self.assertEqual(1200, nutrition.calories_kcal)
                self.assertEqual(0.5, nutrition.protein_g)
                self.assertEqual(420, nutrition.sodium_mg)
                self.assertIsNone(nutrition.fat_g)
                self.assertIsNone(nutrition.cholesterol_mg)
                self.assertIsNone(nutrition.carbs_g)

    def test_extracts_sections_metadata_notes_and_known_units(self):
        draft = parse_recipe_text(
            """Miso noodles
Servings: 2
Prep time: 10 min
Cook time: 1 hr 5 min

Ingredients
Sauce:
- 2 tbsp soy sauce
- 1 scoop chili paste

Instructions
Sauce:
1. Stir the sauce.
2. Toss with noodles.

Notes
Serve immediately.
"""
        )

        self.assertEqual("Miso noodles", draft.title)
        self.assertEqual(2, draft.servings)
        self.assertEqual(10, draft.prep_time_minutes)
        self.assertEqual(65, draft.cook_time_minutes)
        self.assertEqual("Serve immediately.", draft.description)
        self.assertEqual("Sauce", draft.ingredients[0].title)
        self.assertEqual(2, draft.ingredients[0].items[0].quantity)
        self.assertEqual("tbsp", draft.ingredients[0].items[0].unit)
        self.assertEqual("soy sauce", draft.ingredients[0].items[0].name)
        self.assertIsNone(draft.ingredients[0].items[1].unit)
        self.assertEqual("scoop chili paste", draft.ingredients[0].items[1].name)
        self.assertEqual("Stir the sauce.", draft.instructions[0].steps[0].text)

    def test_captures_ingredient_and_instruction_groups(self):
        draft = parse_recipe_text(
            """**Layer cake**
Preparation: 15 minutes
Cooking time: 1 hr

Ingredients:
Cake:
- 250gr flour
- 1 l milk
Frosting:
- 100 grams sugar

Method:
Cake:
1. Mix the batter.
2. Bake until set.
Frosting:
1. Whisk until smooth.

Notes:
Cool before frosting.
"""
        )

        self.assertEqual("Layer cake", draft.title)
        self.assertEqual(15, draft.prep_time_minutes)
        self.assertEqual(60, draft.cook_time_minutes)
        self.assertEqual("Cool before frosting.", draft.description)
        self.assertEqual(
            ["Cake", "Frosting"],
            [group.title for group in draft.ingredients],
        )
        self.assertEqual(
            ["g", "L", "g"],
            [item.unit for group in draft.ingredients for item in group.items],
        )
        self.assertEqual(
            [250, 1, 100],
            [item.quantity for group in draft.ingredients for item in group.items],
        )
        self.assertEqual(
            ["Cake", "Frosting"],
            [group.title for group in draft.instructions],
        )
        self.assertEqual("Whisk until smooth.", draft.instructions[1].steps[0].text)

    def test_supports_metadata_layouts_and_boundaries(self):
        recipe = "\nIngredients\n1 cup flour\nInstructions\n1. Mix."
        cases = [
            (
                "inline",
                "Prep Time: 30 mins\nCook Time: 40 mins\nServings: 8\nPie",
                ("Pie", 30, 40, 8),
            ),
            (
                "next meaningful line",
                "Prep Time:\n\n30 mins\nCook Time:\n40 mins\nServings:\n8\nPie",
                ("Pie", 30, 40, 8),
            ),
            (
                "malformed value keeps title",
                "Prep Time:\nPie",
                ("Pie", None, None, None),
            ),
            (
                "missing value keeps section",
                "Cook Time:",
                (None, None, None, None),
            ),
            (
                "ignored times",
                "Additional Time:\n15 mins\nTotal Time:\n1 hr\nPie",
                ("Pie", None, None, None),
            ),
            (
                "zero servings",
                "Servings: 0\nPie",
                ("Pie", None, None, None),
            ),
            (
                "embedded zero does not use the right endpoint",
                "Pie\nCourse: Dinner Servings: 0 - 4 people",
                ("Pie", None, None, None),
            ),
        ]

        for name, metadata, expected in cases:
            with self.subTest(name=name):
                draft = parse_recipe_text(metadata + recipe)
                self.assertEqual(
                    expected,
                    (
                        draft.title,
                        draft.prep_time_minutes,
                        draft.cook_time_minutes,
                        draft.servings,
                    ),
                )

    def test_imports_markdown_tables_and_removes_formatting(self):
        draft = parse_recipe_text(
            """# **Markdown Pie**

| Prep Time | Cook Time | Total Time | Servings |
| :--- | :--- | :--- | :--- |
| 20 mins | 15 mins | 35 mins | 4 |

---

## Nutritional Facts (Per Serving)
| Nutrient | Amount Per Serving |
| :--- | :--- |
| **Calories** | 390 kcal |
| **Protein** | 28 g |
| **Total Fat** | 26 g |
| **Saturated Fat** | 10 g |
| **Trans Fat** | 0.5 g |
| **Carbohydrates** | 11 g |
| **Dietary Fiber** | 1.5 g |
| **Sugars** | 2 g |
| **Sodium** | 580 mg |
| **Cholesterol** | 95 mg |

## Ingredients
### **Filling:**
* **500g (1.1 lbs)** beef
* **2 cloves** garlic
* olive_oil 2 * 3

---

## Instructions
1. **Mix:** Stir _gently_; keep olive_oil at 2 * 3.

## Recipe Notes
* **Tip:** Keep _covered_.
"""
        )

        self.assertEqual("Markdown Pie", draft.title)
        self.assertEqual(20, draft.prep_time_minutes)
        self.assertEqual(15, draft.cook_time_minutes)
        self.assertEqual(4, draft.servings)
        self.assertEqual(
            {
                "calories_kcal": 390,
                "protein_g": 28,
                "carbs_g": 11,
                "fat_g": 26,
                "saturated_fat_g": 10,
                "cholesterol_mg": 95,
                "fiber_g": 1.5,
                "sugar_g": 2,
                "sodium_mg": 580,
            },
            draft.nutrition_per_serving.model_dump(),
        )
        self.assertEqual("Filling", draft.ingredients[0].title)
        self.assertEqual(
            [
                (500, "g", "beef"),
                (2, "clove", "garlic"),
                (None, None, "olive_oil 2 * 3"),
            ],
            [
                (item.quantity, item.unit, item.name)
                for item in draft.ingredients[0].items
            ],
        )
        self.assertEqual(
            "Mix: Stir gently; keep olive_oil at 2 * 3.",
            draft.instructions[0].steps[0].text,
        )
        self.assertEqual("Tip: Keep covered.", draft.description)
        serialized = draft.model_dump_json()
        self.assertNotIn("**", serialized)
        self.assertNotIn("_gently_", serialized)
        self.assertNotIn("_covered_", serialized)
        self.assertNotIn("---", serialized)

    def test_preserves_yield_as_notes_without_changing_servings(self):
        recipe = "\nPie\nIngredients\n1 cup flour"
        cases = [
            ("Yield: about 12 cookies", None, "Yield: about 12 cookies"),
            ("Yield: one loaf", None, "Yield: one loaf"),
            ("Yield:\n1 pie\nServings: 8", 8, "Yield: 1 pie"),
            ("Servings: 8\nYield: 1 pie", 8, "Yield: 1 pie"),
        ]

        for metadata, servings, notes in cases:
            with self.subTest(metadata=metadata):
                draft = parse_recipe_text(metadata + recipe)
                self.assertEqual(servings, draft.servings)
                self.assertEqual(notes, draft.description)

        draft = parse_recipe_text(
            """Pie
Yield: 1 pie
Ingredients
1 cup flour
Notes
Freeze leftovers.
"""
        )
        self.assertEqual("Yield: 1 pie\nFreeze leftovers.", draft.description)

    def test_supports_quantity_and_unit_edge_cases(self):
        cases = [
            ("1/2 cup milk", 0.5, "cup", "milk", None),
            ("3/4 cup milk", 0.75, "cup", "milk", None),
            ("1 1/2 cup flour", 1.5, "cup", "flour", None),
            ("½ cup flour", 0.5, "cup", "flour", None),
            ("¼ teaspoon salt", 0.25, "tsp", "salt", None),
            ("1½ cups flour", 1.5, "cup", "flour", None),
            ("1 ½ cups flour", 1.5, "cup", "flour", None),
            ("2 1/2 cup flour", 2.5, "cup", "flour", None),
            (".5 L water", 0.5, "L", "water", None),
            ("1 l water", 1, "L", "water", None),
            ("250gr flour", 250, "g", "flour", None),
            ("1 package pastry", 1, "pack", "pastry", None),
            ("2 packages pastry", 2, "pack", "pastry", None),
            (
                "1 (14.1 ounce/2 count) package pastry",
                1,
                "pack",
                "pastry",
                "14.1 ounce/2 count",
            ),
            ("1 scoop spice", 1, None, "scoop spice", None),
            ("1/0 cup salt", None, None, "1/0 cup salt", None),
        ]

        for line, quantity, unit, name, note in cases:
            with self.subTest(line=line):
                draft = parse_recipe_text(f"Pie\nIngredients\n{line}")
                ingredient = draft.ingredients[0].items[0]
                self.assertEqual(
                    (quantity, unit, name, note),
                    (
                        ingredient.quantity,
                        ingredient.unit,
                        ingredient.name,
                        ingredient.note,
                    ),
                )

    def test_keeps_ingredient_and_instruction_structure_without_title(self):
        draft = parse_recipe_text(
            """Ingredients
Empty:
Filled:
- 1 cup flour
Instructions
Mixing:
• Stir without changing the wording.
"""
        )

        self.assertIsNone(draft.title)
        self.assertEqual(["Filled"], [group.title for group in draft.ingredients])
        self.assertEqual(["Mixing"], [group.title for group in draft.instructions])
        self.assertEqual(
            "Stir without changing the wording.",
            draft.instructions[0].steps[0].text,
        )

    def test_supports_current_quantity_formats(self):
        draft = parse_recipe_text(
            """Bread
Ingredients
- 2 1/2 cup flour
- 1/2 tsp salt
- .5 L water
"""
        )

        quantities = [item.quantity for item in draft.ingredients[0].items]
        self.assertEqual([2.5, 0.5, 0.5], quantities)
        self.assertEqual(
            ["cup", "tsp", "L"],
            [item.unit for item in draft.ingredients[0].items],
        )

    def test_allows_a_partial_recipe_with_two_signals(self):
        draft = parse_recipe_text(
            """Simple salad
Ingredients
Tomatoes
Cucumber
"""
        )

        self.assertEqual("Simple salad", draft.title)
        self.assertEqual(2, len(draft.ingredients[0].items))
        self.assertEqual([], draft.instructions)

    def test_rejects_text_with_only_one_recipe_signal(self):
        with self.assertRaisesRegex(ValueError, "insufficient_structure"):
            parse_recipe_text("This is only an unstructured paragraph.")

        with self.assertRaises(HTTPException) as error:
            import_recipe_text(
                ImportRecipeTextRequest(text="This is only an unstructured paragraph."),
                object(),
            )
        self.assertEqual(422, error.exception.status_code)
        self.assertEqual("insufficient_structure", error.exception.detail)


class RecipeTextHardeningTest(unittest.TestCase):
    def test_logs_structural_telemetry_without_recipe_content(self):
        raw_text = (
            "Secret soup\nIngredients\n1–2 tbsp private stock\n"
            "Instructions\nDo the private thing."
        )
        with patch("server.modules.recipes.service.logger.log") as log:
            draft = import_recipe_text(ImportRecipeTextRequest(text=raw_text), object())

        self.assertEqual("Secret soup", draft.title)
        self.assertEqual("complete", log.call_args.args[2])
        self.assertEqual("none", log.call_args.args[3])
        self.assertIn("ingredient_quantity_range", log.call_args.args[4])
        serialized_call = repr(log.call_args)
        self.assertNotIn("Secret soup", serialized_call)
        self.assertNotIn("private stock", serialized_call)
        self.assertNotIn("private thing", serialized_call)

        with patch("server.modules.recipes.service.logger.log") as log:
            with self.assertRaises(HTTPException):
                import_recipe_text(
                    ImportRecipeTextRequest(text="Private unstructured text"),
                    object(),
                )
        self.assertEqual("failed", log.call_args.args[2])
        self.assertEqual("insufficient_structure", log.call_args.args[3])
        self.assertNotIn("Private unstructured text", repr(log.call_args))

    def test_imports_google_docs_golden_fixtures(self):
        bolognese = parse_recipe_text(
            (FIXTURES_PATH / "google-docs-bolognese.txt").read_text()
        )
        self.assertEqual("Classic Spaghetti Bolognese Recipe", bolognese.title)
        self.assertEqual((15, 45, None), (
            bolognese.prep_time_minutes,
            bolognese.cook_time_minutes,
            bolognese.servings,
        ))
        self.assertEqual(2, len(bolognese.ingredients))
        self.assertEqual(7, sum(len(group.steps) for group in bolognese.instructions))
        ingredient_names = [
            item.name for group in bolognese.ingredients for item in group.items
        ]
        self.assertNotIn("Step-by-Step Instructions", ingredient_names)
        self.assertFalse(any("Sauté the Aromatics" in name for name in ingredient_names))
        self.assertIn("Difficulty: Easy / Intermediate", bolognese.description)

        salmon = parse_recipe_text(
            (FIXTURES_PATH / "google-docs-salmon.txt").read_text()
        )
        self.assertEqual((10, 15, 4), (
            salmon.prep_time_minutes,
            salmon.cook_time_minutes,
            salmon.servings,
        ))
        self.assertEqual(5, sum(len(group.steps) for group in salmon.instructions))
        self.assertEqual(480, salmon.nutrition_per_serving.calories_kcal)
        self.assertIn("high-protein, heart-healthy meal", salmon.description)

        chicken = parse_recipe_text(
            (FIXTURES_PATH / "google-docs-garlic-chicken.txt").read_text()
        )
        self.assertEqual((10, 20, 4), (
            chicken.prep_time_minutes,
            chicken.cook_time_minutes,
            chicken.servings,
        ))
        self.assertEqual(7, sum(len(group.steps) for group in chicken.instructions))
        self.assertNotIn("Line spacing", chicken.model_dump_json())

        carbonara = parse_recipe_text(
            (FIXTURES_PATH / "google-docs-carbonara.txt").read_text()
        )
        self.assertEqual((10, 20, 4), (
            carbonara.prep_time_minutes,
            carbonara.cook_time_minutes,
            carbonara.servings,
        ))
        self.assertEqual(6, sum(len(group.steps) for group in carbonara.instructions))
        pepper = next(
            item
            for group in carbonara.ingredients
            for item in group.items
            if "1–2 tsp" in item.name
        )
        self.assertIsNone(pepper.quantity)
        self.assertIsNone(pepper.unit)
        self.assertNotIn("Italian Recipe •", carbonara.description)

    def test_metadata_is_header_local_and_conflicts_are_not_overwritten(self):
        draft = parse_recipe_text(
            """Pie
Prep Time: 5 min
Prep Time: 5 minutes
Cook Time: 20 min
Cook Time: 45 min
Ingredients
1 cup flour
Instructions
Cook Time: 90 min
Mix well.
Notes
Servings: 4
"""
        )
        self.assertEqual(5, draft.prep_time_minutes)
        self.assertIsNone(draft.cook_time_minutes)
        self.assertIsNone(draft.servings)
        self.assertIn("Cook Time: 20 min", draft.description)
        self.assertIn("Cook Time: 45 min", draft.description)
        self.assertIn("Cook Time: 90 min", draft.instructions[0].steps[0].text)
        self.assertIn("Servings: 4", draft.description)

    def test_metadata_tables_preserve_alignment_ranges_and_unsupported_values(self):
        warnings: set[str] = set()
        draft = parse_recipe_text(
            """Pie
Prep Time\tDifficulty\tCook Time\tServings
10 mins\tEasy\t20 mins\t4–6 servings
Ingredients
1 cup flour
Instructions
Mix.
""",
            warnings,
        )
        self.assertEqual(10, draft.prep_time_minutes)
        self.assertEqual(20, draft.cook_time_minutes)
        self.assertIsNone(draft.servings)
        self.assertIn("Servings: 4–6 servings", draft.description)
        self.assertIn("Difficulty: Easy", draft.description)
        self.assertIn("ambiguous_servings_range", warnings)

    def test_preserves_only_meaningful_header_and_supplementary_text(self):
        draft = parse_recipe_text(
            """\ufeffChicken\r
Line spacing: 1.25\r
Recipe Overview\r
A useful overview.\r
Prep: 10 min\r
Cook: 20 min\r
Total: 45 min\r
Additional Time: 5 min\r
Ingredients\v1\u00a0cup\u00a0stock\r
•••\r
Instructions\r
Simmer.\r
Notes\r
Keep warm.\r
Italian Recipe • Chicken\r
"""
        )
        self.assertEqual("Chicken", draft.title)
        self.assertEqual((10, 20), (draft.prep_time_minutes, draft.cook_time_minutes))
        self.assertIn("A useful overview.", draft.description)
        self.assertIn("Additional Time: 5 min", draft.description)
        self.assertIn("Total: 45 min", draft.description)
        self.assertIn("Keep warm.", draft.description)
        self.assertNotIn("Line spacing", draft.description)
        self.assertNotIn("Italian Recipe", draft.description)

    def test_guards_ranges_and_detects_uncolonized_groups(self):
        draft = parse_recipe_text(
            """Dinner
Ingredients
For the Sauce
1 tbsp oil
2 cloves garlic
For the Pasta & Serving
1 lb spaghetti
1-2 tbsp salt
2 to 3 tablespoons sugar
1 or 2 tbsp pepper
1/2 cup stock
Instructions
Cook.
"""
        )
        self.assertEqual(
            ["For the Sauce", "For the Pasta & Serving"],
            [group.title for group in draft.ingredients],
        )
        ranged = draft.ingredients[1].items[1:4]
        self.assertTrue(all(item.quantity is None and item.unit is None for item in ranged))
        self.assertEqual(0.5, draft.ingredients[1].items[4].quantity)

    def test_joins_wrapped_numbered_steps_without_using_number_sequence(self):
        draft = parse_recipe_text(
            """Chicken
Ingredients
1 lb chicken
Instructions
1. Bake the chicken until crisp and
   the internal temperature reaches 165°F.
1. Rest for five minutes.
4. Serve immediately; keep warm.
"""
        )
        self.assertEqual(
            [
                "Bake the chicken until crisp and the internal temperature reaches 165°F.",
                "Rest for five minutes.",
                "Serve immediately; keep warm.",
            ],
            [step.text for step in draft.instructions[0].steps],
        )

    def test_exact_step_aliases_do_not_match_instruction_prose(self):
        for heading in ("Steps", "Step-by-Step Instructions", "Step by Step Instructions"):
            with self.subTest(heading=heading):
                draft = parse_recipe_text(
                    f"Pie\nIngredients\n1 cup flour\n{heading}\nMix."
                )
                self.assertEqual("Mix.", draft.instructions[0].steps[0].text)

        draft = parse_recipe_text(
            "Pie\nIngredients\nFollow package instructions.\nRepeat the previous step."
        )
        self.assertEqual(2, len(draft.ingredients[0].items))

    def test_rejects_ambiguous_numbered_bleed_and_multiple_recipes(self):
        with self.assertRaisesRegex(RecipeTextImportError, "ambiguous_structure"):
            parse_recipe_text(
                """Pie
Ingredients
1 cup flour

1. Mix the batter.
2. Bake the pie.
"""
            )

        with self.assertRaisesRegex(RecipeTextImportError, "multiple_recipes"):
            parse_recipe_text(
                """Pie
Ingredients
1 cup flour
Instructions
Mix.
Soup
Ingredients
1 cup stock
Instructions
Simmer.
"""
            )


if __name__ == "__main__":
    unittest.main()
