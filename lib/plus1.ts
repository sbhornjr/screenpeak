/**
 * Fire the +1 tic — ScreenPeak's signature interaction. `Plus1Layer` (mounted once in
 * the root layout) listens for this event and floats a "+1 LABEL" chip up the
 * screen like XP gain.
 *
 * Fire it only when the user adds a NEW entry to their own save file — a
 * durable, first-time write. Stay silent on edits-in-place, removals, and
 * anything about other people. Labels are short past-tense verbs, uppercased
 * by the layer: SAVED, COMPLETED, RATED, LISTED, NEW LIST, FAVORITED.
 */
export function plus1(label?: string, n = 1) {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("screenpeak:plus1", { detail: { label, n } }))
}
