const RAWG_KEY = process.env.RAWG_API_KEY!

async function main() {
    const res = await fetch(
        `https://api.rawg.io/api/games/the-witcher-3-wild-hunt?key=${RAWG_KEY}`
    )
    const data = await res.json()
    // Print the first game's full shape
    console.log(JSON.stringify(data, null, 2))
}

main()