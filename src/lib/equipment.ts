export type Equipment = {
  number: number
  label: string
  serial: string
}

// `number` is the warehouse asset number — meant to be physically tagged on
// the equipment so inspectors and supervisors can identify a unit without
// reading its serial plate. Serial is kept as the internal/DB identifier.
export const EQUIPMENT_LIST: Equipment[] = [
  { number: 1, label: "EKKO Lift", serial: "EK2403K07117/702402017387" },
  { number: 2, label: "Big Joe Walkie Stacker", serial: "3321600820" },
  { number: 3, label: "Jungheinrich", serial: "91685520" },
  { number: 4, label: "Mitsubishi Electric Pallet Jack", serial: "98452971" },
  { number: 5, label: "Mitsubishi Electric Pallet Jack", serial: "98452973" },
  { number: 6, label: "Mitsubishi Electric Pallet Jack", serial: "98484561" },
  { number: 7, label: "Mitsubishi Electric Pallet Jack", serial: "98484560" },
]
