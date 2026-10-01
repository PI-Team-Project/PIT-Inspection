"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import {
  addSupervisor,
  removeSupervisor,
  renameSupervisor,
  type SupervisorListState,
} from "./actions"
import { MAX_SUPERVISOR_NAME_LENGTH } from "@/lib/supervisors"

const inputClass = "min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
const linkButton = "shrink-0 py-1 text-xs font-semibold disabled:opacity-50"

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white active:scale-95 active:bg-brand-dark disabled:opacity-50"
    >
      Add
    </button>
  )
}

function SupervisorRow({ name, last }: { name: string; last: boolean }) {
  const [editing, setEditing] = useState(false)
  const [renameState, renameAction, renaming] = useActionState<SupervisorListState, FormData>(
    async (prev, formData) => {
      const result = await renameSupervisor(prev, formData)
      if (!result.error) setEditing(false)
      return result
    },
    { error: null }
  )
  const [removing, setRemoving] = useState(false)

  return (
    <div className={`px-3 py-2 ${last ? "" : "border-b border-gray-100"}`}>
      {editing ? (
        <form action={renameAction} className="flex items-center gap-2">
          <input type="hidden" name="from" value={name} />
          <input
            name="to"
            defaultValue={name}
            maxLength={MAX_SUPERVISOR_NAME_LENGTH}
            required
            autoFocus
            aria-label={`New name for ${name}`}
            className={inputClass}
          />
          <button type="submit" disabled={renaming} className={`${linkButton} text-gray-900`}>
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className={`${linkButton} text-gray-500`}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm text-gray-900">{name}</span>
          <span className="flex shrink-0 gap-3">
            <button type="button" onClick={() => setEditing(true)} className={`${linkButton} text-gray-700`}>
              Rename
            </button>
            <form
              action={async (formData) => {
                setRemoving(true)
                await removeSupervisor(formData)
              }}
            >
              <input type="hidden" name="name" value={name} />
              <button type="submit" disabled={removing} className={`${linkButton} text-red-700`}>
                Remove
              </button>
            </form>
          </span>
        </div>
      )}
      {editing && renameState.error && (
        <p className="mt-1 text-xs font-medium text-red-600">{renameState.error}</p>
      )}
    </div>
  )
}

// Settings → Supervisors: the names every Supervisor Signature picker offers.
export default function SupervisorSettings({ supervisors }: { supervisors: string[] }) {
  const [addState, addAction] = useActionState<SupervisorListState, FormData>(addSupervisor, {
    error: null,
  })

  return (
    <section>
      <p className="text-sm font-semibold text-gray-800">Supervisors</p>
      <p className="mt-0.5 text-xs text-gray-500">Names available in Supervisor Signature.</p>
      <div className="mt-2 rounded-lg border border-gray-200">
        {supervisors.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500">No names yet.</p>
        ) : (
          supervisors.map((name, i) => (
            <SupervisorRow key={name} name={name} last={i === supervisors.length - 1} />
          ))
        )}
      </div>
      {/* Keyed on the last successful add, so the field clears after one. */}
      <form key={addState.nonce ?? 0} action={addAction} className="mt-2 flex gap-2">
        <input
          name="name"
          maxLength={MAX_SUPERVISOR_NAME_LENGTH}
          required
          aria-label="Supervisor name"
          placeholder="Supervisor name"
          className={inputClass}
        />
        <AddButton />
      </form>
      {addState.error && <p className="mt-1 text-xs font-medium text-red-600">{addState.error}</p>}
    </section>
  )
}
