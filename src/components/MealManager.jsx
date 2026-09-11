import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { supabase } from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import CategorySelect from './CategorySelect';
import { useToast } from './ToastProvider';
import { guessCategory } from '../categories';
import { useCategories } from '../useCategories';
import { useStores } from '../useStores';
import {
  resolveGroceryItems,
  groceryKey,
  fetchCatalogue,
  syncGroceryItemStores,
} from '../groceryItems';
import IngredientInput from './IngredientInput';
import StoreSelect from './StoreSelect';
import ModalHeader from './ModalHeader';
import { shouldFlipMenu } from '../menuPlacement';
import './MealManager.css';

const emptyIngredient = () => ({
  name: '',
  category: '',
  stores: [],
  storesTouched: false,
});

// Alphabetical for the picker; the shopping list keeps its aisle order.
export default function MealManager({
  meals,
  onMealAdded,
  onShoppingChanged,
  shoppingMealIds,
  setShoppingMealIds,
  refreshKey = 0,
}) {
  const { options: CATEGORY_OPTIONS, reload: reloadCategories } = useCategories();
  const { stores: storeOptions, reload: reloadStores } = useStores();

  // The meals themselves are refetched by App; this picks up the catalogue,
  // categories and stores behind the ingredient pickers.
  useEffect(() => {
    if (!refreshKey) return;
    reloadCategories();
    reloadStores();
    fetchCatalogue()
      .then(setCatalogue)
      .catch((error) =>
        console.error('Error refreshing the grocery catalogue:', error)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  const toast = useToast();
  const [mealName, setMealName] = useState('');
  const [ingredients, setIngredients] = useState([emptyIngredient()]);
  const [saving, setSaving] = useState(false);
  const [editingMealId, setEditingMealId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [formError, setFormError] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuUp, setMenuUp] = useState(false);
  const [catalogue, setCatalogue] = useState([]);

  const isEditing = editingMealId !== null;
  const pendingDeleteMeal = meals.find((m) => m.id === pendingDeleteId);
  // Count against the meals we actually render, so a stale id can't push the
  // total past the number of cards on screen.
  const addedCount = meals.filter((m) => shoppingMealIds.includes(m.id)).length;

  const addMealToList = async (meal) => {
    if (meal.ingredients.length === 0) {
      toast('This meal has no ingredients to add.', 'error');
      return;
    }
    // Update the UI immediately so the button rolls right away.
    setShoppingMealIds((prev) => [...new Set([...prev, meal.id])]);
    try {
      const items = meal.ingredients.map((ing) => ({
        meal_id: meal.id,
        ingredient_id: ing.id,
        is_checked: false,
      }));

      const { error } = await supabase
        .from('shopping_list_items')
        .insert(items);

      if (error) throw error;
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error adding meal to shopping list:', error);
      toast('Failed to add meal to the shopping list. Try again!', 'error');
      setShoppingMealIds((prev) => prev.filter((id) => id !== meal.id));
    }
  };

  const removeMealFromList = async (meal) => {
    // Update the UI immediately so the button rolls right away.
    setShoppingMealIds((prev) => prev.filter((id) => id !== meal.id));
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('meal_id', meal.id);

      if (error) throw error;
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error removing meal from shopping list:', error);
      toast('Failed to remove meal from the shopping list. Try again!', 'error');
      setShoppingMealIds((prev) => [...new Set([...prev, meal.id])]);
    }
  };

  // Takes every meal off the shopping list in one go. Hand-added items aren't
  // tied to a meal, so they're left alone.
  const clearMealsFromList = async () => {
    const idsToClear = meals
      .filter((m) => shoppingMealIds.includes(m.id))
      .map((m) => m.id);
    if (idsToClear.length === 0) return;

    setShoppingMealIds((prev) => prev.filter((id) => !idsToClear.includes(id)));

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('meal_id', idsToClear);

      if (error) throw error;
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error clearing meals from shopping list:', error);
      toast('Failed to clear the shopping list. Try again!', 'error');
      setShoppingMealIds((prev) => [...new Set([...prev, ...idsToClear])]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchCatalogue();
        if (!cancelled) setCatalogue(items);
      } catch (catalogueError) {
        console.error('Error loading the grocery catalogue:', catalogueError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on Escape and lock background scroll while the modal is open.
  useEffect(() => {
    if (!showModal) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [showModal]);

  // Close the open card menu on any outside click or Escape.
  useEffect(() => {
    if (openMenuId === null) return;

    const onDocClick = () => setOpenMenuId(null);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  // The meals list clips its own overflow, so a menu near the bottom of it
  // (or of the viewport) opens upward instead.
  const toggleMenu = (mealId, button) => {
    if (openMenuId === mealId) {
      setOpenMenuId(null);
      return;
    }
    // Nothing clips the menus now, so the window is the only bound.
    setMenuUp(shouldFlipMenu(button, null));
    setOpenMenuId(mealId);
  };

  const addIngredientField = () => {
    setIngredients([...ingredients, emptyIngredient()]);
  };

  const removeIngredientField = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredientName = (index, name) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, name } : ing))
    );
  };

  const updateIngredientCategory = (index, category) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, category } : ing))
    );
  };

  const catalogueByKey = new Map(catalogue.map((item) => [item.name_key, item]));

  const catalogueFor = (name) => catalogueByKey.get(groceryKey(name));

  // Until the user touches the row, show whatever stores the catalogue
  // already has for that name — otherwise an untouched row would look empty
  // and saving would appear to clear stores it never meant to change.
  const storesFor = (ingredient) =>
    ingredient.storesTouched
      ? ingredient.stores
      : catalogueFor(ingredient.name)?.stores ?? [];

  // An existing item keeps its own category; guessing is only for new names.
  const categoryFor = (ingredient) =>
    ingredient.category ||
    catalogueFor(ingredient.name)?.category ||
    guessCategory(ingredient.name);

  const pickIngredient = (index, item) => {
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === index
          ? { ...ing, name: item.name, category: '', storesTouched: false }
          : ing
      )
    );
  };

  // Each store toggles on its own; an ingredient can come from several.
  const toggleIngredientStore = (index, storeName) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const current = storesFor(ing);
        return {
          ...ing,
          storesTouched: true,
          stores: current.includes(storeName)
            ? current.filter((name) => name !== storeName)
            : [...current, storeName],
        };
      })
    );
  };

  const resetForm = () => {
    setMealName('');
    setIngredients([emptyIngredient()]);
    setEditingMealId(null);
    setFormError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const startEditing = (meal) => {
    setEditingMealId(meal.id);
    setMealName(meal.name);
    setIngredients(
      meal.ingredients.length > 0
        ? meal.ingredients.map((ing) => ({
            name: ing.name,
            category: ing.category || '',
            stores: [],
            storesTouched: false,
          }))
        : [emptyIngredient()]
    );
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    resetForm();
  };

  const saveMeal = async (e) => {
    e.preventDefault();
    if (!mealName.trim() || ingredients.every(ing => !ing.name.trim())) {
      setFormError('Please enter a meal name and at least one ingredient.');
      return;
    }
    setFormError('');

    setSaving(true);
    try {
      const ingredientRows = ingredients
        .map((ing) => ({
          name: ing.name.trim(),
          category: categoryFor(ing),
        }))
        .filter((ing) => ing.name);

      // Point each ingredient at the shared catalogue, creating entries for
      // names that haven't been used before.
      const catalogue = await resolveGroceryItems(ingredientRows);
      const withItemId = ingredientRows.map((row) => ({
        ...row,
        grocery_item_id: catalogue.get(groceryKey(row.name)),
      }));

      // Only rows the user actually edited are synced, so saving a meal never
      // silently rewrites the stores of ingredients it merely mentions.
      const storeEdits = ingredients
        .filter((ing) => ing.storesTouched && ing.name.trim())
        .map((ing) => ({
          itemId: catalogue.get(groceryKey(ing.name)),
          storeIds: ing.stores
            .map((name) => storeOptions.find((s) => s.name === name)?.id)
            .filter(Boolean),
        }))
        .filter((edit) => edit.itemId);

      if (isEditing) {
        // Update the meal name.
        const { error: mealError } = await supabase
          .from('meals')
          .update({ name: mealName.trim() })
          .eq('id', editingMealId);

        if (mealError) throw mealError;

        // Replace the ingredient list: clear the old rows, insert the current ones.
        const { error: deleteError } = await supabase
          .from('ingredients')
          .delete()
          .eq('meal_id', editingMealId);

        if (deleteError) throw deleteError;

        const { error: ingError } = await supabase
          .from('ingredients')
          .insert(
            withItemId.map((row) => ({ meal_id: editingMealId, ...row }))
          );

        if (ingError) throw ingError;
      } else {
        // Create meal
        const { data: mealData, error: mealError } = await supabase
          .from('meals')
          .insert({ name: mealName.trim() })
          .select()
          .single();

        if (mealError) throw mealError;

        // Add ingredients
        const { error: ingError } = await supabase
          .from('ingredients')
          .insert(
            withItemId.map((row) => ({ meal_id: mealData.id, ...row }))
          );

        if (ingError) throw ingError;
      }

      for (const edit of storeEdits) {
        await syncGroceryItemStores(edit.itemId, edit.storeIds);
      }

      if (storeEdits.length > 0) {
        try {
          setCatalogue(await fetchCatalogue());
        } catch (refreshError) {
          console.error('Error refreshing item stores:', refreshError);
        }
      }

      resetForm();
      setShowModal(false);
      onMealAdded();
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error saving meal:', error);
      toast('Failed to save meal. Try again!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteMeal = async (mealId) => {
    try {
      const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', mealId);

      if (error) throw error;
      // If we were editing the meal that just got deleted, close the modal.
      if (editingMealId === mealId) {
        setShowModal(false);
        resetForm();
      }
      onMealAdded();
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error deleting meal:', error);
      toast('Failed to delete meal. Try again!', 'error');
    }
  };

  // FLIP: remember where every card was, then after the re-render slide it
  // from there to wherever it landed. Positions are in document space so a
  // scroll between renders doesn't read as movement.
  const cardNodes = useRef(new Map());
  const cardPositions = useRef(new Map());
  const lastLayout = useRef(null);

  useLayoutEffect(() => {
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    // Only a change in which meals sit where is worth animating. Re-renders
    // from anything else (opening a row menu, say) would otherwise animate
    // the sub-pixel drift between measurements.
    const layout = `${meals.map((m) => m.id).join(',')}|${[...shoppingMealIds]
      .sort()
      .join(',')}`;
    const moved = lastLayout.current !== null && lastLayout.current !== layout;
    lastLayout.current = layout;

    for (const [id, node] of cardNodes.current) {
      const rect = node.getBoundingClientRect();
      const next = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
      };
      const prev = cardPositions.current.get(id);
      cardPositions.current.set(id, next);

      if (!prev || !moved || reduced) continue;

      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      // Sub-pixel shifts are reflow noise, not a move worth animating.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'none' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    // Drop meals that are no longer rendered so the maps don't grow forever.
    for (const id of cardPositions.current.keys()) {
      if (!cardNodes.current.has(id)) cardPositions.current.delete(id);
    }
  });

  const setCardNode = (mealId) => (node) => {
    if (node) cardNodes.current.set(mealId, node);
    else cardNodes.current.delete(mealId);
  };

  // Meals on the shopping list move up into the progress card, so the list
  // below is what's still to choose from.
  const addedMeals = meals.filter((meal) => shoppingMealIds.includes(meal.id));
  const remainingMeals = meals.filter(
    (meal) => !shoppingMealIds.includes(meal.id)
  );

  const renderMealCard = (meal) => (
              <div
                key={meal.id}
                ref={setCardNode(meal.id)}
                className={`meal-card${
                  shoppingMealIds.includes(meal.id) ? ' in-list' : ''
                }${editingMealId === meal.id ? ' editing' : ''}`}
                onClick={() => startEditing(meal)}
              >
                <button
                  className={`btn-shop${
                    shoppingMealIds.includes(meal.id) ? ' in-list' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (shoppingMealIds.includes(meal.id)) {
                      removeMealFromList(meal);
                    } else {
                      addMealToList(meal);
                    }
                  }}
                  aria-label={
                    shoppingMealIds.includes(meal.id)
                      ? 'In shopping list'
                      : 'Add to shopping list'
                  }
                >
                  <svg
                    className="btn-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                </button>
                <div className="meal-card-info">
                  <h3>{meal.name}</h3>
                </div>
                <div
                  className="meal-card-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn-more"
                    aria-label="More options"
                    aria-haspopup="true"
                    aria-expanded={openMenuId === meal.id}
                    onClick={(e) => toggleMenu(meal.id, e.currentTarget)}
                  >
                    ⋮
                  </button>
                  {openMenuId === meal.id && (
                    <div
                      className={`dropdown-menu${menuUp ? ' up' : ''}`}
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-item"
                        onClick={() => {
                          setOpenMenuId(null);
                          startEditing(meal);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-item danger"
                        onClick={() => {
                          setOpenMenuId(null);
                          setPendingDeleteId(meal.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
  );

  return (
    <div className="meal-manager">
      <section className="meals-list-section">
        <div className="page-header meals-list-header">
          <h2>Your Meals</h2>
          <button
            type="button"
            className="btn-create-meal"
            onClick={openCreateModal}
            aria-label="Create Meal"
          >
            <span className="create-plus" aria-hidden="true">+</span>
            <span className="btn-create-label">Create Meal</span>
          </button>
        </div>

        <div className="page-content">
          {meals.length === 0 ? (
            <p className="empty-state">
              No meals yet! Click "Create Meal" to get started.
            </p>
          ) : (
            <>
              <div className="meals-progress">
                <div className="meals-progress-head">
                <svg
                  className="meals-progress-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                <p className="meals-progress-text">
                  {addedCount} {addedCount === 1 ? 'meal' : 'meals'} in shopping
                  list
                </p>
                <button
                  type="button"
                  className="btn-clear-meals"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={addedCount === 0}
                >
                  Clear List
                </button>
                </div>

                {addedMeals.length > 0 && (
                  <div className="meals-grid">
                    {addedMeals.map(renderMealCard)}
                  </div>
                )}
              </div>

              <p className="meals-count">
                Showing {remainingMeals.length}{' '}
                {remainingMeals.length === 1 ? 'meal' : 'meals'}
              </p>
              {remainingMeals.length > 0 ? (
                <div className="meals-grid">
                  {remainingMeals.map(renderMealCard)}
                </div>
              ) : (
                <p className="meals-all-added">
                  Every meal is in your shopping list.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={isEditing ? 'Edit Meal' : 'Create a New Meal'}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHeader
              title={isEditing ? 'Edit Meal' : 'Create a New Meal'}
              onClose={closeModal}
            />

            <form onSubmit={saveMeal} className="meal-form">
              <div className="modal-body">
              <div className="form-group">
                <label htmlFor="mealName">Meal Name</label>
                <input
                  id="mealName"
                  type="text"
                  placeholder="e.g., Spaghetti Carbonara"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  /* Focus an empty field on create; leave an existing name
                     alone so opening a meal doesn't put it in edit-ready
                     state. */
                  autoFocus={!isEditing}
                />
              </div>

              <div className="form-group">
                <label>Ingredients</label>
                {/* Column headings; each control carries its own aria-label. */}
                <div className="ingredient-row ingredient-head" aria-hidden="true">
                  <span>Name</span>
                  <span>Category</span>
                  <span>Store</span>
                  <span />
                </div>
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="ingredient-row">
                    <IngredientInput
                      label={`Ingredient ${index + 1} name`}
                      value={ingredient.name}
                      catalogue={catalogue}
                      onChange={(name) => updateIngredientName(index, name)}
                      onPick={(item) => pickIngredient(index, item)}
                    />
                    <CategorySelect
                      label={`Category for ingredient ${index + 1}`}
                      value={categoryFor(ingredient)}
                      options={CATEGORY_OPTIONS}
                      onChange={(cat) => updateIngredientCategory(index, cat)}
                    />
                    <StoreSelect
                      label={`Stores for ingredient ${index + 1}`}
                      values={storesFor(ingredient)}
                      options={storeOptions}
                      onToggle={(store) => toggleIngredientStore(index, store)}
                    />
                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeIngredientField(index)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn-add-ingredient"
                onClick={addIngredientField}
              >
                + Add Ingredient
              </button>

              {formError && <p className="form-error">{formError}</p>}
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save-meal"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : isEditing
                    ? 'Update Meal'
                    : 'Save Meal'}
                </button>
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDeleteId !== null}
        title="Delete meal?"
        message={
          pendingDeleteMeal
            ? `Deleting "${pendingDeleteMeal.name}" will also remove its ingredients. This can't be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          deleteMeal(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

      <ConfirmModal
        open={showClearConfirm}
        title="Clear shopping list?"
        message={`This takes ${
          addedCount === 1 ? 'that meal' : `all ${addedCount} meals`
        } off your shopping list. Items you added by hand stay put.`}
        confirmLabel="Clear List"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          clearMealsFromList();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
