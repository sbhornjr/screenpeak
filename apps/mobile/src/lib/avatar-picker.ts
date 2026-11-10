import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { launchImageLibraryAsync } from 'expo-image-picker'

import { api } from './api'
import { AVATAR_PIXELS, type AvatarSteps } from './avatar-upload'

// The device side of a photo change. The library needs no permission prompt
// to pick a photo; iOS crops to a square in the picker, and the resize makes
// sure of it on Android and the web.
export const avatarSteps: AvatarSteps = {
  async pick() {
    const result = await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 1 })
    const asset = result.canceled ? null : result.assets[0]
    return asset ? { uri: asset.uri } : null
  },
  async shrink(uri) {
    const rendered = await ImageManipulator.manipulate(uri).resize({ width: AVATAR_PIXELS, height: AVATAR_PIXELS }).renderAsync()
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
    return saved.uri
  },
  async read(uri) {
    const response = await fetch(uri)
    return response.blob()
  },
  presign: body => api.me.avatarUploadUrl(body),
  async put(url, body, contentType) {
    const response = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } })
    return response.ok
  },
  save: url => api.me.saveAvatar({ url }),
}
