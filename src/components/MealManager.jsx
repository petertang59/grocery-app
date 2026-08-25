import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';
import { CATEGORIES, guessCategory } from '../categories';
import './MealManager.css';

const emptyIngredient = () => ({ name: '', category: '' });

export default function MealManager({ meals, onMealAdded, onShoppingChanged }) {
  const toast = useToast();
  const [mealName, setMealName] = useState('');
  const [ingredients, setIngredients] = useState([emptyIngredient()]);
  const [saving, setSaving] = useState(false);
  const [editingMealId, setEditingMealId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [shoppingMealIds, setShoppingMealIds] = useState([]);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [formError, setFormError] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  const isEditing = editingMealId !== null;
  const pendingDeleteMeal = meals.find((m) => m.id === pendingDeleteId);

  // Track which meals already have their ingredients on the shopping list,
  // and keep it in sync across devices.
  useEffect(() => {
    loadShoppingMealIds();

    const subscription = supabase
      .channel('meal_shopping_status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items' },
        () => loadShoppingMealIds()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadShoppingMealIds = async () => {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('meal_id');

    if (error) {
      console.error('Error loading shopping status:', error);
      return;
    }
    setShoppingMealIds([...new Set((data || []).map((row) => row.meal_id))]);
  };

  const addMealToList = async (meal) => {
    if (meal.ingredients.length === 0) {
      toast('This meal has no ingredients to add.', 'error');
      return;
    }
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
      setShoppingMealIds((prev) => [...new Set([...prev, meal.id])]);
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error adding meal to shopping list:', error);
      toast('Failed to add meal to the shopping list. Try again!', 'error');
    }
  };

  const removeMealFromList = async (meal) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('meal_id', meal.id);

      if (error) throw error;
      setShoppingMealIds((prev) => prev.filter((id) => id !== meal.id));
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error removing meal from shopping list:', error);
      toast('Failed to remove meal from the shopping list. Try again!', 'error');
    }
  };

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
        .map(ing => ({
          name: ing.name.trim(),
          category: ing.category || guessCategory(ing.name),
        }))
        .filter(ing => ing.name);

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
            ingredientRows.map((row) => ({ meal_id: editingMealId, ...row }))
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
            ingredientRows.map((row) => ({ meal_id: mealData.id, ...row }))
          );

        if (ingError) throw ingError;
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

  return (
    <div className="meal-manager">
      <section className="meals-list-section">
        <div className="meals-list-header">
          <h2>Your Meals ({meals.length})</h2>
          <button
            type="button"
            className="btn-create-meal"
            onClick={openCreateModal}
          >
            + Create Meal
          </button>
        </div>
        {meals.length === 0 ? (
          <p className="empty-state">
            No meals yet! Click "Create Meal" to get started.
          </p>
        ) : (
          <div className="meals-grid">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className={`meal-card${editingMealId === meal.id ? ' editing' : ''}`}
              >
                <h3>{meal.name}</h3>
                <p className="ingredient-count">
                  {meal.ingredients.length}{' '}
                  {meal.ingredients.length === 1 ? 'ingredient' : 'ingredients'}
                </p>
                {shoppingMealIds.includes(meal.id) ? (
                  <button
                    className="btn-in-list"
                    onClick={() => removeMealFromList(meal)}
                  >
                    ✓ In Shopping List
                  </button>
                ) : (
                  <button
                    className="btn-add-to-list"
                    onClick={() => addMealToList(meal)}
                  >
                    + Add to Shopping List
                  </button>
                )}
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
                    onClick={() =>
                      setOpenMenuId(openMenuId === meal.id ? null : meal.id)
                    }
                  >
                    ⋮
                  </button>
                  {openMenuId === meal.id && (
                    <div className="dropdown-menu" role="menu">
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
            ))}
          </div>
        )}
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
            <div className="modal-header">
              <h2>{isEditing ? 'Edit Meal' : 'Create a New Meal'}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveMeal} className="meal-form">
              <div className="form-group">
                <label htmlFor="mealName">Meal Name</label>
                <input
                  id="mealName"
                  type="text"
                  placeholder="e.g., Spaghetti Carbonara"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Ingredients</label>
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="ingredient-row">
                    <input
                      type="text"
                      placeholder="e.g., Eggs"
                      value={ingredient.name}
                      onChange={(e) =>
                        updateIngredientName(index, e.target.value)
                      }
                    />
                    <select
                      className="category-select"
                      value={ingredient.category || guessCategory(ingredient.name)}
                      onChange={(e) =>
                        updateIngredientCategory(index, e.target.value)
                      }
                      aria-label="Category"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
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
    </div>
  );
}
