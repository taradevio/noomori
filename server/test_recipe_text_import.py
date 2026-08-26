import unittest
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

from server.main import (
    ImportRecipeTextRequest,
    RECIPE_TEXT_MAX_CHARS,
    import_recipe_text,
    parse_recipe_text,
)

CASE_PATH = Path(__file__).resolve().parents[1] / "case.txt"
CASE2_PATH = Path(__file__).resolve().parents[1] / "case2.txt"


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
        self.assertEqual("Yield: 1 (9-inch) pie", draft.description)
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
        self.assertEqual(1, draft.servings)
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
        with self.assertRaisesRegex(ValueError, "enough recipe information"):
            parse_recipe_text("This is only an unstructured paragraph.")

        with self.assertRaises(HTTPException) as error:
            import_recipe_text(
                ImportRecipeTextRequest(text="This is only an unstructured paragraph."),
                object(),
            )
        self.assertEqual(422, error.exception.status_code)


if __name__ == "__main__":
    unittest.main()
