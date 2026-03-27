/-
  SolShort — Formal Verification of Core Mathematical Properties
  Using Mathlib for real number arithmetic.

  Key theorems:
  1. AM-GM for holging: x + 1/x ≥ 2 for x > 0
  2. P&L non-negativity: (x + 1/x)/2 - 1 ≥ 0
  3. P&L formula: (x + 1/x)/2 - 1 = (x-1)²/(2x)
  4. Pricing invariant: k/P₀ = P₀ when k = P₀²
  5. Positive gamma: 1/x³ > 0 for x > 0
-/

import Mathlib.Analysis.SpecialFunctions.Pow.Real
import Mathlib.Tactic

-- Theorem 1: Pricing invariant
-- At initialization k = P₀², shortSOL_price = k/P₀ = P₀
theorem pricing_invariant (p0 : ℝ) (hp0 : p0 > 0) :
    p0 ^ 2 / p0 = p0 := by
  field_simp

-- Theorem 2: P&L formula equivalence
-- (x + 1/x)/2 - 1 = (x - 1)² / (2x)
theorem pnl_formula (x : ℝ) (hx : x > 0) :
    (x + 1 / x) / 2 - 1 = (x - 1) ^ 2 / (2 * x) := by
  field_simp
  ring

-- Theorem 3: P&L is non-negative (core holging guarantee)
-- (x - 1)² / (2x) ≥ 0 for x > 0
theorem pnl_nonneg (x : ℝ) (hx : x > 0) :
    (x - 1) ^ 2 / (2 * x) ≥ 0 := by
  apply div_nonneg
  · exact sq_nonneg _
  · linarith

-- Theorem 4: AM-GM for holging
-- x + 1/x ≥ 2 for x > 0
theorem am_gm_holging (x : ℝ) (hx : x > 0) : x + 1 / x ≥ 2 := by
  have h := pnl_formula x hx
  have h2 := pnl_nonneg x hx
  linarith

-- Theorem 5: Holging portfolio value ≥ 1
-- V(x) = (x + 1/x)/2 ≥ 1
theorem holging_value_ge_one (x : ℝ) (hx : x > 0) :
    (x + 1 / x) / 2 ≥ 1 := by
  have h := am_gm_holging x hx
  linarith

-- Theorem 6: P&L equals zero only at x = 1 (market neutral)
theorem pnl_zero_iff (x : ℝ) (hx : x > 0) :
    (x - 1) ^ 2 / (2 * x) = 0 ↔ x = 1 := by
  constructor
  · intro h
    have h2x : 2 * x > 0 := by linarith
    rw [div_eq_zero_iff] at h
    cases h with
    | inl h =>
      have := sq_eq_zero_iff.mp h
      linarith
    | inr h => linarith
  · intro h
    subst h
    simp

-- Theorem 7: Positive gamma (convexity)
-- 1/x³ > 0 for x > 0
theorem positive_gamma (x : ℝ) (hx : x > 0) :
    1 / x ^ 3 > 0 := by
  positivity

-- Theorem 8: Inverse relationship
-- shortSOL price moves inversely to SOL price
theorem inverse_price (k p : ℝ) (hp : p > 0) (hk : k > 0) :
    k / (2 * p) < k / p := by
  apply div_lt_div_of_pos_left hk (by linarith) (by linarith)

-- Summary check
#check pricing_invariant
#check pnl_formula
#check pnl_nonneg
#check am_gm_holging
#check holging_value_ge_one
#check pnl_zero_iff
#check positive_gamma
#check inverse_price
