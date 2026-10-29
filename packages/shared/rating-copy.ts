// The sentence under the score picker, on the website and the phone.
// Dependency-free so the phone bundle can import it.

const RATING_LABELS: Record<number, string> = {
    1: "Might be the worst game I've ever played.",
    2: 'It was really really bad.',
    3: "I didn't really like it.",
    4: "I couldn't get into it.",
    5: 'Meh. It was fine.',
    6: 'It was alright.',
    7: 'Pretty solid game.',
    8: 'This game was really good.',
    9: 'Incredible game.',
    10: "Might be the best game I've ever played.",
}

/** Empty for anything that is not a whole score from 1 to 10. */
export function ratingLabel(score: number): string {
    return RATING_LABELS[score] ?? ''
}
