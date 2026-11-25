import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Dataset } from '../db/types'

/** Live view of the whole database, including tombstones. */
export function useDataset(): Dataset | undefined {
  return useLiveQuery(async () => {
    const [trips, vehicleTypes, vehicleUnits, people] = await Promise.all([
      db.trips.toArray(),
      db.vehicleTypes.toArray(),
      db.vehicleUnits.toArray(),
      db.people.toArray(),
    ])
    return { trips, vehicleTypes, vehicleUnits, people }
  })
}
