/**
 * Equipment + locations repository (BUILD_PLAN M1). Drives the (client-side)
 * plate calculator; no plate solutions are stored. Exactly-one-default is
 * enforced atomically by the `set_default_location` / `set_default_barbell` RPCs.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { Barbell, Dumbbell, EquipmentPreferences, Location, PlateInventory } from '../types'

export const equipmentRepo = {
  // ── Locations ──────────────────────────────────────────────────────────────
  listLocations(): Promise<Location[]> {
    return onlineDataClient.list<Location>('locations', {
      filters: [{ column: 'is_archived', op: 'eq', value: false }],
      order: [{ column: 'sort_order' }, { column: 'created_at' }],
    })
  },

  async createLocation(name: string, isDefault = false): Promise<Location> {
    const rows = await onlineDataClient.insert<Location>('locations', { name, is_default: isDefault })
    const row = rows[0]
    if (!row) throw new Error('Location insert returned no row')
    return row
  },

  updateLocation(id: string, patch: Partial<Location>): Promise<Location[]> {
    return onlineDataClient.update<Location>('locations', patch, [{ column: 'id', op: 'eq', value: id }])
  },

  setDefaultLocation(locationId: string): Promise<void> {
    return onlineDataClient.rpc<void>('set_default_location', { p_location_id: locationId })
  },

  // ── Barbells ───────────────────────────────────────────────────────────────
  listBarbells(locationId: string): Promise<Barbell[]> {
    return onlineDataClient.list<Barbell>('barbells', {
      filters: [
        { column: 'location_id', op: 'eq', value: locationId },
        { column: 'is_archived', op: 'eq', value: false },
      ],
      order: [{ column: 'sort_order' }, { column: 'weight_lb' }],
    })
  },

  async createBarbell(
    locationId: string,
    name: string,
    weightLb: number,
    isDefault = false,
  ): Promise<Barbell> {
    const rows = await onlineDataClient.insert<Barbell>('barbells', {
      location_id: locationId,
      name,
      weight_lb: weightLb,
      is_default: isDefault,
    })
    const row = rows[0]
    if (!row) throw new Error('Barbell insert returned no row')
    return row
  },

  setDefaultBarbell(barbellId: string): Promise<void> {
    return onlineDataClient.rpc<void>('set_default_barbell', { p_barbell_id: barbellId })
  },

  // ── Plate inventory ──────────────────────────────────────────────────────────
  listPlates(locationId: string): Promise<PlateInventory[]> {
    return onlineDataClient.list<PlateInventory>('plate_inventory', {
      filters: [{ column: 'location_id', op: 'eq', value: locationId }],
      order: [{ column: 'denomination_lb', ascending: false }],
    })
  },

  /** Upsert a plate denomination's individual quantity (one row per denom/loc). */
  upsertPlate(locationId: string, denominationLb: number, quantity: number): Promise<PlateInventory[]> {
    return onlineDataClient.upsert<PlateInventory>(
      'plate_inventory',
      { location_id: locationId, denomination_lb: denominationLb, quantity },
      'location_id,denomination_lb',
    )
  },

  // ── Dumbbells ────────────────────────────────────────────────────────────────
  listDumbbells(locationId: string): Promise<Dumbbell[]> {
    return onlineDataClient.list<Dumbbell>('dumbbells', {
      filters: [{ column: 'location_id', op: 'eq', value: locationId }],
      order: [{ column: 'weight_lb' }],
    })
  },

  upsertDumbbell(
    locationId: string,
    weightLb: number,
    quantity: number,
    isAdjustable = false,
  ): Promise<Dumbbell[]> {
    return onlineDataClient.upsert<Dumbbell>(
      'dumbbells',
      { location_id: locationId, weight_lb: weightLb, quantity, is_adjustable: isAdjustable },
      'location_id,weight_lb',
    )
  },

  // ── Preferences ──────────────────────────────────────────────────────────────
  getPreferences(userId: string): Promise<EquipmentPreferences | null> {
    return onlineDataClient.getOne<EquipmentPreferences>('equipment_preferences', [
      { column: 'user_id', op: 'eq', value: userId },
    ])
  },

  upsertPreferences(patch: Partial<EquipmentPreferences>): Promise<EquipmentPreferences[]> {
    return onlineDataClient.upsert<EquipmentPreferences>('equipment_preferences', patch, 'user_id')
  },
}
