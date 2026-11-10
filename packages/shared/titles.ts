// The titles a player can pick: the fixed genre titles, then "#1 <name> Fan"
// for each favorite game and top developer. The website and the phone both use it.
export function getTitles({ topGames, topDevelopers } : { topGames: string[], topDevelopers: string[] }) {

    const genreTitles = [
        "Platforming Prodigy",
        "Indie Informant",
        "Speed Racer",
        "Advanced Adventurer",
        "Fighting Phenom",
        "Parasocial Puzzler",
        "Action Addict",
        "Simulation Sampler",
        "Sports All-Star",
        "Scheming Strategist",
        "Sharp Shooter",
        "Massively Online Monster",
        "Arcade Archivist",
        "Role-Playing Guru",
        "Metroidvania Mapper",
        "Roguelike Revisionist",
        "Deckbuilding Collector",
        "Soulslike Sicko"
    ]

    const gameTitles = topGames.map(g => `#1 ${g} Fan`)

    const developerTitles = topDevelopers.map(d => `#1 ${d} Fan`)

    return [...genreTitles, ...gameTitles, ...developerTitles]
}