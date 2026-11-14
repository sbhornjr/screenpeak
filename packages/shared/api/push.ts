export type PushTokenPlatform = 'ios' | 'android'

/** POST /api/v1/me/push-token */
export type PushTokenRegisterRequest = {
    token: string
    platform: PushTokenPlatform
}

/** DELETE /api/v1/me/push-token */
export type PushTokenUnregisterRequest = {
    token: string
}
