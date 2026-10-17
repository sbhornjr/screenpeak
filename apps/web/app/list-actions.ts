'use server'

import { requireUser } from '@/lib/auth'
import { likeList, unlikeList, addGameToList, removeGameFromList, syncListGames, createList, updateList, setListPinned, createListWithGame } from '@/lib/queries/list'

type ListFields = {
    name: string
    description: string
    isPublic: boolean
    isPinned: boolean
}

export async function toggleListLike(listId: string, liked: boolean) {
    const user = await requireUser()
    return liked ? unlikeList(listId, user.id) : likeList(listId, user.id)
}

export async function toggleGameInList(listId: string, gameId: string, alreadyInList: boolean) {
    const user = await requireUser()
    return alreadyInList ? removeGameFromList(listId, gameId, user.id) : addGameToList(listId, gameId, user.id)
}

export async function removeGameFromListAction(listId: string, gameId: string) {
    const user = await requireUser()
    return removeGameFromList(listId, gameId, user.id)
}

export async function syncListGamesAction(listId: string, entries: { toAdd: { id: string }[], toRemove: { id: string }[] }) {
    const user = await requireUser()
    return syncListGames(listId, entries, user.id)
}

export async function createOrUpdateList(fields: ListFields, existingListId?: string) {
    const user = await requireUser()
    return existingListId ? updateList(existingListId, fields, user.id) : createList(user.id, fields)
}

export async function createListAndAddGame(gameId: string, fields: ListFields) {
    const user = await requireUser()
    const { error } = await createListWithGame(user.id, gameId, fields)
    return { error }
}

export async function toggleListPinned(listId: string | number, pinned: boolean) {
    const user = await requireUser()
    return setListPinned(listId, pinned, user.id)
}
