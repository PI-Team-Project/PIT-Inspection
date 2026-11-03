// Every Usage Data table draws a line around each cell. `border-hidden` on
// the table drops the cells' outer edges, so the rounded wrapper's own
// border is the only one on the outside.
export const TABLE_WRAP = "overflow-hidden rounded-md border border-gray-200"
export const TABLE = "w-full table-fixed border-collapse border-hidden text-[13px]"
// The first column (Type / Vehicle / Location) is the same width in every
// table, so the columns line up from one section to the next; the rest
// share what is left equally.
export const FIRST_COL = "w-[30%] sm:w-[24%]"
export const TH =
  "border border-gray-200 bg-gray-50 px-1.5 py-1.5 align-middle text-[11px] leading-tight font-semibold text-gray-500"
export const TD = "border border-gray-200 px-2 py-1.5 align-middle"

export const pct = (rate: number) => `${Math.round(rate * 100)}%`

export function Bar({ rate }: { rate: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-gray-100">
      <span className="block h-full rounded-full bg-brand" style={{ width: pct(rate) }} />
    </span>
  )
}

export function UsageCell({ rate }: { rate: number }) {
  return (
    <>
      <span className="block text-center tabular-nums text-gray-900">{pct(rate)}</span>
      <span className="mt-1 block">
        <Bar rate={rate} />
      </span>
    </>
  )
}
