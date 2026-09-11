import json
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
FIXTURE_PACK_PATH = (
    SPECS_PATH / "import-from-text" / "noomori-text-import-fixtures"
)


class RecipeTextRequestTest(unittest.TestCase):
    def test_rejects_blank_and_oversized_text(self):
        with self.assertRaises(ValidationError):
            ImportRecipeTextRequest(text="   \n")
        with self.assertRaises(ValidationError):
            ImportRecipeTextRequest(text="x" * (RECIPE_TEXT_MAX_CHARS + 1))


class RecipeTextParserTest(unittest.TestCase):
    def test_reliability_unicode_ingredient_whitespace(self):
        for space in (" ", "\t", "\xa0", "\u202f", "   "):
            with self.subTest(space=repr(space)):
                draft = parse_recipe_text(
                    "Soup\nIngredients\n"
                    + f"•{space}1{space}½{space}tablespoons{space}flour\n"
                    + f"½–¾{space}cup{space}milk\n1 cupcake\n6 large apples"
                )
                flour, milk, cake, apples = draft.ingredients[0].items
                self.assertEqual((1.5, "tbsp", "flour"),
                                 (flour.quantity, flour.unit, flour.name))
                self.assertEqual((None, None, "½–¾ cup milk"),
                                 (milk.quantity, milk.unit, milk.name))
                self.assertEqual((1, None, "cupcake"),
                                 (cake.quantity, cake.unit, cake.name))
                self.assertEqual((6, None, "large apples"),
                                 (apples.quantity, apples.unit, apples.name))

    def test_reliability_times_across_metadata_layouts(self):
        layouts = (
            "Prep: 5 min\nChill: 8 hr\nTotal: 5 min",
            "Prep\n5 min\nChill Time\n8 hr\nTotal\n5 min",
            "Prep\nChill Time\nTotal\n5 min\n8 hr\n5 min",
            "| Prep | Chill Time | Total |\n| 5 min | 8 hr | 5 min |",
        )
        for metadata in layouts:
            with self.subTest(metadata=metadata):
                warnings = set()
                draft = parse_recipe_text(
                    f"Oats\n{metadata}\nIngredients\n1 cup oats", warnings
                )
                self.assertEqual((5, 5, "Chill", 480),
                                 (draft.prep_time_minutes, draft.total_time_minutes,
                                  draft.additional_time_label, draft.additional_time_minutes))
                self.assertIsNone(draft.description)
                self.assertNotIn("conflicting_total_time", warnings)

    def test_reliability_preserves_unresolved_times_after_notes(self):
        cases = (
            ("Rest: 30 min\nProof: 1 hr", ["Rest: 30 min", "Proof: 1 hr"]),
            ("Rest: 30 min\nRest: 45 min", ["Rest: 30 min", "Rest: 45 min"]),
            ("Chill: overnight", ["Chill: overnight"]),
            ("Chill: 0 min", ["Chill: 0 min"]),
            ("Chill: 1–2 hr", ["Chill: 1–2 hr"]),
            ("Chill:\novernight", ["Chill: overnight"]),
            ("| Prep | Chill |\n| 5 min | overnight |", ["Chill: overnight"]),
            ("Chill: -30 min", ["Chill: -30 min"]),
            ("Total: 5 min\nTotal: 10 min", ["Total: 5 min", "Total: 10 min"]),
        )
        for metadata, preserved in cases:
            with self.subTest(metadata=metadata):
                draft = parse_recipe_text(
                    f"Oats\n{metadata}\nIngredients\n1 cup oats\nNotes\nServe cold."
                )
                self.assertIsNone(draft.additional_time_label)
                self.assertIsNone(draft.additional_time_minutes)
                self.assertEqual("Serve cold.\n" + "\n".join(preserved), draft.description)

    def test_reliability_zero_totals_and_duplicate_passive_times(self):
        draft = parse_recipe_text(
            "Oats\nPrep: 0 min\nCook: 0 min\nTotal: 0 min\nTotal: 0 min\n"
            "Chill: 1 hr\nChill time: 60 min\nActive: 20 min\nIngredients\n1 cup oats"
        )
        self.assertEqual((0, 0, 0),
                         (draft.prep_time_minutes, draft.cook_time_minutes, draft.total_time_minutes))
        self.assertEqual(("Chill", 60), (draft.additional_time_label, draft.additional_time_minutes))
        self.assertEqual("Active: 20 min", draft.description)

    def test_imports_case_fixture(self):
        draft = parse_recipe_text(CASE_PATH.read_text())
        items = draft.ingredients[0].items

        self.assertIsNone(draft.title)
        self.assertEqual(30, draft.prep_time_minutes)
        self.assertEqual(40, draft.cook_time_minutes)
        self.assertEqual(8, draft.servings)
        self.assertEqual(
            "Yield: 1 (9-inch) pie",
            draft.description,
        )
        self.assertEqual(("Additional", 15, 85), (
            draft.additional_time_label, draft.additional_time_minutes, draft.total_time_minutes,
        ))
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
        self.assertEqual("Freeze leftovers.\nYield: 1 pie", draft.description)

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
    def test_imports_manifest_fixture_pack(self):
        manifest = json.loads((FIXTURE_PACK_PATH / "manifest.json").read_text())
        fixture_ids = [case["id"] for case in manifest["fixtures"]]
        input_ids = sorted(
            path.stem for path in (FIXTURE_PACK_PATH / "input").glob("*.txt")
        )
        expected_ids = sorted(
            path.stem for path in (FIXTURE_PACK_PATH / "expected").glob("*.json")
        )
        self.assertEqual(manifest["fixture_count"], len(fixture_ids))
        self.assertEqual(sorted(fixture_ids), input_ids)
        self.assertEqual(sorted(fixture_ids), expected_ids)

        warning_aliases = {
            "ambiguous_servings": "ambiguous_servings_range",
            "ambiguous_quantity": "ingredient_quantity_range",
            "conflicting_metadata": "conflicting_metadata",
            "inferred_structural_blocks_without_headings": (
                "inferred_structural_blocks_without_headings"
            ),
            "unsupported_metadata": "unsupported_metadata",
        }

        for case in manifest["fixtures"]:
            fixture_id = case["id"]
            with self.subTest(fixture=fixture_id):
                source = (FIXTURE_PACK_PATH / "input" / f"{fixture_id}.txt").read_text()
                expected = json.loads(
                    (FIXTURE_PACK_PATH / "expected" / f"{fixture_id}.json").read_text()
                )
                warnings: set[str] = set()

                if expected["status"] == "rejected":
                    with self.assertRaises(RecipeTextImportError) as error:
                        parse_recipe_text(source, warnings)
                    self.assertEqual(expected["error_code"], error.exception.code)
                    if not expected["warnings"]:
                        self.assertEqual(set(), warnings)
                    continue

                self.assertIn(expected["status"], {"structured", "partial"})
                draft = parse_recipe_text(source, warnings)
                direct_fields = {
                    "title": "title",
                    "servings": "servings",
                    "prep_time_minutes": "prep_time_minutes",
                    "cook_time_minutes": "cook_time_minutes",
                }
                for expected_key, draft_key in direct_fields.items():
                    if expected_key in expected:
                        self.assertEqual(
                            expected[expected_key],
                            getattr(draft, draft_key),
                        )

                ingredients = [
                    item for group in draft.ingredients for item in group.items
                ]
                steps = [step for group in draft.instructions for step in group.steps]
                counts = {
                    "ingredient_group_count": len(draft.ingredients),
                    "ingredient_count": len(ingredients),
                    "instruction_count": len(steps),
                }
                for key, actual in counts.items():
                    if key in expected:
                        self.assertEqual(expected[key], actual)

                if "ingredient_groups" in expected:
                    self.assertEqual(
                        expected["ingredient_groups"],
                        [group.title for group in draft.ingredients],
                    )

                description = draft.description or ""
                for text in expected.get("notes_contains", []):
                    self.assertIn(text, description)
                for text in expected.get("notes_must_not_contain", []):
                    self.assertNotIn(text, description)
                for text in expected.get("must_not_be_title_or_note", []):
                    self.assertNotEqual(text, draft.title)
                    self.assertNotIn(text, description)
                if expected.get("servings_text") is not None:
                    self.assertIn(expected["servings_text"], description)

                rendered_ingredients = {
                    " ".join(
                        part
                        for part in (
                            f"{item.quantity:g}" if item.quantity is not None else "",
                            item.unit or "",
                            item.name,
                        )
                        if part
                    ): item
                    for item in ingredients
                }
                for text in expected.get("must_preserve_ingredient_text", []):
                    self.assertIn(" ".join(text.split()), rendered_ingredients)

                ingredient_values = {
                    (item.quantity, item.unit) for item in ingredients
                }
                for quantity in expected.get("exact_quantities", []):
                    self.assertIn(
                        (quantity["quantity"], quantity["unit"]),
                        ingredient_values,
                    )

                if "instruction_contains" in expected:
                    instruction_text = [step.text for step in steps]
                    for text in expected["instruction_contains"]:
                        self.assertIn(text, instruction_text)

                if "nutrition" in expected:
                    self.assertIsNotNone(draft.nutrition_per_serving)
                    nutrition = draft.nutrition_per_serving.model_dump()
                    for key, value in expected["nutrition"].items():
                        self.assertEqual(value, nutrition[key])

                for warning in expected["warnings"]:
                    if warning in warning_aliases:
                        self.assertIn(warning_aliases[warning], warnings)
                    elif warning == "unsupported_duration_label_or_semantics":
                        self.assertIsNone(draft.prep_time_minutes)
                        self.assertIsNone(draft.cook_time_minutes)
                        self.assertIn("Waktu: 25 menit", description)
                    elif warning == "ambiguous_or_custom_units":
                        for text in expected["must_preserve_ingredient_text"]:
                            item = rendered_ingredients[" ".join(text.split())]
                            self.assertIsNone(item.unit)
                    else:
                        self.fail(f"Unhandled semantic warning: {warning}")
                if not expected["warnings"]:
                    self.assertEqual(set(), warnings)

    def test_serving_aliases_are_header_local(self):
        for label in ("Serves", "Porsi"):
            with self.subTest(label=label):
                draft = parse_recipe_text(
                    f"""Pie
{label}: 4
Ingredients
1 cup flour
Instructions
Mix.
{label}: 9
Notes
{label}: 8
"""
                )
                self.assertEqual(4, draft.servings)
                self.assertIn(f"{label}: 9", draft.instructions[0].steps[-1].text)
                self.assertIn(f"{label}: 8", draft.description)

    def test_unheaded_inference_remains_narrow(self):
        invalid_sources = (
            "Toast\n2 eggs\n\n1. Cook.",
            "Toast\nEggs to taste\n\n1. Cook.\n2. Serve.",
            "Toast\n2 eggs\n\n1. Cook.\nServe without a number.",
        )
        for source in invalid_sources:
            with self.subTest(source=source):
                with self.assertRaisesRegex(
                    RecipeTextImportError, "insufficient_structure"
                ):
                    parse_recipe_text(source)

    def test_numbered_continuations_stop_at_structural_boundaries(self):
        draft = parse_recipe_text(
            """Soup
Ingredients
1 cup stock
Instructions
1. Simmer the stock.
Keep the heat low.

Serve in a warm bowl.
Notes
Season to taste.
"""
        )
        self.assertEqual(
            ["Simmer the stock. Keep the heat low.", "Serve in a warm bowl."],
            [step.text for step in draft.instructions[0].steps],
        )
        self.assertEqual("Season to taste.", draft.description)

    def test_footer_requires_one_bullet_and_the_exact_title(self):
        draft = parse_recipe_text(
            """Pie
Ingredients
1 cup flour
Instructions
Mix.
Notes
Recipe Card • Pie
Recipe Card • Another Pie
Document • Recipe Card • Pie
"""
        )
        description_lines = draft.description.splitlines()
        self.assertNotIn("Recipe Card • Pie", description_lines)
        self.assertIn("Recipe Card • Another Pie", description_lines)
        self.assertIn("Document • Recipe Card • Pie", description_lines)

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
        self.assertEqual(("Additional", 5, 45), (
            draft.additional_time_label, draft.additional_time_minutes, draft.total_time_minutes,
        ))
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
