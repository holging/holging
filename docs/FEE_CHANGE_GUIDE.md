# Как изменить комиссии Holging

## Где что менять (4 файла)

### 1. Смарт-контракт (ЭТАЛОН)

**Файл:** `programs/holging/src/fees.rs`

```rust
let fee = if ratio_bps > 20_000 {
    // > 200% — vault very healthy
    (base_fee_bps as u64) * 5          // ← множитель 1
} else if ratio_bps > 15_000 {
    // 150-200% — normal
    (base_fee_bps as u64) * 10         // ← множитель 2
} else if ratio_bps > 10_000 {
    // 100-150% — elevated
    (base_fee_bps as u64) * 15         // ← множитель 3
} else {
    // < 100% — critical
    (base_fee_bps as u64) * 20         // ← множитель 4
};
```

### 2. Фронтенд

**Файл:** `app/src/utils/math.ts`

```typescript
if (ratio > 20_000) {
  fee = baseFee.toNumber() * 5;        // ← множитель 1
} else if (ratio > 15_000) {
  fee = baseFee.toNumber() * 10;       // ← множитель 2
} else if (ratio > 10_000) {
  fee = baseFee.toNumber() * 15;       // ← множитель 3
} else {
  fee = baseFee.toNumber() * 20;       // ← множитель 4
}
```

### 3. API сервер

**Файл:** `mcp-server/src/utils.ts`

```typescript
if (ratio > 20_000) {
  fee = baseFee.toNumber() * 5;        // ← множитель 1
} else if (ratio > 15_000) {
  fee = baseFee.toNumber() * 10;       // ← множитель 2
} else if (ratio > 10_000) {
  fee = baseFee.toNumber() * 15;       // ← множитель 3
} else {
  fee = baseFee.toNumber() * 20;       // ← множитель 4
}
```

### 4. Тест

**Файл:** `tests/holging.ts` — найти `"dynamic fee multipliers match code spec"`

```typescript
// > 200%: ×5 → 20 bps
assert.equal(baseFee * 5, 20);         // ← множитель 1

// 150-200%: ×10 → 40 bps
assert.equal(baseFee * 10, 40);        // ← множитель 2

// 100-150%: ×15 → 60 bps
assert.equal(baseFee * 15, 60);        // ← множитель 3

// < 100%: ×20 → 80 bps
assert.equal(baseFee * 20, 80);        // ← множитель 4
```

---

## Base fee (отдельно)

Если нужно изменить base fee (сейчас 4 bps):

**Файл:** `programs/holging/src/constants.rs`
```rust
pub const DEFAULT_FEE_BPS: u16 = 4;   // ← base fee
```

Или on-chain через `update_fee` instruction (без редеплоя):
```bash
# Через скрипт или фронтенд (admin only)
update_fee(pool_id, new_fee_bps)       // max 100 bps
```

---

## Пороги vault ratio (отдельно)

Если нужно изменить пороги (200%, 150%, 100%):

Все 3 файла — заменить числа `20_000`, `15_000`, `10_000`:
- `20_000` = 200%
- `15_000` = 150%
- `10_000` = 100%

---

## Билд + деплой после изменения

```bash
# 1. Смарт-контракт
cd ~/Projects/holging && anchor build

# 2. Синхронизировать IDL
cp target/idl/holging.json app/src/idl/holging.json
cp target/idl/holging.json mcp-server/idl/holging.json

# 3. Фронтенд
cd app && npm run build

# 4. API сервер
cd ../mcp-server && npm run build

# 5. Тесты
cd .. && anchor test

# 6. Деплой фронтенд
rsync -avz --delete app/dist/ root@VPS_IP:/var/www/holging/

# 7. Деплой API
scp mcp-server/dist/utils.js root@VPS_IP:/var/www/holging-mcp/mcp-server/dist/
ssh root@VPS_IP "systemctl restart holging-api"

# 8. Проверка
curl -s https://api.holging.com/pool/sol | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'Fee: {d[\"dynamicFeeBps\"]} bps | Coverage: {d[\"coverage\"]}')"
```

---

## Текущие значения (март 2026)

| Vault Ratio | Множитель | Fee (base=4) | Roundtrip |
|-------------|-----------|-------------|-----------|
| >200% | ×5 | 20 bps (0.20%) | 0.40% |
| 150-200% | ×10 | 40 bps (0.40%) | 0.80% |
| 100-150% | ×15 | 60 bps (0.60%) | 1.20% |
| <100% | ×20 | 80 bps (0.80%) | 1.60% |

Clamp: max 100 bps (1%). Base fee: 4 bps. Max via `update_fee`: 100 bps.
